from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.profile import IdentityPreferences, ProfilePhoto, SportProfile, UserProfile
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.profile import (
    IdentityPreferencesCreate,
    IdentityPreferencesResponse,
    ProfilePhotosResponse,
    SportProfileCreate,
    SportProfileResponse,
    UserProfileCreate,
    UserProfileResponse,
)
from app.services import media_storage

PROFILE_PHOTO_MIN = 2
PROFILE_PHOTO_MAX = 4

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/profile", response_model=UserProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    result = await db.execute(
        select(UserProfile).options(selectinload(UserProfile.photos)).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@router.put("/me/profile", response_model=UserProfileResponse)
async def upsert_profile(
    body: UserProfileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    result = await db.execute(
        select(UserProfile).options(selectinload(UserProfile.photos)).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = UserProfile(user_id=current_user.id, **body.model_dump())
        db.add(profile)
    else:
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)

    await db.commit()
    # Re-fetch with the photos relationship eagerly loaded so the response
    # serialization does not trigger a lazy load on the async session.
    refreshed = await db.execute(
        select(UserProfile).options(selectinload(UserProfile.photos)).where(UserProfile.user_id == current_user.id)
    )
    return refreshed.scalar_one()


@router.get("/me/identity-preferences", response_model=IdentityPreferencesResponse)
async def get_identity_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IdentityPreferences:
    result = await db.execute(select(IdentityPreferences).where(IdentityPreferences.user_id == current_user.id))
    prefs = result.scalar_one_or_none()
    if prefs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preferences not found")
    return prefs


@router.put("/me/identity-preferences", response_model=IdentityPreferencesResponse)
async def upsert_identity_preferences(
    body: IdentityPreferencesCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IdentityPreferences:
    result = await db.execute(select(IdentityPreferences).where(IdentityPreferences.user_id == current_user.id))
    prefs = result.scalar_one_or_none()

    if prefs is None:
        prefs = IdentityPreferences(user_id=current_user.id, **body.model_dump())
        db.add(prefs)
    else:
        for field, value in body.model_dump().items():
            setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)
    return prefs


@router.get("/me/sport-profiles", response_model=list[SportProfileResponse])
async def get_sport_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SportProfile]:
    result = await db.execute(select(SportProfile).where(SportProfile.user_id == current_user.id))
    return list(result.scalars().all())


@router.post(
    "/me/sport-profiles",
    response_model=SportProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_sport_profile(
    body: SportProfileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SportProfile:
    result = await db.execute(
        select(SportProfile).where(
            SportProfile.user_id == current_user.id,
            SportProfile.sport == body.sport,
        )
    )
    sp = result.scalar_one_or_none()

    if sp is None:
        sp = SportProfile(user_id=current_user.id, **body.model_dump())
        db.add(sp)
    else:
        for field, value in body.model_dump().items():
            setattr(sp, field, value)

    await db.commit()
    await db.refresh(sp)
    return sp


@router.put("/me/photos", response_model=ProfilePhotosResponse)
async def replace_profile_photos(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfilePhotosResponse:
    """Replace the current user's profile photos.

    Accepts 2-4 non-empty multipart files. The uploads are written to local
    media storage first; then, in one transaction, the profile's photo rows
    are replaced in upload order and ``avatar_url`` is synced to the first
    photo URL so existing avatar consumers keep working. The replaced rows'
    files are deleted only after that commit, so a failed upload or commit
    leaves the previous photos, rows and ``avatar_url`` in place (a failed
    commit may leave the new files on disk, unreferenced).
    """
    if not (PROFILE_PHOTO_MIN <= len(files) <= PROFILE_PHOTO_MAX):
        raise HTTPException(
            status_code=422,
            detail=f"Must upload {PROFILE_PHOTO_MIN}-{PROFILE_PHOTO_MAX} photos",
        )
    if any(media_storage.is_empty(upload) for upload in files):
        raise HTTPException(status_code=422, detail="Photos must not be empty")

    # Read once: a rollback below expires current_user along with the session.
    user_id = current_user.id

    # The row lock serialises concurrent replaces for one profile (PostgreSQL;
    # SQLite ignores it), so each request deletes only the photos it replaced.
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id).with_for_update())
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    previous_urls = list(
        (await db.execute(select(ProfilePhoto.photo_url).where(ProfilePhoto.profile_id == profile.id))).scalars()
    )

    urls = media_storage.save_user_photos(user_id, files)

    try:
        await db.execute(delete(ProfilePhoto).where(ProfilePhoto.profile_id == profile.id))
        new_photos = [
            ProfilePhoto(profile_id=profile.id, photo_url=url, position=index) for index, url in enumerate(urls)
        ]
        db.add_all(new_photos)
        profile.avatar_url = urls[0]
        await db.flush()
        # Snapshot the response while the row lock is held: once committed, a
        # newer replace may delete these rows before this request returns.
        response = ProfilePhotosResponse(photos=new_photos, avatar_url=profile.avatar_url)
    except Exception:
        await db.rollback()
        media_storage.delete_user_photos(user_id, urls)
        raise
    # A commit that raises may still have landed (e.g. the connection dropped
    # before the reply), so the new files are not deleted on that path: at
    # worst they are left unreferenced, never referenced and missing.
    await db.commit()

    media_storage.delete_user_photos(user_id, previous_urls)
    return response


@router.delete("/me/sport-profiles/{sport}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sport_profile(
    sport: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(SportProfile).where(
            SportProfile.user_id == current_user.id,
            SportProfile.sport == sport,
        )
    )
    sp = result.scalar_one_or_none()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sport profile not found")
    await db.delete(sp)
    await db.commit()
