
from fastapi import FastAPI

app = FastAPI(title="Orbit View API")


@app.get("/")
def home():
    return {
        "project": "Orbit View",
        "message": "Backend is running!",
        "status": "success"
    }


@app.get("/api/satellite")
def satellite():
    # Temporary sample data for testing.
    # These values are NOT live satellite measurements.
    return {
        "name": "NOAA 19",
        "azimuth": 145.0,
        "elevation": 35.0,
        "status": "sample data"
    }

