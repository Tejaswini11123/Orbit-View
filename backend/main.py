import os
import time
from fastapi import FastAPI, Query, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from orbit_predictor import calculate_pass_trajectory
from satnogs_api import get_online_stations, fetch_observation_audio
from apt_decoder import decode_apt_audio

app = FastAPI(title="Orbit-View Genuine Satellite Ground Station API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("data/images", exist_ok=True)
os.makedirs("data/audio", exist_ok=True)
os.makedirs("data/tles", exist_ok=True)

app.mount("/images", StaticFiles(directory="data/images"), name="images")

@app.get("/")
def root():
    return {"status": "online", "engine": "Orbit-View v4.0 (100% Genuine)", "docs": "/docs"}

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)

@app.get("/api/stations")
def api_get_stations():
    return get_online_stations()[:25]

@app.get("/api/passes")
def api_get_passes(
    sat_id: int = Query(33591),
    lat: float = Query(17.3850),
    lon: float = Query(78.4867),
    alt: float = Query(540.0),
    freq: float = Query(137.100)
):
    result = calculate_pass_trajectory(sat_id, lat, lon, alt, freq)
    return {
        "satellite_id": sat_id,
        "tle": result["tle"],
        "live_now": result["live_now"],
        "passes": result["passes"]
    }

@app.post("/api/process-pass")
def api_process_pass(
    sat_id: int = Query(33591),
    station_id: int = Query(None),
    lat: float = Query(17.3850),
    lon: float = Query(78.4867),
    station_name: str = Query("Hyderabad Ground Node (IN)")
):
    obs_data = fetch_observation_audio(sat_id, station_id, lat=lat, lon=lon)
    filename = f"real_swath_{sat_id}_{int(time.time())}.png"

    decode_result = decode_apt_audio(
        audio_path=None,
        output_filename=filename,
        sat_id=sat_id,
        obs_id=obs_data["observation_id"],
        lat=lat,
        lon=lon,
        station_name=station_name,
        capture_utc=obs_data.get("capture_start_utc"),
        real_satnogs_url=obs_data.get("real_satnogs_image_url")
    )

    if decode_result.get("status") != "success":
        return {
            "observation": obs_data,
            "decode": decode_result,
            "image_url": None
        }

    return {
        "observation": obs_data,
        "decode": decode_result,
        "image_url": f"/images/{filename}"
    }