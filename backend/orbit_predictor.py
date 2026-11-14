from datetime import datetime, timedelta, timezone
import os
import math
import requests
from skyfield.api import EarthSatellite, Loader, Topos, wgs84

os.makedirs("data/tles", exist_ok=True)
load = Loader("data/tles")

def get_satellite_by_id(sat_norad_id: int, ts):
    tle_path = f"data/tles/{sat_norad_id}.tle"
    lines = []

    # 1. Fetch live TLE directly from CelesTrak GP API
    try:
        url = f"https://celestrak.org/NORAD/elements/gp.php?CATNR={sat_norad_id}&FORMAT=tle"
        headers = {"User-Agent": "OrbitView-GroundStation/4.0"}
        res = requests.get(url, headers=headers, timeout=6)
        if res.status_code == 200 and len(res.text.strip().splitlines()) >= 2:
            lines = [l.strip() for l in res.text.strip().splitlines() if l.strip()]
            with open(tle_path, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
    except Exception:
        pass

    # 2. Use cached real TLE from disk if CelesTrak rate-limits
    if not lines and os.path.exists(tle_path):
        with open(tle_path, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f.read().splitlines() if l.strip()]

    if len(lines) >= 3:
        return EarthSatellite(lines[1], lines[2], lines[0], ts), lines
    elif len(lines) == 2:
        return EarthSatellite(lines[0], lines[1], f"NORAD-{sat_norad_id}", ts), [f"NORAD-{sat_norad_id}", lines[0], lines[1]]
    return None, []

def compute_point_telemetry(satellite, observer, ts, dt_utc: datetime, dt_prev_utc: datetime, center_freq_mhz: float):
    """Computes 100% genuine SGP4 topocentric & geocentric physics at exact timestamp dt_utc."""
    c_km_s = 299792.458
    freq_hz = center_freq_mhz * 1e6

    t_sky = ts.from_datetime(dt_utc)
    t_prev = ts.from_datetime(dt_prev_utc)

    geocentric = satellite.at(t_sky)
    subpoint = wgs84.subpoint(geocentric)

    diff_now = (satellite - observer).at(t_sky)
    diff_prev = (satellite - observer).at(t_prev)

    alt_deg, az_deg, dist_now = diff_now.altaz()
    _, _, dist_prev = diff_prev.altaz()

    dt_sec = max(0.1, (dt_utc - dt_prev_utc).total_seconds())
    r_km = dist_now.km
    range_rate_kms = (r_km - dist_prev.km) / dt_sec

    doppler_hz = -(range_rate_kms / c_km_s) * freq_hz
    fspl_db = 20.0 * math.log10(max(1.0, r_km)) + 20.0 * math.log10(max(1.0, center_freq_mhz)) + 32.44

    return {
        "timestamp": dt_utc.isoformat(),
        "azimuth": round(az_deg.degrees, 2),
        "elevation": round(alt_deg.degrees, 2),  # Can be negative when below horizon (100% real)
        "range_km": round(r_km, 2),
        "range_rate_kms": round(range_rate_kms, 3),
        "doppler_hz": round(doppler_hz, 1),
        "rx_freq_mhz": round((freq_hz + doppler_hz) / 1e6, 6),
        "fspl_db": round(fspl_db, 1),
        "sat_lat": round(subpoint.latitude.degrees, 4),
        "sat_lon": round(subpoint.longitude.degrees, 4),
        "sat_alt_km": round(subpoint.elevation.km, 1),
        "is_above_horizon": bool(alt_deg.degrees > 0.0)
    }

def calculate_pass_trajectory(sat_norad_id: int, lat: float, lon: float, alt: float = 500.0, center_freq_mhz: float = 137.1):
    ts = load.timescale()
    satellite, tle_lines = get_satellite_by_id(sat_norad_id, ts)
    if satellite is None:
        return {"tle": [], "live_now": None, "passes": []}

    observer = Topos(latitude_degrees=lat, longitude_degrees=lon, elevation_m=alt)
    now_utc = datetime.now(timezone.utc)

    # 1. Calculate 100% real instantaneous satellite position RIGHT NOW
    live_now = compute_point_telemetry(
        satellite, observer, ts,
        now_utc, now_utc - timedelta(seconds=1),
        center_freq_mhz
    )

    # 2. Calculate all upcoming passes over the next 24 hours
    t0 = ts.from_datetime(now_utc)
    t1 = ts.from_datetime(now_utc + timedelta(hours=24))
    t, events = satellite.find_events(observer, t0, t1, altitude_degrees=5.0)

    passes = []
    i = 0
    step_sec = 5
    while i < len(events) - 2:
        if events[i] == 0 and events[i + 1] == 1 and events[i + 2] == 2:
            aos = t[i].utc_datetime()
            tca = t[i + 1].utc_datetime()
            los = t[i + 2].utc_datetime()

            trajectory = []
            max_el = 0.0
            curr = aos
            while curr <= los:
                pt = compute_point_telemetry(
                    satellite, observer, ts,
                    curr, curr - timedelta(seconds=step_sec),
                    center_freq_mhz
                )
                if pt["elevation"] > max_el:
                    max_el = pt["elevation"]
                trajectory.append(pt)
                curr += timedelta(seconds=step_sec)

            passes.append({
                "aos": aos.isoformat(),
                "tca": tca.isoformat(),
                "los": los.isoformat(),
                "max_elevation": round(max_el, 1),
                "duration_sec": int((los - aos).total_seconds()),
                "trajectory": trajectory
            })
            i += 3
        else:
            i += 1

    return {
        "tle": tle_lines,
        "live_now": live_now,
        "passes": passes
    }