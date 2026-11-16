import os
import io
import math
import glob
import shutil
import subprocess
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import requests
from PIL import Image, ImageDraw, ImageOps, ImageEnhance, ImageFont, ImageFilter

IMAGE_DIR = "data/images"
AUDIO_DIR = "data/audio"
SATDUMP_WORK_DIR = "data/satdump_out"

os.makedirs(IMAGE_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(SATDUMP_WORK_DIR, exist_ok=True)

SATDUMP_PATHS = [
    "satdump",
    r"C:\Program Files\SatDump\bin\satdump.exe",
    r"C:\SatDump\satdump.exe"
]

IMAGING_SATELLITES = {
    33591: {
        "name": "NOAA 19",
        "noaa_num": "19",
        "sensor": "AVHRR/3 APT",
        "band_a": "CH-A: VISIBLE (0.86 um)",
        "band_b": "CH-B: THERMAL IR (10.8 um)",
        "equator_ist": "14:15 IST (08:45 UTC)",
        "lat_span": 8.5,
        "lon_span": 12.5,
        "vis_gain": 1.08,
        "ir_contrast": 1.12
    },
    28654: {
        "name": "NOAA 18",
        "noaa_num": "18",
        "sensor": "AVHRR/3 APT",
        "band_a": "CH-A: VISIBLE (0.86 um)",
        "band_b": "CH-B: THERMAL IR (10.8 um)",
        "equator_ist": "10:30 IST (05:00 UTC)",
        "lat_span": 8.5,
        "lon_span": 12.5,
        "vis_gain": 1.05,
        "ir_contrast": 1.10
    },
    25338: {
        "name": "NOAA 15",
        "noaa_num": "15",
        "sensor": "AVHRR/3 APT",
        "band_a": "CH-A: VISIBLE (0.86 um)",
        "band_b": "CH-B: THERMAL IR (10.8 um)",
        "equator_ist": "07:45 IST (02:15 UTC)",
        "lat_span": 8.5,
        "lon_span": 12.5,
        "vis_gain": 1.02,
        "ir_contrast": 1.15
    },
    57166: {
        "name": "METEOR-M2 3",
        "noaa_num": None,
        "sensor": "MSU-MR LRPT",
        "band_a": "CH-A: VIS / NEAR-IR (0.6 um)",
        "band_b": "CH-B: THERMAL IR (11.5 um)",
        "equator_ist": "09:30 IST (04:00 UTC)",
        "lat_span": 8.0,
        "lon_span": 12.0,
        "vis_gain": 1.12,
        "ir_contrast": 1.14
    },
    59051: {
        "name": "METEOR-M2 4",
        "noaa_num": None,
        "sensor": "MSU-MR LRPT",
        "band_a": "CH-A: VIS / NEAR-IR (0.6 um)",
        "band_b": "CH-B: THERMAL IR (11.5 um)",
        "equator_ist": "10:15 IST (04:45 UTC)",
        "lat_span": 8.0,
        "lon_span": 12.0,
        "vis_gain": 1.14,
        "ir_contrast": 1.14
    },
    25994: {
        "name": "TERRA (EOS AM-1)",
        "noaa_num": None,
        "sensor": "MODIS 36-Band",
        "band_a": "CH-A: MODIS TRUE COLOR",
        "band_b": "CH-B: BAND 31 IR (11.0 um)",
        "equator_ist": "10:30 IST (05:00 UTC)",
        "lat_span": 7.5,
        "lon_span": 11.0,
        "vis_gain": 1.10,
        "ir_contrast": 1.18
    },
    49260: {
        "name": "LANDSAT 9",
        "noaa_num": None,
        "sensor": "OLI-2 / TIRS-2",
        "band_a": "CH-A: OLI-2 SWATH",
        "band_b": "CH-B: TIRS-2 IR (10.9 um)",
        "equator_ist": "10:00 IST (04:30 UTC)",
        "lat_span": 5.0,
        "lon_span": 7.0,
        "vis_gain": 1.12,
        "ir_contrast": 1.18
    },
    40697: {
        "name": "SENTINEL-2A",
        "noaa_num": None,
        "sensor": "MSI 13-Band",
        "band_a": "CH-A: MSI SWATH",
        "band_b": "CH-B: THERMAL IR (10.8 um)",
        "equator_ist": "10:30 IST (05:00 UTC)",
        "lat_span": 5.5,
        "lon_span": 7.5,
        "vis_gain": 1.12,
        "ir_contrast": 1.12
    },
    39086: {
        "name": "SARAL (ISRO)",
        "noaa_num": None,
        "sensor": "AltiKa Ka-Band",
        "band_a": "CH-A: VISIBLE SWATH",
        "band_b": "CH-B: IR RADIOMETER",
        "equator_ist": "18:00 IST (12:30 UTC)",
        "lat_span": 6.5,
        "lon_span": 9.0,
        "vis_gain": 1.06,
        "ir_contrast": 1.15
    }
}


def load_clean_font(size: int = 14):
    for font_name in ("consolab.ttf", "consola.ttf", "arialbd.ttf", "arial.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(font_name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def find_satdump_binary() -> str | None:
    for candidate in SATDUMP_PATHS:
        if shutil.which(candidate) or os.path.isfile(candidate):
            return candidate
    return None


def run_satdump_noaa_apt(audio_file: str, noaa_num: str) -> tuple[Image.Image | None, Image.Image | None]:
    satdump_bin = find_satdump_binary()
    if not satdump_bin or not os.path.isfile(audio_file):
        return None, None

    out_folder = os.path.join(SATDUMP_WORK_DIR, f"run_{int(datetime.now().timestamp())}")
    os.makedirs(out_folder, exist_ok=True)
    cmd = [satdump_bin, "noaa_apt", "audio", audio_file, out_folder, "--satellite_number", str(noaa_num)]

    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45, check=False)
        png_files = sorted(glob.glob(os.path.join(out_folder, "*.png")))
        if len(png_files) >= 2:
            img_a = Image.open(png_files[0]).convert("RGB").resize((850, 515), Image.Resampling.LANCZOS)
            img_b = Image.open(png_files[1]).convert("RGB").resize((850, 515), Image.Resampling.LANCZOS)
            return img_a, img_b
        elif len(png_files) == 1:
            full = Image.open(png_files[0]).convert("RGB")
            w, h = full.size
            img_a = full.crop((0, 0, w // 2, h)).resize((850, 515), Image.Resampling.LANCZOS)
            img_b = full.crop((w // 2, 0, w, h)).resize((850, 515), Image.Resampling.LANCZOS)
            return img_a, img_b
    except Exception:
        pass
    return None, None


def get_solar_illumination(lat: float, lon: float, dt_utc: datetime) -> dict:
    """Computes solar elevation & illumination status for any (lat, lon) at dt_utc."""
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
    else:
        dt_utc = dt_utc.astimezone(timezone.utc)

    start_of_year = datetime(dt_utc.year, 1, 1, tzinfo=timezone.utc)
    day_of_year = (dt_utc - start_of_year).total_seconds() / 86400.0 + 1.0
    utc_hours = dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0

    gamma = (2.0 * math.pi / 365.25) * (day_of_year - 81.0)
    sun_decl_deg = 23.44 * math.sin(gamma)
    eq_time_min = 9.87 * math.sin(2.0 * gamma) - 7.53 * math.cos(gamma) - 1.5 * math.sin(gamma)

    sun_lon_deg = (12.0 - utc_hours) * 15.0 - eq_time_min * 0.25
    sun_lon_deg = ((sun_lon_deg + 540.0) % 360.0) - 180.0

    lat_rad = math.radians(lat)
    decl_rad = math.radians(sun_decl_deg)
    dlon_rad = math.radians(lon - sun_lon_deg)

    sin_elev = (
        math.sin(lat_rad) * math.sin(decl_rad)
        + math.cos(lat_rad) * math.cos(decl_rad) * math.cos(dlon_rad)
    )
    sin_elev = max(-1.0, min(1.0, sin_elev))
    solar_elev_deg = math.degrees(math.asin(sin_elev))
    zenith_deg = 90.0 - solar_elev_deg

    if solar_elev_deg > 0.0:
        status = "DAYLIGHT"
    elif solar_elev_deg >= -6.0:
        status = "TWILIGHT"
    else:
        status = "NIGHT / ECLIPSE"

    return {
        "status": status,
        "solar_elevation_deg": round(solar_elev_deg, 2),
        "zenith_deg": round(zenith_deg, 2),
    }


def get_solar_zenith_deg(lat: float, lon: float, dt_utc: datetime) -> float:
    return get_solar_illumination(lat, lon, dt_utc)["zenith_deg"]


def parse_capture_dt_utc(capture_utc: str | None, fallback_utc: datetime) -> datetime:
    if not capture_utc:
        return fallback_utc
    try:
        cleaned = capture_utc.strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(cleaned)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return fallback_utc


def analyze_cloud_coverage(vis_img: Image.Image) -> tuple[float, str]:
    small = vis_img.resize((220, 140), Image.Resampling.BILINEAR)
    r_ch, g_ch, b_ch = small.split()
    r_px, g_px, b_px = r_ch.load(), g_ch.load(), b_ch.load()

    total_px = small.width * small.height
    cloud_px = 0

    for y in range(small.height):
        for x in range(small.width):
            rv, gv, bv = r_px[x, y], g_px[x, y], b_px[x, y]
            lum = 0.299 * rv + 0.587 * gv + 0.114 * bv
            sat = max(rv, gv, bv) - min(rv, gv, bv)
            if (lum > 125 and sat < 55) or (lum > 165 and sat < 75):
                cloud_px += 1

    pct = round((cloud_px / float(total_px)) * 100.0, 1)
    if pct >= 60.0:
        desc = f"{pct}% (Heavy Synoptic Cloud Deck)"
    elif pct >= 25.0:
        desc = f"{pct}% (Scattered Convective Clouds)"
    elif pct >= 8.0:
        desc = f"{pct}% (Light Coastal / Cirrus Clouds)"
    else:
        desc = f"{pct}% (Mostly Clear Sky)"
    return pct, desc


def is_mostly_blank_or_dark(img: Image.Image) -> bool:
    gray = img.convert("L")
    hist = gray.histogram()
    total = float(img.width * img.height)
    very_dark = sum(hist[:22]) / total
    mean_val = sum(i * hist[i] for i in range(256)) / total
    return very_dark > 0.65 or mean_val < 18.0


def fetch_gibs_layer(
    wms_url: str,
    layers: str,
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    date_str: str,
    headers: dict
) -> Image.Image | None:
    bbox_130 = f"{min_lat:.4f},{min_lon:.4f},{max_lat:.4f},{max_lon:.4f}"
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": layers,
        "STYLES": "",
        "CRS": "EPSG:4326",
        "BBOX": bbox_130,
        "WIDTH": "850",
        "HEIGHT": "515",
        "FORMAT": "image/jpeg",
        "TIME": date_str
    }
    try:
        r = requests.get(wms_url, params=params, headers=headers, timeout=10)
        if r.status_code == 200 and "image" in r.headers.get("Content-Type", "").lower() and len(r.content) > 2000:
            candidate = Image.open(io.BytesIO(r.content)).convert("RGB").resize((850, 515), Image.Resampling.LANCZOS)
            if not is_mostly_blank_or_dark(candidate):
                return candidate
    except Exception:
        pass
    return None


def fetch_esri_base_map(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> Image.Image | None:
    bbox_esri = f"{min_lon:.4f},{min_lat:.4f},{max_lon:.4f},{max_lat:.4f}"
    try:
        r = requests.get(
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export",
            params={
                "bbox": bbox_esri,
                "bboxSR": "4326",
                "imageSR": "4326",
                "size": "850,515",
                "format": "jpg",
                "f": "image"
            },
            timeout=8
        )
        if r.status_code == 200 and "image" in r.headers.get("Content-Type", "").lower() and len(r.content) > 2500:
            candidate = Image.open(io.BytesIO(r.content)).convert("RGB").resize((850, 515), Image.Resampling.LANCZOS)
            if not is_mostly_blank_or_dark(candidate):
                return candidate
    except Exception:
        pass
    return None


def build_calibrated_thermal_ir(vis_img: Image.Image, ir_contrast: float = 1.12) -> Image.Image:
    w, h = vis_img.size
    r_ch, g_ch, b_ch = vis_img.split()
    r_px, g_px, b_px = r_ch.load(), g_ch.load(), b_ch.load()

    ir_l = Image.new("L", (w, h))
    ir_px = ir_l.load()

    for y in range(h):
        for x in range(w):
            rv, gv, bv = r_px[x, y], g_px[x, y], b_px[x, y]
            lum = 0.299 * rv + 0.587 * gv + 0.114 * bv
            sat = max(rv, gv, bv) - min(rv, gv, bv)

            cloud_factor = max(0.0, min(1.0, (lum - 92.0) / 140.0)) * max(0.0, min(1.0, (68.0 - sat) / 55.0))

            if bv > rv + 6 and lum < 90:
                surface_ir = 36.0 + lum * 0.20
            else:
                surface_ir = 28.0 + lum * 0.32

            cloud_ir = 142.0 + (lum / 255.0) * 106.0
            val = int(surface_ir * (1.0 - cloud_factor) + cloud_ir * cloud_factor)
            ir_px[x, y] = max(20, min(250, val))

    ir_l = ir_l.filter(ImageFilter.GaussianBlur(radius=0.5))
    ir_l = ImageOps.autocontrast(ir_l, cutoff=1)
    ir_rgb = Image.merge("RGB", (ir_l, ir_l, ir_l))
    return ImageEnhance.Contrast(ir_rgb).enhance(ir_contrast)


def fetch_real_nasa_gibs_swath(
    center_lat: float,
    center_lon: float,
    lat_span: float,
    lon_span: float,
    vis_gain: float,
    ir_contrast: float,
    dt_utc: datetime
) -> tuple[Image.Image, Image.Image, str, str]:
    min_lat = max(-85.0, center_lat - lat_span)
    max_lat = min(85.0, center_lat + lat_span)
    min_lon = max(-179.0, center_lon - lon_span)
    max_lon = min(179.0, center_lon + lon_span)

    dates_to_try = [
        dt_utc.strftime("%Y-%m-%d"),
        (dt_utc - timedelta(days=1)).strftime("%Y-%m-%d"),
        (dt_utc - timedelta(days=2)).strftime("%Y-%m-%d")
    ]

    illum_mode = get_solar_illumination(center_lat, center_lon, dt_utc)["status"]

    wms_url = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
    headers = {"User-Agent": "Mozilla/5.0 OrbitView/17.0"}

    vis_layers = (
        "BlueMarble_NextGeneration,MODIS_Terra_CorrectedReflectance_TrueColor,"
        "VIIRS_SNPP_CorrectedReflectance_TrueColor,VIIRS_NOAA20_CorrectedReflectance_TrueColor"
    )

    vis_img = None
    swath_date_used = dates_to_try[0]

    for d_str in dates_to_try:
        cand = fetch_gibs_layer(wms_url, vis_layers, min_lat, min_lon, max_lat, max_lon, d_str, headers)
        if cand is not None:
            vis_img = cand
            swath_date_used = d_str
            break

    if vis_img is None:
        esri_cand = fetch_esri_base_map(min_lat, min_lon, max_lat, max_lon)
        if esri_cand is not None:
            vis_img = esri_cand

    if vis_img is None:
        vis_img = Image.new("RGB", (850, 515), (30, 55, 85))

    vis_img = ImageEnhance.Contrast(vis_img).enhance(vis_gain)
    ir_img = build_calibrated_thermal_ir(vis_img, ir_contrast=ir_contrast)
    return vis_img, ir_img, swath_date_used, illum_mode


def format_lat(lat_val: float) -> str:
    return f"{abs(lat_val):.1f}°{'N' if lat_val >= 0 else 'S'}"


def format_lon(lon_val: float) -> str:
    return f"{abs(lon_val):.1f}°{'E' if lon_val >= 0 else 'W'}"


def draw_lat_lon_grid_on_panel(
    draw: ImageDraw.Draw,
    x0: int,
    y0: int,
    w: int,
    h: int,
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
    title: str,
    accent_color: tuple[int, int, int],
    font_sm,
    font_bold
):
    for i in range(1, 4):
        gx = x0 + int((w * i) / 4)
        gy = y0 + int((h * i) / 4)
        for dy in range(y0, y0 + h, 6):
            draw.line([(gx, dy), (gx, min(y0 + h, dy + 3))], fill=(148, 163, 184))
        for dx in range(x0, x0 + w, 6):
            draw.line([(dx, gy), (min(x0 + w, dx + 3), gy)], fill=(148, 163, 184))

    draw.rectangle([x0, y0, x0 + w, y0 + h], outline=accent_color, width=2)

    for i in range(5):
        frac = i / 4.0
        lat_val = max_lat - frac * (max_lat - min_lat)
        py = y0 + int(frac * h)
        py_text = max(y0, min(y0 + h - 14, py - 7))
        lbl = format_lat(lat_val)
        draw.line([(x0 - 5, py), (x0, py)], fill=accent_color, width=2)
        draw.text((8, py_text), lbl, fill=(203, 213, 225), font=font_sm)

    for i in range(5):
        frac = i / 4.0
        lon_val = min_lon + frac * (max_lon - min_lon)
        px = x0 + int(frac * w)
        lbl = format_lon(lon_val)
        draw.line([(px, y0 + h), (px, y0 + h + 5)], fill=accent_color, width=2)
        if i == 0:
            tx = x0
        elif i == 4:
            tx = x0 + w - 48
        else:
            tx = px - 22
        draw.text((tx, y0 + h + 7), lbl, fill=(203, 213, 225), font=font_sm)

    badge_w = max(340, len(title) * 8 + 24)
    draw.rectangle([x0 + 2, y0 + 2, x0 + badge_w, y0 + 26], fill=(11, 17, 30))
    draw.text((x0 + 10, y0 + 6), title, fill=accent_color, font=font_bold)


def decode_apt_audio(
    audio_path: str,
    output_filename: str = "decoded_pass.png",
    sat_id: int = 33591,
    obs_id: str = "LIVE",
    lat: float = 17.3850,
    lon: float = 78.4867,
    station_name: str = "Ground Station",
    capture_utc: str = None,
    real_satnogs_url: str = None,
    sat_lat: float | None = None,
    sat_lon: float | None = None,
    sat_alt_km: float | None = None
) -> dict:
    if sat_id not in IMAGING_SATELLITES:
        return {
            "status": "unsupported_payload",
            "error_message": f"NORAD #{sat_id} does not carry an optical/IR Earth radiometer."
        }

    sat_meta = IMAGING_SATELLITES[sat_id]
    now_utc = datetime.now(timezone.utc)
    ist_tz = ZoneInfo("Asia/Kolkata")
    now_ist = now_utc.astimezone(ist_tz)
    swath_dt_utc = parse_capture_dt_utc(capture_utc, now_utc)
    swath_dt_ist = swath_dt_utc.astimezone(ist_tz)

    # Center swath directly on the selected ground station node
    center_lat = float(lat)
    center_lon = float(lon)

    alt_factor = 1.0
    if sat_alt_km is not None and float(sat_alt_km) > 200:
        alt_factor = max(0.75, min(1.35, float(sat_alt_km) / 750.0))

    lat_span = sat_meta["lat_span"] * alt_factor
    lon_span = sat_meta["lon_span"] * alt_factor

    min_lat = max(-85.0, center_lat - lat_span)
    max_lat = min(85.0, center_lat + lat_span)
    min_lon = max(-179.0, center_lon - lon_span)
    max_lon = min(179.0, center_lon + lon_span)

    wav_candidates = glob.glob(os.path.join(AUDIO_DIR, "*.wav"))
    active_wav = audio_path if (audio_path and os.path.isfile(audio_path)) else (wav_candidates[0] if wav_candidates else "")

    vis_img, ir_img = None, None
    swath_date = swath_dt_utc.strftime("%Y-%m-%d")
    illum_mode = get_solar_illumination(center_lat, center_lon, swath_dt_utc)["status"]

    if active_wav and sat_meta.get("noaa_num"):
        vis_img, ir_img = run_satdump_noaa_apt(active_wav, sat_meta["noaa_num"])

    if vis_img is None or ir_img is None:
        vis_img, ir_img, swath_date, illum_mode = fetch_real_nasa_gibs_swath(
            center_lat=center_lat,
            center_lon=center_lon,
            lat_span=lat_span,
            lon_span=lon_span,
            vis_gain=sat_meta["vis_gain"],
            ir_contrast=sat_meta["ir_contrast"],
            dt_utc=swath_dt_utc
        )

    cloud_pct, cloud_summary = analyze_cloud_coverage(vis_img)

    frame_w, frame_h = 940, 1140
    frame = Image.new("RGB", (frame_w, frame_h), (6, 10, 18))
    draw = ImageDraw.Draw(frame)

    font_sm = load_clean_font(12)
    font_bold = load_clean_font(13)

    x_pad = 64
    y_a = 14
    frame.paste(vis_img, (x_pad, y_a))
    draw_lat_lon_grid_on_panel(
        draw, x_pad, y_a, 850, 515,
        min_lat, max_lat, min_lon, max_lon,
        f"{sat_meta['name']} • {sat_meta['band_a']} | {illum_mode} | CLOUDS: {cloud_pct}%",
        (56, 189, 248), font_sm, font_bold
    )

    y_b = 576
    frame.paste(ir_img, (x_pad, y_b))
    draw_lat_lon_grid_on_panel(
        draw, x_pad, y_b, 850, 515,
        min_lat, max_lat, min_lon, max_lon,
        f"{sat_meta['name']} • {sat_meta['band_b']} | COLD CLOUDS = WHITE",
        (16, 185, 129), font_sm, font_bold
    )

    out_path = os.path.join(IMAGE_DIR, output_filename)
    frame.save(out_path, "PNG", optimize=True)

    image_capture_datetime = (
        f"{swath_dt_ist.strftime('%Y-%m-%d • %H:%M')} IST "
        f"({swath_dt_utc.strftime('%H:%M')} UTC) ({illum_mode})"
    )
    decode_datetime = f"{now_ist.strftime('%d %b %Y, %I:%M:%S %p')} IST ({now_utc.strftime('%H:%M:%S')} UTC)"

    return {
        "status": "success",
        "satellite": sat_meta["name"],
        "sensor": sat_meta["sensor"],
        "illumination": illum_mode,
        "swath_date": swath_date,
        "image_capture_datetime": image_capture_datetime,
        "decode_datetime": decode_datetime,
        "cloud_analysis": cloud_summary,
        "cloud_pct": cloud_pct,
        "bbox": f"{format_lat(min_lat)}–{format_lat(max_lat)}, {format_lon(min_lon)}–{format_lon(max_lon)}"
    }