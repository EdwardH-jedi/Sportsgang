"""
Small geo helpers shared by discovery, crews and group runs.

Everything here is dialect-agnostic on purpose: callers pre-filter in
SQL with a plain lat/lng bounding box (works on Postgres and on the
SQLite test database alike) and then compute exact great-circle
distances in Python with :func:`haversine_km`.

Privacy rules live here too so every surface applies them the same way:

* A person's home location is stored rounded to
  :data:`HOME_COORD_DECIMALS` decimal places (~1 km) and is never
  returned to other users.
* Distances derived from a home location are reported coarsely via
  :func:`coarse_distance_km` (rounded up to the next 0.5 km, minimum
  1 km) so repeated queries from different points cannot trilaterate
  someone's exact position.
"""

from __future__ import annotations

import math

from fastapi import HTTPException, status

EARTH_RADIUS_KM = 6371.0088

# ~1.1 km of latitude. Coarse enough that a stored "home" is an area,
# not an address.
HOME_COORD_DECIMALS = 2

# Public meeting points (group runs) are not private, but there is no
# value in storing more than ~1 m of precision.
MEETING_COORD_DECIMALS = 5

DEFAULT_RADIUS_KM = 10.0
MAX_RADIUS_KM = 50.0
MIN_RADIUS_KM = 1.0

_KM_PER_DEGREE_LAT = 111.32


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two lat/lng points in kilometres."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def round_coord(value: float | None, decimals: int) -> float | None:
    if value is None:
        return None
    return round(float(value), decimals)


def coarse_distance_km(km: float) -> float:
    """Round a distance up to the next 0.5 km, never below 1.0 km."""
    return max(1.0, math.ceil(km * 2 - 1e-9) / 2)


def bounding_box(lat: float, lng: float, radius_km: float) -> tuple[float, float, float | None, float | None]:
    """
    Return ``(min_lat, max_lat, min_lng, max_lng)`` enclosing a circle of
    ``radius_km`` around the point. The box is a cheap, index-friendly
    SQL prefilter; callers still apply the exact haversine check.

    ``min_lng`` / ``max_lng`` are ``None`` when the box would cross the
    antimeridian or reach a pole — the longitude prefilter is skipped in
    that (rare) case rather than handling wrap-around.
    """
    # Pad slightly so points on the rim survive float noise.
    padded = radius_km * 1.01
    dlat = padded / _KM_PER_DEGREE_LAT
    min_lat = max(-90.0, lat - dlat)
    max_lat = min(90.0, lat + dlat)
    cos_lat = math.cos(math.radians(lat))
    if cos_lat < 0.01 or min_lat <= -90.0 or max_lat >= 90.0:
        return min_lat, max_lat, None, None
    dlng = padded / (_KM_PER_DEGREE_LAT * cos_lat)
    min_lng = lng - dlng
    max_lng = lng + dlng
    if min_lng < -180.0 or max_lng > 180.0:
        return min_lat, max_lat, None, None
    return min_lat, max_lat, min_lng, max_lng


def bbox_filter(lat_col, lng_col, lat: float, lng: float, radius_km: float) -> list:
    """SQLAlchemy predicates for :func:`bounding_box` on a lat/lng column pair."""
    min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, radius_km)
    clauses = [lat_col.is_not(None), lng_col.is_not(None), lat_col >= min_lat, lat_col <= max_lat]
    if min_lng is not None and max_lng is not None:
        clauses.extend([lng_col >= min_lng, lng_col <= max_lng])
    return clauses


def require_lat_lng_pair(lat: float | None, lng: float | None) -> bool:
    """
    Validate an optional ``lat``/``lng`` query pair. Returns True when a
    geo filter is requested, False when neither is supplied, and raises
    422 when only one of the two is present.
    """
    if (lat is None) != (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="lat and lng must be provided together",
        )
    return lat is not None
