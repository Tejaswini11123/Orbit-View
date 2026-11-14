from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from orbit_predictor import get_position, predict_passes
from satnogs_api import get_observations

app = FastAPI(
    title="Orbit View API",
    description="Satellite tracking and observation information for the Orbit View project.",
    version="1.0.0",
)

# Allows the React development server to call this backend.
# Add your deployed frontend domain here when you deploy the project.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NORAD catalog IDs. These are examples for tracking, not a promise
# that every satellite has an available recording on SatNOGS.
SATELLITES = [
    {
        "norad_id": 25544,
        "name": "ISS (ZARYA)",
        "category": "Space station",
        "description": "International Space Station",
    },
    {
        "norad_id": 43013,
        "name": "NOAA 20 (JPSS-1)",
        "category": "Weather satellite",
        "description": "Weather and Earth-observation satellite",
    },
    {
        "norad_id": 54234,
        "name": "NOAA 21 (JPSS-2)",
        "category": "Weather satellite",
        "description": "Weather and Earth-observation satellite",
    },
]


@app.get("/")
def home():
    return {
        "project": "Orbit View",
        "message": "Backend is running!",
        "status": "success",
    }


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "Orbit View API"}


@app.get("/api/satellites")
def list_satellites():
    return {"count": len(SATELLITES), "satellites": SATELLITES}


def check_satellite_id(norad_id: int):
    if norad_id <= 0:
        raise HTTPException(status_code=400, detail="NORAD ID must be a positive number.")


@app.get("/api/satellite/{norad_id}/position")
def satellite_position(
    norad_id: int,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    check_satellite_id(norad_id)
    try:
        result = get_position(norad_id, latitude, longitude)
        return {"status": "success", "position": result}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not calculate satellite position: {exc}",
        )


@app.get("/api/satellite/{norad_id}/passes")
def satellite_passes(
    norad_id: int,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    hours: int = Query(24, ge=1, le=48),
    minimum_elevation: float = Query(10, ge=0, le=90),
):
    check_satellite_id(norad_id)
    try:
        passes = predict_passes(
            norad_id= norad_id,
            latitude=latitude,
            longitude=longitude,
            hours=hours,
            minimum_elevation=minimum_elevation,
        )
        return {
            "status": "success",
            "norad_id": norad_id,
            "hours_checked": hours,
            "count": len(passes),
            "passes": passes,
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not predict satellite passes: {exc}",
        )


@app.get("/api/satellite/{norad_id}/observations")
def satellite_observations(
    norad_id: int,
    limit: int = Query(10, ge=1, le=50),
):
    check_satellite_id(norad_id)
    try:
        observations = get_observations(norad_id, limit)
        return {
            "status": "success",
            "norad_id": norad_id,
            "count": len(observations),
            "observations": observations,
            "note": "Availability and recording links depend on what SatNOGS has published.",
        }
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not retrieve SatNOGS observations: {exc}",
        )
