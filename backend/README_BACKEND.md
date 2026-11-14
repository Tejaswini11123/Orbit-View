# Orbit View - Backend

## Files
- `main.py`: FastAPI routes
- `orbit_predictor.py`: CelesTrak TLE download, position and pass calculations
- `satnogs_api.py`: SatNOGS observation metadata lookup
- `requirements.txt`: Python dependencies

## Install
From the `backend` folder, activate your project's virtual environment, then run:

```bash
pip install -r requirements.txt
```

## Run
From the `backend` folder:

```bash
python -m uvicorn main:app --reload
```

Open:
- http://127.0.0.1:8000/
- http://127.0.0.1:8000/docs

## API endpoints

- `GET /api/health`
- `GET /api/satellites`
- `GET /api/satellite/{norad_id}/position?latitude=17.385&longitude=78.4867`
- `GET /api/satellite/{norad_id}/passes?latitude=17.385&longitude=78.4867&hours=24`
- `GET /api/satellite/{norad_id}/observations`

Example satellite IDs are listed by `/api/satellites`.

## Important notes
- Position and pass predictions require an internet connection to retrieve TLE data from CelesTrak.
- TLE data is cached in memory for 30 minutes.
- The observation endpoint depends on SatNOGS API availability and the fields it returns. Not every observation has a downloadable audio recording.
- Tracking calculations are not radio reception. APT decoding is intentionally not included yet.
- The CORS list currently allows common local React development ports (5173 and 3000). Add your deployed frontend origin before deployment.
