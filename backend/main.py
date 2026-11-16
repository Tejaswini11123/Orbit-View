import os
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from orbit_predictor import get_upcoming_passes
from satnogs_api import get_active_ground_stations, fetch_latest_observation_audio
from apt_decoder import decode_apt_audio

app = FastAPI(title="Orbit-View Satellite Telemetry & EOSDIS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("data/images", exist_ok=True)
app.mount("/images", StaticFiles(directory="data/images"), name="images")

@app.get("/api/stations")
def api_stations():
    return get_active_ground_stations()

@app.get("/api/passes")
def api_passes(
    sat_id: int = Query(33591),
    lat: float = Query(17.3850),
    lon: float = Query(78.4867),
    alt: float = Query(540.0),
    freq: float = Query(137.100)
):
    return get_upcoming_passes(
        sat_id=sat_id,
        lat=lat,
        lon=lon,
        alt_m=alt,
        hours=24,
        base_freq_mhz=freq
    )

@app.post("/api/process-pass")
def api_process_pass(
    sat_id: int = Query(33591),
    lat: float = Query(17.3850),
    lon: float = Query(78.4867),
    station_name: str = Query("Hyderabad Ground Node")
):
    obs_meta = fetch_latest_observation_audio(sat_id=sat_id)
    out_filename = f"swath_{sat_id}_{int(abs(lat)*10)}_{int(abs(lon)*10)}.png"

    decode_res = decode_apt_audio(
        audio_path=obs_meta.get("audio_path", ""),
        output_filename=out_filename,
        sat_id=sat_id,
        obs_id=obs_meta.get("obs_id", "LIVE"),
        lat=lat,
        lon=lon,
        station_name=station_name,
        capture_utc=obs_meta.get("capture_utc"),
        real_satnogs_url=obs_meta.get("real_satnogs_image")
    )

    image_url = f"/images/{out_filename}?t={os.urandom(4).hex()}" if decode_res.get("status") == "success" else None

    return {
        "observation": obs_meta,
        "decode": decode_res,
        "image_url": image_url
    }