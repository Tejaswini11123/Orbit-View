from datetime import datetime, timedelta, timezone

import requests
from skyfield.api import EarthSatellite, load, wgs84

CELESTRAK_URL = (
    "https://celestrak.org/NORAD/elements/gp.php"
    "?CATNR={norad_id}&FORMAT=tle"
)

# Reuse downloaded TLE data during this run so we do not request it
# from CelesTrak for every dashboard refresh.
_TLE_CACHE = {}
_CACHE_SECONDS = 30 * 60

# Skyfield's built-in time data avoids a separate timescale download.
_TIMESCALE = load.timescale(builtin=True)


def get_satellite(norad_id: int):
    """Download a satellite's latest available TLE and create a Skyfield object."""
    now = datetime.now(timezone.utc)
    cached = _TLE_CACHE.get(norad_id)

    if cached and (now - cached["downloaded_at"]).total_seconds() < _CACHE_SECONDS:
        return cached["satellite"]

    url = CELESTRAK_URL.format(norad_id=norad_id)

    try:
        response = requests.get(url, timeout=20)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValueError(f"Could not download orbital data from CelesTrak: {exc}")

    lines = [line.strip() for line in response.text.splitlines() if line.strip()]

    if len(lines) < 3 or not lines[1].startswith("1 ") or not lines[2].startswith("2 "):
        raise ValueError(
            f"No valid TLE data was returned for NORAD ID {norad_id}."
        )

    satellite = EarthSatellite(lines[1], lines[2], lines[0], _TIMESCALE)

    _TLE_CACHE[norad_id] = {
        "satellite": satellite,
        "downloaded_at": now,
    }
    return satellite


def get_position(norad_id: int, latitude: float, longitude: float):
    """Calculate the satellite's current position relative to an observer."""
    satellite = get_satellite(norad_id)
    observer = wgs84.latlon(latitude_degrees=latitude, longitude_degrees=longitude)

    now = datetime.now(timezone.utc)
    skyfield_time = _TIMESCALE.from_datetime(now)

    # Topocentric position: satellite position as seen from the observer.
    difference = satellite - observer
    topocentric = difference.at(skyfield_time)
    altitude, azimuth, distance = topocentric.altaz()

    # Geographic point directly below the satellite.
    subpoint = satellite.at(skyfield_time).subpoint()

    return {
        "norad_id": norad_id,
        "satellite_name": satellite.name,
        "timestamp_utc": now.isoformat(),
        "latitude": round(subpoint.latitude.degrees, 4),
        "longitude": round(subpoint.longitude.degrees, 4),
        "altitude_km": round(subpoint.elevation.km, 2),
        "azimuth_deg": round(azimuth.degrees % 360, 2),
        "elevation_deg": round(altitude.degrees, 2),
        "distance_km": round(distance.km, 2),
        "is_visible": altitude.degrees > 0,
    }


def predict_passes(
    norad_id: int,
    latitude: float,
    longitude: float,
    hours: int = 24,
    minimum_elevation: float = 10,
):
    """Find complete rise, culmination and set events over the requested period."""
    satellite = get_satellite(norad_id)
    observer = wgs84.latlon(latitude_degrees=latitude, longitude_degrees=longitude)

    start = datetime.now(timezone.utc)
    end = start + timedelta(hours=hours)

    t0 = _TIMESCALE.from_datetime(start)
    t1 = _TIMESCALE.from_datetime(end)

    times, events = satellite.find_events(
        observer,
        t0,
        t1,
        altitude_degrees=minimum_elevation,
    )

    event_names = {
        0: "rise",
        1: "culmination",
        2: "set",
    }

    results = []
    current_pass = None

    for event_time, event_code in zip(times, events):
        event_name = event_names[int(event_code)]
        event_datetime = event_time.utc_datetime().replace(tzinfo=timezone.utc)

        if event_name == "rise":
            current_pass = {
                "rise_utc": event_datetime.isoformat(),
                "maximum_elevation_deg": None,
                "culmination_utc": None,
            }

        elif event_name == "culmination" and current_pass is not None:
            difference = satellite - observer
            altitude, _, _ = difference.at(event_time).altaz()
            current_pass["maximum_elevation_deg"] = round(
                altitude.degrees, 2
            )
            current_pass["culmination_utc"] = event_datetime.isoformat()

        elif event_name == "set" and current_pass is not None:
            current_pass["set_utc"] = event_datetime.isoformat()
            results.append(current_pass)
            current_pass = None

    return results
