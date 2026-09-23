from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.schemas.venues import NearbyVenuesResponse, PlaceDetailsResponse
from app.services import places as places_service
from app.services import venues as venues_service

router = APIRouter(prefix="/venues", tags=["venues"])


# Per-IP cap on /venues/nearby.
#
# Why a cap is needed: picker open, every debounced keystroke in the
# search box, every radius chip tap, and every Load More can all hit
# this route — and source="both" / source="places" fan out into paid
# Google Places (New) calls server-side. Even with the 30-minute
# search-response cache (places.py:_CACHE_TTL_SECONDS) and 2dp lat/lng
# bucketing, an abusive client (or a stuck mobile retry loop) could
# burn quota fast.
#
# 60/min/IP leaves comfortable headroom for a real picker session
# (open + ~10 search keystrokes + 2-3 radius / load-more taps ≈ 15
# requests per use, well below the cap) while still cutting off the
# pathological case. slowapi keys on the remote address, so a single
# device == a single bucket.
_NEARBY_RATE_LIMIT = "60/minute"

# Tighter cap on Place Details — it's a heavier SKU bracket and is only
# ever a single tap per venue selection. The picker should never need
# more than this in a minute.
_DETAILS_RATE_LIMIT = "30/minute"


@router.get("/nearby", response_model=NearbyVenuesResponse)
@limiter.limit(_NEARBY_RATE_LIMIT)
async def get_nearby_venues(
    request: Request,
    sport: str = Query(
        ...,
        description=("Sport filter, e.g. tennis|basketball|badminton|soccer|football|running|gym|golf"),
    ),
    lat: float | None = Query(None, ge=-90.0, le=90.0),
    lng: float | None = Query(None, ge=-180.0, le=180.0),
    # Radius applies only when both lat and lng are supplied; the service
    # silently ignores it in the no-coordinate catalog fallback path.
    radius_km: float = Query(10.0, ge=1.0, le=50.0),
    limit: int = Query(20, ge=1, le=50),
    # v1.1: source selector. Default "seed" preserves v1.0 wire shape
    # exactly. FastAPI's Literal-typed Query validates and returns 422
    # for any other value.
    source: Literal["seed", "places", "both"] = Query(
        "seed",
        description="Venue source: seed | places | both (default seed)",
    ),
    q: str | None = Query(
        None,
        min_length=1,
        max_length=80,
        description="Optional free-text Places search override, e.g. 'indoor basketball court'",
    ),
    cursor: str | None = Query(
        None,
        min_length=1,
        description="Opaque next_cursor returned from a previous /venues/nearby response",
    ),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NearbyVenuesResponse:
    if (lat is None) != (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="lat and lng must be provided together",
        )
    return await venues_service.list_nearby_venues(
        db=db,
        sport=sport,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
        limit=limit,
        source=source,
        q=q,
        cursor=cursor,
    )


@router.get(
    "/places/{place_id:path}",
    response_model=PlaceDetailsResponse,
    summary="Lazy-load Google Place Details for one selected place",
)
@limiter.limit(_DETAILS_RATE_LIMIT)
async def get_place_details(
    request: Request,
    place_id: str = Path(
        ...,
        min_length=1,
        max_length=255,
        description=(
            "Google Places id, e.g. 'ChIJ…' or the fully-qualified "
            "'places/ChIJ…' resource name. The route normalises either form."
        ),
    ),
    _user=Depends(get_current_user),
) -> PlaceDetailsResponse:
    """Fetch Place Details for a single Places-sourced venue.

    Called from mobile only when the user opens / selects a venue whose
    ``source == "google_places"``. Never invoked for list/search results
    — that path uses the search field mask (cheaper SKU bracket). Keep
    this endpoint behind authentication so the Places key isn't
    weaponisable from unauthenticated clients.

    Status mapping:
      * provider ``disabled``       → 503 (server-side key missing)
      * provider ``quota_exceeded`` → 503 (Google quota / billing issue)
      * provider ``error``          → 502 (timeout, non-2xx, malformed)
      * provider ``ok``             → 200 with normalised body
    """

    result = await places_service.fetch_place_details(place_id=place_id)
    if result.status == "disabled":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Places provider is not configured",
        )
    if result.status == "quota_exceeded":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Places quota exceeded",
        )
    if result.status != "ok" or result.details is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Places provider error",
        )

    details = result.details
    return PlaceDetailsResponse(
        place_id=details.place_id,
        name=details.name,
        latitude=details.latitude,
        longitude=details.longitude,
        address=details.address,
        types=list(details.types),
        primary_type=details.primary_type,
        google_maps_uri=details.google_maps_uri,
        website_uri=details.website_uri,
        national_phone_number=details.phone_national,
        international_phone_number=details.phone_international,
        business_status=details.business_status,
        rating=details.rating,
        user_rating_count=details.user_rating_count,
        opening_hours=list(details.opening_hours_weekday_text),
        attributions=list(details.attributions),
    )
