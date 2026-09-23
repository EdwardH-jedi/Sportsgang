# NOTE: Do NOT add `from __future__ import annotations` here.
#
# With it, every annotation becomes a string (ForwardRef). FastAPI
# 0.115 + Pydantic 2.10 + slowapi 0.1.9 cannot resolve a ForwardRef
# wrapped inside the slowapi `@limiter.limit` decorator: it builds a
# `TypeAdapter[Annotated[ForwardRef('RegisterRequest'), Body(...)]]`
# whose ForwardRef can never be resolved against the decorated
# function's globals, and every POST against /auth/register raises
# PydanticUserError ("class not fully defined") at request time.
# Eager annotations make `RegisterRequest` an actual class reference,
# which the rest of the stack handles correctly.

import logging
from uuid import UUID

import jwt
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.booking import Booking
from app.models.chat import Message
from app.models.google_calendar import CalendarBookingSync, GoogleCalendarToken
from app.models.match import DiscoveryAction, Match
from app.models.notification import NotificationEvent, PushToken
from app.models.profile import IdentityPreferences, SportProfile, UserProfile
from app.models.safety import Block, Report
from app.models.user import User
from app.schemas.auth import (
    AppleSignInRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services import crews as crews_service
from app.services.apple_auth import (
    AppleIdentityTokenError,
    apple_revocation_configured,
    exchange_authorization_code,
    revoke_refresh_token,
    verify_identity_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer()
_log = logging.getLogger(__name__)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        user_id: UUID = decode_access_token(token)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(
    request: Request,
    # Explicit Body(...) belt-and-braces against the slowapi @limiter.limit
    # wrapper. The header-level note above this module forbids
    # `from __future__ import annotations` (which would re-introduce the
    # ForwardRef failure that originally surfaced as
    # loc=["query","body"] 422 on /auth/register). Pinning `Body(...)`
    # here is unconditionally correct — there's no other reasonable way
    # to read RegisterRequest off the wire — and keeps the contract
    # robust even if someone re-adds the future-import by accident.
    body: RegisterRequest = Body(...),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    # Explicit Body(...) — see comment on register() above. This module
    # intentionally avoids `from __future__ import annotations`; pinning
    # Body() here is the belt-and-braces backstop.
    body: LoginRequest = Body(...),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    # Apple-only users have a NULL hashed_password and must not be able to
    # authenticate via the password endpoint.
    if user is None or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/apple", response_model=TokenResponse)
@limiter.limit("5/minute")
async def apple_sign_in(
    request: Request,
    # Explicit Body(...) — see comment on register() above. This module
    # intentionally avoids `from __future__ import annotations`; pinning
    # Body() here is the belt-and-braces backstop.
    body: AppleSignInRequest = Body(...),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    settings = get_settings()
    if not settings.apple_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Apple Sign-in is not configured",
        )

    try:
        claims = await verify_identity_token(
            body.identity_token,
            audience=settings.apple_client_id,
            nonce=body.nonce,
        )
    except AppleIdentityTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e

    apple_sub: str = claims["sub"]
    # Apple's identity token carries an `email` claim only on the user's
    # FIRST authorization for this app; subsequent sign-ins omit it. We use
    # this verified value for both account linking and account creation.
    # `body.email` is forwarded by the client for completeness but is
    # attacker-controlled and is never persisted or used for lookups.
    verified_email: str | None = claims.get("email")

    # 1) Look up by apple_sub — this is the durable identifier.
    result = await db.execute(select(User).where(User.apple_sub == apple_sub))
    user = result.scalar_one_or_none()

    # 2) Email-linking fallback: a user who previously registered with
    #    email/password and is now signing in with Apple gets their
    #    apple_sub attached so future Apple logins resolve to the same row.
    #    SECURITY: this lookup must use the *verified* token email only.
    #    Falling back to body.email here would let an attacker hijack any
    #    email/password account by submitting a forged email field on a
    #    first-ever Apple sign-in.
    if user is None and verified_email:
        result = await db.execute(select(User).where(User.email == verified_email))
        user = result.scalar_one_or_none()
        if user is not None:
            user.apple_sub = apple_sub

    # 3) New user — create a row. hashed_password is NULL for Apple-only users.
    #    SECURITY: new account creation requires the *verified* token email.
    #    body.email is attacker-controlled, so accepting it here would let a
    #    first-ever Apple sign-in mint accounts under arbitrary emails. Apple
    #    only omits the email claim for users who previously authorised the
    #    app and whose server row has since been removed; in that case the
    #    user can revoke at Settings → Apple ID → Apps Using Apple ID and
    #    re-sign-in so Apple re-issues a token containing the email claim.
    if user is None:
        if not verified_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Apple did not return a verified email. Revoke this app "
                    "in Settings → Apple ID → Apps Using Apple ID and try again."
                ),
            )
        user = User(email=verified_email, apple_sub=apple_sub, hashed_password=None)
        db.add(user)

    # Best-effort: exchange the one-time authorization code for a refresh token
    # and store it so account deletion can later revoke the user's Apple tokens
    # (App Store 5.1.1(v)). A failure here must NEVER block sign-in — the user
    # is already authenticated via the verified identity token. The loud warning
    # exists because a silent miss leaves the account with no revocable token.
    if body.authorization_code and apple_revocation_configured(settings):
        try:
            refresh_token = await exchange_authorization_code(body.authorization_code, settings=settings)
            if refresh_token:
                user.apple_refresh_token = refresh_token
        except Exception:  # noqa: BLE001 — best-effort enrichment, never fatal
            _log.warning(
                "Apple token exchange failed for sub=%s; account deletion cannot "
                "revoke this user's Apple tokens until a later sign-in succeeds.",
                apple_sub,
                exc_info=True,
            )

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Apple account conflicts with an existing user",
        ) from e

    await db.refresh(user)
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete the authenticated user and all data they own.

    Apple Guideline 5.1.1(v) — account deletion must be fully in-app. This
    performs a hard delete across every table that references ``users.id``.
    Child rows are removed explicitly (in dependency order) rather than
    relying on DB-level cascade, so the behaviour is identical regardless
    of dialect (Postgres in prod, SQLite in tests).

    For Sign in with Apple users we additionally revoke the stored Apple
    refresh token first — Apple requires apps that offer Sign in with Apple to
    revoke tokens on account deletion. Revocation is best-effort: a failure is
    logged but never aborts the deletion, so the user can always delete their
    account even during an Apple outage.
    """
    user_id = current_user.id

    # --- Sign in with Apple token revocation (best-effort, before delete) ---
    settings = get_settings()
    apple_refresh_token = current_user.apple_refresh_token
    if apple_refresh_token and apple_revocation_configured(settings):
        try:
            await revoke_refresh_token(apple_refresh_token, settings=settings)
        except Exception:  # noqa: BLE001 — revoke failure must not block deletion
            _log.warning(
                "Apple token revocation failed for user=%s during account "
                "deletion; continuing with local data deletion.",
                user_id,
                exc_info=True,
            )

    # Match IDs owned by this user — need them to scrub messages and booking syncs
    # that reference matches / bookings this user participates in.
    match_rows = await db.execute(select(Match.id).where((Match.user1_id == user_id) | (Match.user2_id == user_id)))
    match_ids = [row[0] for row in match_rows.all()]

    booking_rows = await db.execute(
        select(Booking.id).where((Booking.proposer_id == user_id) | (Booking.partner_id == user_id))
    )
    booking_ids = [row[0] for row in booking_rows.all()]

    # --- Notifications / push (leaves) ---------------------------------
    await db.execute(delete(NotificationEvent).where(NotificationEvent.user_id == user_id))
    await db.execute(delete(PushToken).where(PushToken.user_id == user_id))

    # --- Calendar integration ------------------------------------------
    await db.execute(delete(CalendarBookingSync).where(CalendarBookingSync.user_id == user_id))
    if booking_ids:
        await db.execute(delete(CalendarBookingSync).where(CalendarBookingSync.booking_id.in_(booking_ids)))
    await db.execute(delete(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id))

    # --- Chat / bookings / matches -------------------------------------
    if match_ids:
        await db.execute(delete(Message).where(Message.match_id.in_(match_ids)))
    await db.execute(delete(Message).where(Message.sender_id == user_id))

    if booking_ids:
        await db.execute(delete(Booking).where(Booking.id.in_(booking_ids)))

    if match_ids:
        await db.execute(delete(Match).where(Match.id.in_(match_ids)))

    await db.execute(
        delete(DiscoveryAction).where((DiscoveryAction.actor_id == user_id) | (DiscoveryAction.target_id == user_id))
    )

    # --- Safety --------------------------------------------------------
    await db.execute(delete(Report).where((Report.reporter_id == user_id) | (Report.reported_id == user_id)))
    await db.execute(delete(Block).where((Block.blocker_id == user_id) | (Block.blocked_id == user_id)))

    # --- Crews ----------------------------------------------------------
    # Hand ownership on (or dissolve sole-member crews) before the
    # membership rows go, so no crew is left without an owner.
    await crews_service.remove_user_from_crews(db, user_id)

    # --- Profile / sport data ------------------------------------------
    await db.execute(delete(SportProfile).where(SportProfile.user_id == user_id))
    await db.execute(delete(IdentityPreferences).where(IdentityPreferences.user_id == user_id))
    await db.execute(delete(UserProfile).where(UserProfile.user_id == user_id))

    # --- Finally, the user row -----------------------------------------
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    return None
