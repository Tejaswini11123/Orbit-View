import requests

SATNOGS_OBSERVATIONS_URL = "https://network.satnogs.org/api/observations/"


def get_observations(norad_id: int, limit: int = 10):
    """
    Request observation metadata from the SatNOGS Network API.

    SatNOGS availability and returned fields can vary. This function normalizes
    a few commonly useful fields and does not assume every observation has audio.
    """
    params = {
        "satellite": norad_id,
        "limit": limit,
        "ordering": "-start",
    }

    try:
        response = requests.get(
            SATNOGS_OBSERVATIONS_URL,
            params=params,
            timeout=20,
            headers={"User-Agent": "OrbitView-Student-Project/1.0"},
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise RuntimeError(f"SatNOGS request failed: {exc}")
    except ValueError:
        raise RuntimeError("SatNOGS returned a response that was not valid JSON.")

    if isinstance(data, dict):
        # Some APIs wrap result lists in a "results" field.
        data = data.get("results", [])

    if not isinstance(data, list):
        raise RuntimeError("SatNOGS returned an unexpected response format.")

    observations = []

    for item in data[:limit]:
        if not isinstance(item, dict):
            continue

        observations.append({
            "id": item.get("id"),
            "start": item.get("start"),
            "end": item.get("end"),
            "status": item.get(" status") or item.get("status"),
            "ground_station": item.get("ground_station"),
            "waterfall_url": item.get("waterfall"),
            "audio_url": (
                item.get("audio")
                or item.get("audio_url")
                or item.get("recording")
            ),
        })

    return observations
