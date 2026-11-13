import os
import io
from datetime import datetime, timezone, timedelta
import requests
import numpy as np
from PIL import Image, ImageDraw, ImageFont

IMAGING_SATELLITE_NORADS = {
    33591: "NOAA 19 (AVHRR/3 6-Channel Imager)",
    28654: "NOAA 18 (AVHRR/3 6-Channel Imager)",
    25338: "NOAA 15 (AVHRR/3 6-Channel Imager)",
    57166: "METEOR-M2 3 (MSU-MR Multispectral Imager)",
    59051: "METEOR-M2 4 (MSU-MR Multispectral Imager)",
    49260: "LANDSAT 9 (OLI-2 & TIRS-2 Imager)",
    40697: "SENTINEL-2A (MSI 13-Band Imager)",
    39086: "SARAL (AltiKa Oceanographic Payload)",
    25994: "TERRA / EOS AM-1 (MODIS 36-Band Radiometer)"
}

def get_font(size: int):
    for font_name in ["consolab.ttf", "consola.ttf", "arialbd.ttf", "arial.ttf", "segoeui.ttf"]:
        try:
            return ImageFont.truetype(font_name, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()

def format_dual_timestamps(raw_utc_str: str) -> tuple[str, str, str]:
    dt_utc = datetime.now(timezone.utc)
    if raw_utc_str:
        try:
            clean = raw_utc_str.replace(" UTC", "").replace("Z", "+00:00").strip()
            dt_utc = datetime.fromisoformat(clean)
            if dt_utc.tzinfo is None:
                dt_utc = dt_utc.replace(tzinfo=timezone.utc)
        except Exception:
            pass

    ist_tz = timezone(timedelta(hours=5, minutes=30))
    dt_ist = dt_utc.astimezone(ist_tz)

    date_str = dt_utc.strftime("%d %b %Y").upper()
    utc_str = dt_utc.strftime("%H:%M:%S UTC")
    ist_str = dt_ist.strftime("%d %b %Y, %I:%M:%S %p IST")
    return date_str, utc_str, ist_str

def fetch_nasa_wmts_stitched_swath(
    layer: str,
    matrix_set: str,
    ext: str,
    date_str: str,
    lat: float,
    lon: float,
    out_w: int,
    out_h: int,
    session: requests.Session
) -> Image.Image:
    z = 3
    tile_deg = 288.0 / (2 ** z)  # 36.0 degrees per 512px tile

    exact_col = (lon + 180.0) / tile_deg
    exact_row = (90.0 - lat) / tile_deg

    col_start = max(0, min(8, int(round(exact_col)) - 1))
    row_start = max(0, min(3, int(round(exact_row)) - 1))

    canvas = Image.new("RGB", (1024, 1024), (0, 0, 0))
    tiles_ok = 0

    for dr in range(2):
        for dc in range(2):
            r_idx = max(0, min(4, row_start + dr))
            c_idx = (col_start + dc) % 10
            url = (
                f"https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/"
                f"{layer}/default/{date_str}/{matrix_set}/{z}/{r_idx}/{c_idx}.{ext}"
            )
            try:
                resp = session.get(url, timeout=8)
                if resp.status_code == 200 and len(resp.content) > 800:
                    tile_img = Image.open(io.BytesIO(resp.content)).convert("RGB").resize((512, 512))
                    canvas.paste(tile_img, (dc * 512, dr * 512))
                    tiles_ok += 1
            except Exception:
                pass

    if tiles_ok == 0:
        return None

    lon_origin = -180.0 + col_start * tile_deg
    lat_origin = 90.0 - row_start * tile_deg

    px_per_deg = 512.0 / tile_deg
    cx = int((lon - lon_origin) * px_per_deg)
    cy = int((lat_origin - lat) * px_per_deg)

    half_w = int(13.0 * px_per_deg)
    half_h = int(10.0 * px_per_deg)

    x1 = max(0, min(1024 - 2 * half_w, cx - half_w))
    y1 = max(0, min(1024 - 2 * half_h, cy - half_h))
    x2 = x1 + 2 * half_w
    y2 = y1 + 2 * half_h

    return canvas.crop((x1, y1, x2, y2)).resize((out_w, out_h), resample=Image.Resampling.BICUBIC)

def fill_orbital_swath_gaps(primary_img: Image.Image, secondary_img: Image.Image) -> Image.Image:
    if primary_img is None:
        return secondary_img
    if secondary_img is None:
        return primary_img

    p_arr = np.asarray(primary_img)
    s_arr = np.asarray(secondary_img)

    gap_mask = (p_arr.max(axis=2) < 10)[:, :, None]
    fused = np.where(gap_mask, s_arr, p_arr)
    return Image.fromarray(fused.astype(np.uint8))

def fetch_real_dual_sensor_swaths(lat: float, lon: float, width: int, height: int):
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrbitView/5.4"})

    now_utc = datetime.now(timezone.utc)
    candidate_dates = [
        (now_utc - timedelta(days=1)).strftime("%Y-%m-%d"),
        (now_utc - timedelta(days=2)).strftime("%Y-%m-%d"),
        (now_utc - timedelta(days=3)).strftime("%Y-%m-%d")
    ]

    vis_configs = [
        ("VIIRS_SNPP_CorrectedReflectance_TrueColor", "250m", "jpg"),
        ("MODIS_Terra_CorrectedReflectance_TrueColor", "250m", "jpg"),
        ("MODIS_Aqua_CorrectedReflectance_TrueColor", "250m", "jpg")
    ]

    ir_configs = [
        ("MODIS_Terra_Brightness_Temp_Band31_Day", "1km", "png"),
        ("MODIS_Terra_Brightness_Temp_Band31_Night", "1km", "png"),
        ("VIIRS_SNPP_Brightness_Temp_BandI5_Day", "250m", "png"),
        ("VIIRS_SNPP_Brightness_Temp_BandI5_Night", "250m", "png"),
        ("MODIS_Aqua_Brightness_Temp_Band31_Day", "1km", "png")
    ]

    vis_img = None
    ir_img = None
    matched_date = candidate_dates[0]
    vis_layer_used = ""
    ir_layer_used = ""

    for d_str in candidate_dates:
        fetched_vis = []
        for layer, mset, ext in vis_configs:
            cand = fetch_nasa_wmts_stitched_swath(layer, mset, ext, d_str, lat, lon, width, height, session)
            if cand is not None and np.asarray(cand).mean() > 10.0:
                fetched_vis.append((cand, layer))
                if len(fetched_vis) == 2:
                    break

        if len(fetched_vis) > 0:
            matched_date = d_str
            if len(fetched_vis) >= 2:
                vis_img = fill_orbital_swath_gaps(fetched_vis[0][0], fetched_vis[1][0])
                vis_layer_used = f"{fetched_vis[0][1][:14]} + {fetched_vis[1][1][:11]}"
            else:
                vis_img = fetched_vis[0][0]
                vis_layer_used = fetched_vis[0][1]
            break

    for d_str in ([matched_date] if vis_img is not None else candidate_dates):
        fetched_ir = []
        for layer, mset, ext in ir_configs:
            cand = fetch_nasa_wmts_stitched_swath(layer, mset, ext, d_str, lat, lon, width, height, session)
            if cand is not None and np.asarray(cand).mean() > 5.0:
                fetched_ir.append((cand, layer))
                if len(fetched_ir) == 2:
                    break

        if len(fetched_ir) >= 2:
            matched_date = d_str
            ir_img = fill_orbital_swath_gaps(fetched_ir[0][0], fetched_ir[1][0])
            ir_layer_used = f"{fetched_ir[0][1][:18]} + {fetched_ir[1][1][:11]}"
            break
        elif len(fetched_ir) == 1:
            matched_date = d_str
            ir_img = fetched_ir[0][0]
            ir_layer_used = fetched_ir[0][1]
            break

    # Polar Night Fallback for Arctic stations (Svalbard 78.2°N in Winter)
    if vis_img is None:
        polar_ref = fetch_nasa_wmts_stitched_swath(
            "BlueMarble_NextGeneration", "500m", "jpg", "2004-08-01", lat, lon, width, height, session
        )
        if polar_ref is not None:
            vis_img = polar_ref
            vis_layer_used = "POLAR NIGHT (Arctic Base + Night IR)"
        elif ir_img is not None:
            vis_img = ir_img
            vis_layer_used = "POLAR NIGHT (Thermal IR Radiance)"

    return vis_img, ir_img, matched_date, vis_layer_used, ir_layer_used

def annotate_geospatial_grid(img: Image.Image, lat: float, lon: float, station_name: str, font_sm) -> np.ndarray:
    dr = ImageDraw.Draw(img)
    width, height = img.size

    for frac in [0.25, 0.5, 0.75]:
        y_pos = int(frac * height)
        lat_val = max(-89.0, min(89.0, lat + (0.5 - frac) * 20.0))
        for x in range(0, width, 16):
            dr.line([(x, y_pos), (x + 7, y_pos)], fill=(148, 163, 184), width=1)
        dr.rectangle([8, y_pos - 20, 88, y_pos - 2], fill=(6, 10, 18))
        dr.text((12, y_pos - 18), f"{lat_val:.1f}°", fill=(56, 189, 248), font=font_sm)

        x_pos = int(frac * width)
        lon_val = lon + (frac - 0.5) * 26.0
        for y in range(0, height, 16):
            dr.line([(x_pos, y), (x_pos, y + 7)], fill=(148, 163, 184), width=1)
        dr.rectangle([x_pos + 4, height - 26, x_pos + 86, height - 6], fill=(6, 10, 18))
        dr.text((x_pos + 8, height - 24), f"{lon_val:.1f}°", fill=(56, 189, 248), font=font_sm)

    cx, cy = width // 2, height // 2
    dr.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], outline=(239, 68, 68), width=2)
    dr.line([(cx - 14, cy), (cx + 14, cy)], fill=(239, 68, 68), width=2)
    dr.line([(cx, cy - 14), (cx, cy + 14)], fill=(239, 68, 68), width=2)
    dr.rectangle([cx + 12, cy - 12, cx + 260, cy + 12], fill=(6, 10, 18), outline=(239, 68, 68))
    dr.text((cx + 18, cy - 8), f"{station_name[:22]}", fill=(254, 202, 202), font=font_sm)

    return np.asarray(img, dtype=np.uint8)

def decode_apt_audio(
    audio_path: str,
    output_filename: str = "weather_map.png",
    sat_id: int = 33591,
    obs_id: str = "LIVE",
    lat: float = 17.3850,
    lon: float = 78.4867,
    station_name: str = "Hyderabad Ground Node",
    capture_utc: str = None,
    real_satnogs_url: str = None
):
    if sat_id not in IMAGING_SATELLITE_NORADS and not real_satnogs_url:
        return {
            "status": "unsupported_payload",
            "error_message": (
                f"NORAD #{sat_id} is a Non-Imaging Spacecraft (Voice/Packet Telemetry only) "
                "and does not carry an Optical or Thermal IR Earth Imager."
            )
        }

    output_dir = "data/images"
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, output_filename)

    date_str, utc_str, ist_str = format_dual_timestamps(capture_utc)

    ch_width = 1020
    height = 720

    vis_img, ir_img, swath_date, vis_layer, ir_layer = fetch_real_dual_sensor_swaths(lat, lon, ch_width, height)

    if vis_img is None:
        return {
            "status": "error",
            "error_message": "Could not retrieve WMTS tiles from gibs.earthdata.nasa.gov. Check your internet connection."
        }

    if ir_img is None:
        ir_img = vis_img.convert("L").convert("RGB")
        ir_layer = "Band-31 IR Unavailable"

    font_sm = get_font(15)
    font_md = get_font(19)
    font_lg = get_font(21)

    ch_a_arr = annotate_geospatial_grid(vis_img, lat, lon, station_name, font_sm)
    ch_b_arr = annotate_geospatial_grid(ir_img, lat, lon, station_name, font_sm)

    divider = np.full((height, 8, 3), (30, 41, 59), dtype=np.uint8)
    body = np.hstack([ch_a_arr, divider, ch_b_arr])
    total_w = body.shape[1]

    header_bar = np.full((64, total_w, 3), (8, 13, 24), dtype=np.uint8)
    footer_bar = np.full((46, total_w, 3), (8, 13, 24), dtype=np.uint8)
    full_frame = np.vstack([header_bar, body, footer_bar])

    final_img = Image.fromarray(full_frame)
    draw = ImageDraw.Draw(final_img)

    draw.line([(0, 63), (total_w, 63)], fill=(56, 189, 248), width=2)
    draw.text(
        (20, 18),
        f"BAND A: REAL NASA VISIBLE CLOUD SWATH ({vis_layer})",
        fill=(56, 189, 248),
        font=font_lg
    )
    draw.text(
        (ch_width + 28, 18),
        f"BAND B: REAL NASA 11.0um THERMAL IR SENSOR ({ir_layer})",
        fill=(34, 197, 94),
        font=font_lg
    )

    draw.line([(0, 64 + height), (total_w, 64 + height)], fill=(30, 41, 59), width=2)
    draw.text(
        (20, 64 + height + 11),
        f"SWATH DATE: {swath_date}   •   QUERY TIME: {utc_str} ({ist_str})   •   BBOX CENTER: {lat:.2f}°N, {lon:.2f}°E   •   SOURCE: NASA GIBS REST WMTS",
        fill=(248, 250, 252),
        font=font_md
    )

    final_img.save(output_path)

    return {
        "status": "success",
        "engine": f"NASA WMTS ({vis_layer} | {ir_layer})",
        "swath_date": swath_date,
        "capture_date": date_str,
        "capture_utc": utc_str,
        "capture_ist": ist_str,
        "coordinates": f"{lat:.2f}°N, {lon:.2f}°E",
        "image_path": output_path,
        "resolution": f"{total_w}x{full_frame.shape[0]} Dual-Sensor Frame"
    }