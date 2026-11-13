import React, { useState, useEffect, useRef } from "react";

const API_BASE = "http://127.0.0.1:8000";

const SATELLITE_CATALOG = [
  { id: 33591, name: "NOAA 19", category: "Weather", freq: 137.100, mode: "AVHRR APT", hasImager: true },
  { id: 28654, name: "NOAA 18", category: "Weather", freq: 137.9125, mode: "AVHRR APT", hasImager: true },
  { id: 25338, name: "NOAA 15", category: "Weather", freq: 137.620, mode: "AVHRR APT", hasImager: true },
  { id: 57166, name: "METEOR-M2 3", category: "Weather", freq: 137.900, mode: "MSU-MR LRPT", hasImager: true },
  { id: 59051, name: "METEOR-M2 4", category: "Weather", freq: 137.100, mode: "MSU-MR LRPT", hasImager: true },
  { id: 25994, name: "TERRA (EOS AM-1)", category: "Earth Obs", freq: 2215.000, mode: "MODIS 36-Band", hasImager: true },
  { id: 49260, name: "LANDSAT 9", category: "Earth Obs", freq: 2265.000, mode: "OLI-2 / TIRS-2", hasImager: true },
  { id: 40697, name: "SENTINEL-2A", category: "Earth Obs", freq: 8025.000, mode: "MSI 13-Band", hasImager: true },
  { id: 39086, name: "SARAL (ISRO)", category: "Earth Obs", freq: 465.987, mode: "AltiKa Swath", hasImager: true },
  { id: 25544, name: "ISS (ZARYA)", category: "Space Station", freq: 145.800, mode: "FM / Packet", hasImager: false },
  { id: 48274, name: "CSS (TIANGONG)", category: "Space Station", freq: 437.550, mode: "UHF TLM", hasImager: false },
  { id: 27607, name: "SO-50", category: "CubeSat", freq: 436.795, mode: "FM Repeater", hasImager: false },
  { id: 43017, name: "AO-91", category: "CubeSat", freq: 145.960, mode: "Fox-1B TLM", hasImager: false },
  { id: 43137, name: "AO-92", category: "CubeSat", freq: 145.880, mode: "DUV / BPSK", hasImager: false },
  { id: 40908, name: "LILACSAT-2", category: "CubeSat", freq: 437.200, mode: "GFSK Packet", hasImager: false },
  { id: 44878, name: "OPS-SAT (ESA)", category: "CubeSat", freq: 437.200, mode: "GMSK 9600", hasImager: false }
];

const DEFAULT_STATIONS = [
  { id: 2410, name: "Hyderabad Ground Node (IN)", lat: 17.3850, lng: 78.4867, altitude: 540 },
  { id: 1845, name: "ISRO ISTRAC Bengaluru (IN)", lat: 13.0358, lng: 77.5147, altitude: 920 },
  { id: 1205, name: "ESOC Darmstadt Station (EU)", lat: 49.8717, lng: 8.6225, altitude: 140 },
  { id: 3102, name: "Svalbard Polar Dish (NO)", lat: 78.2298, lng: 15.4078, altitude: 450 },
  { id: 4019, name: "JAXA Tsukuba Tracking (JP)", lat: 36.0658, lng: 140.1272, altitude: 65 },
  { id: 5110, name: "NASA Wallops Facility (US)", lat: 37.9402, lng: -75.4664, altitude: 15 }
];

function formatDateTime(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  if (isNaN(d.getTime())) return { date: "--", localTime: "--", utcTime: "--" };
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
    localTime: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
    utcTime: d.toISOString().slice(11, 19) + " UTC"
  };
}

export default function App() {
  const [selectedSat, setSelectedSat] = useState(SATELLITE_CATALOG[0]);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [customNorad, setCustomNorad] = useState("");

  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [selectedStation, setSelectedStation] = useState({
    id: 2410,
    name: "Hyderabad Ground Node (IN)",
    lat: 17.3850,
    lon: 78.4867,
    alt: 540
  });

  const [trackingMode, setTrackingMode] = useState("LIVE_NOW");
  const [liveNowPt, setLiveNowPt] = useState(null);
  const [passes, setPasses] = useState([]);
  const [selectedPassIdx, setSelectedPassIdx] = useState(0);
  const [tleLines, setTleLines] = useState([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [updatingParams, setUpdatingParams] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [liveClock, setLiveClock] = useState(new Date());

  const [decoding, setDecoding] = useState(false);
  const [decodedResult, setDecodedResult] = useState(null);
  const [imgFilter, setImgFilter] = useState("RAW");

  // Interactive 3D camera orbit angles (user can drag canvas to inspect dish from any angle)
  const [camOrbit, setCamOrbit] = useState({ yaw: -28, pitch: 24 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, yaw: -28, pitch: 24 });

  const radarCanvasRef = useRef(null);
  const antennaCanvasRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/stations`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setStations(data);
        setServerOnline(true);
      })
      .catch(() => setServerOnline(false));
  }, []);

  useEffect(() => {
    fetchPasses(selectedSat, true);
  }, [selectedSat, selectedStation]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (trackingMode === "LIVE_NOW" && !updatingParams) {
        fetchPasses(selectedSat, false);
      }
    }, 5000);
    return () => clearInterval(liveInterval);
  }, [selectedSat, selectedStation, trackingMode, updatingParams]);

  const fetchPasses = async (satObj, isSwitchingTarget = false) => {
    if (isSwitchingTarget) {
      setUpdatingParams(true);
      setIsPlaying(false);
    }
    try {
      const url = `${API_BASE}/api/passes?sat_id=${satObj.id}&lat=${selectedStation.lat}&lon=${selectedStation.lon}&alt=${selectedStation.alt}&freq=${satObj.freq}`;
      const res = await fetch(url);
      const data = await res.json();
      setTleLines(data.tle || []);
      setLiveNowPt(data.live_now || null);
      setPasses(data.passes || []);
      if (isSwitchingTarget) {
        setSelectedPassIdx(0);
        setStepIdx(0);
        setDecodedResult(null);
      }
      setServerOnline(true);
    } catch (e) {
      setServerOnline(false);
    }
    if (isSwitchingTarget) {
      setTimeout(() => setUpdatingParams(false), 250);
    }
  };

  const activePass = passes[selectedPassIdx] || null;
  const trajectory = activePass?.trajectory || [];

  const currentPt =
    trackingMode === "LIVE_NOW" && liveNowPt
      ? liveNowPt
      : trajectory[stepIdx] || liveNowPt || {
          azimuth: 0.0,
          elevation: 0.0,
          range_km: 0.0,
          range_rate_kms: 0.0,
          doppler_hz: 0.0,
          rx_freq_mhz: selectedSat.freq,
          fspl_db: 0.0,
          sat_lat: 0.0,
          sat_lon: 0.0,
          sat_alt_km: 0.0,
          timestamp: new Date().toISOString()
        };

  const passTimeFormatted = formatDateTime(currentPt.timestamp);
  const liveClockFormatted = formatDateTime(liveClock.toISOString());

  useEffect(() => {
    if (!isPlaying || trackingMode !== "PASS_REPLAY" || trajectory.length === 0) return;
    const timer = setInterval(() => {
      setStepIdx((prev) => {
        if (prev >= trajectory.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 90);
    return () => clearInterval(timer);
  }, [isPlaying, trackingMode, trajectory]);

  // 1. Detailed Polar Radar Skyplot Canvas
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = cx - 24;

    let animFrameId;

    const renderRadar = () => {
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxR);
      grad.addColorStop(0, "#0b1528");
      grad.addColorStop(1, "#060a12");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fill();

      const sweepAngle = (performance.now() / 1600) % (Math.PI * 2);
      const sweepGrad = ctx.createConicGradient(sweepAngle, cx, cy);
      sweepGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
      sweepGrad.addColorStop(0.85, "rgba(56, 189, 248, 0.04)");
      sweepGrad.addColorStop(1, "rgba(56, 189, 248, 0.28)");
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAngle - 0.45, sweepAngle);
      ctx.closePath();
      ctx.fill();

      [
        { frac: 1.0, label: "0°" },
        { frac: 0.66, label: "30°" },
        { frac: 0.33, label: "60°" }
      ].forEach(({ frac, label }) => {
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * frac, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#475569";
        ctx.font = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, cx + 3, cy - maxR * frac + 9);
      });

      for (let deg = 0; deg < 360; deg += 10) {
        const rad = (deg - 90) * (Math.PI / 180);
        const innerTick = deg % 30 === 0 ? maxR - 5 : maxR - 2.5;
        ctx.strokeStyle = deg % 30 === 0 ? "#475569" : "#1e293b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + innerTick * Math.cos(rad), cy + innerTick * Math.sin(rad));
        ctx.lineTo(cx + maxR * Math.cos(rad), cy + maxR * Math.sin(rad));
        ctx.stroke();
      }

      const ordinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      for (let i = 0; i < 8; i++) {
        const deg = i * 45;
        const rad = (deg - 90) * (Math.PI / 180);

        ctx.strokeStyle = i % 2 === 0 ? "#1e293b" : "#0f172a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + maxR * Math.cos(rad), cy + maxR * Math.sin(rad));
        ctx.stroke();

        ctx.fillStyle = i % 2 === 0 ? "#38bdf8" : "#64748b";
        ctx.font = i % 2 === 0 ? "bold 10px monospace" : "9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labelR = maxR + 12;
        ctx.fillText(ordinals[i], cx + labelR * Math.cos(rad), cy + labelR * Math.sin(rad));
      }

      const azElToXY = (az, el) => {
        const clampedEl = Math.max(0, Math.min(90, Number(el) || 0));
        const r = maxR * (1 - clampedEl / 90);
        const rad = ((Number(az) || 0) - 90) * (Math.PI / 180);
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
      };

      if (!updatingParams && trajectory.length > 0) {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        trajectory.forEach((pt, idx) => {
          const { x, y } = azElToXY(pt.azimuth, pt.elevation);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        const aosPt = azElToXY(trajectory[0].azimuth, trajectory[0].elevation);
        const losPt = azElToXY(trajectory[trajectory.length - 1].azimuth, trajectory[trajectory.length - 1].elevation);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 8px monospace";
        ctx.fillText("AOS", aosPt.x + 8, aosPt.y);
        ctx.fillStyle = "#f43f5e";
        ctx.fillText("LOS", losPt.x + 8, losPt.y);
      }

      const target = azElToXY(currentPt.azimuth, currentPt.elevation);
      const isAbove = Number(currentPt.elevation) > 0;

      ctx.strokeStyle = isAbove ? "rgba(16, 185, 129, 0.75)" : "rgba(245, 158, 11, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();

      ctx.strokeStyle = isAbove ? "#10b981" : "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isAbove ? "#22c55e" : "#f59e0b";
      ctx.beginPath();
      ctx.arc(target.x, target.y, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = updatingParams ? "#f59e0b" : "#f8fafc";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(updatingParams ? "SYNCING..." : `AZ: ${Number(currentPt.azimuth).toFixed(1)}°`, 6, h - 18);
      ctx.fillText(updatingParams ? "WAIT" : `EL: ${Number(currentPt.elevation).toFixed(1)}°`, 6, h - 6);

      animFrameId = requestAnimationFrame(renderRadar);
    };

    renderRadar();
    return () => cancelAnimationFrame(animFrameId);
  }, [trajectory, stepIdx, currentPt, updatingParams]);

  // 2. True Depth-Sorted 3D Parabolic Dish & Az/El Gimbal Engine
  useEffect(() => {
    const canvas = antennaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2 + 25;
    const cy = h / 2 + 12;

    let animId;

    const render3DAntenna = () => {
      ctx.clearRect(0, 0, w, h);

      // Deep space telemetry background
      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 240);
      bgGrad.addColorStop(0, "#0b1629");
      bgGrad.addColorStop(1, "#060a12");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const azDeg = Number(currentPt.azimuth) || 0;
      const rawEl = Number(currentPt.elevation) || 0;
      // When satellite is below horizon, park dish at 15° standby tilt so 3D geometry looks natural, or track exact elevation when > 0°
      const servoElDeg = rawEl > 0 ? rawEl : 12.0;

      const az = (azDeg * Math.PI) / 180;
      const el = (servoElDeg * Math.PI) / 180;

      // Camera rotation matrices (World: +Y Up, +X East, -Z North, +Z South)
      const camYaw = (camOrbit.yaw * Math.PI) / 180;
      const camPitch = (camOrbit.pitch * Math.PI) / 180;

      const worldToCam = (wx, wy, wz) => {
        // Rotate world around Y by camYaw
        const x1 = wx * Math.cos(camYaw) + wz * Math.sin(camYaw);
        const z1 = -wx * Math.sin(camYaw) + wz * Math.cos(camYaw);
        const y1 = wy;

        // Rotate around X by camPitch (looking down at pedestal)
        const y2 = y1 * Math.cos(camPitch) - z1 * Math.sin(camPitch);
        const z2 = y1 * Math.sin(camPitch) + z1 * Math.cos(camPitch);
        const x2 = x1;

        const fov = 420;
        const camDist = 270;
        const scale = fov / Math.max(40, camDist + z2);
        return {
          px: cx + x2 * scale,
          py: cy - y2 * scale,
          depth: z2,
          scale
        };
      };

      // --- STEP A: DRAW 3D GROUND COMPASS PLANE AT Y = -56 ---
      const groundY = -56;
      const compassR = 92;

      // Concentric ground radar rings
      [0.45, 0.75, 1.0].forEach((frac, idx) => {
        ctx.beginPath();
        for (let d = 0; d <= 360; d += 6) {
          const rad = (d * Math.PI) / 180;
          const pt = worldToCam(
            compassR * frac * Math.sin(rad),
            groundY,
            -compassR * frac * Math.cos(rad)
          );
          if (d === 0) ctx.moveTo(pt.px, pt.py);
          else ctx.lineTo(pt.px, pt.py);
        }
        ctx.strokeStyle = idx === 2 ? "#334155" : "#162235";
        ctx.lineWidth = idx === 2 ? 1.5 : 1;
        ctx.stroke();
      });

      // Compass spokes & 3D Cardinal Labels on the floor
      const cardinals = [
        { deg: 0, label: "N 0°", color: "#38bdf8" },
        { deg: 45, label: "NE", color: "#475569" },
        { deg: 90, label: "E 90°", color: "#94a3b8" },
        { deg: 135, label: "SE", color: "#475569" },
        { deg: 180, label: "S 180°", color: "#94a3b8" },
        { deg: 225, label: "SW", color: "#475569" },
        { deg: 270, label: "W 270°", color: "#94a3b8" },
        { deg: 315, label: "NW", color: "#475569" }
      ];
      cardinals.forEach(({ deg, label, color }) => {
        const rad = (deg * Math.PI) / 180;
        const p0 = worldToCam(0, groundY, 0);
        const p1 = worldToCam(compassR * Math.sin(rad), groundY, -compassR * Math.cos(rad));
        const pLbl = worldToCam((compassR + 16) * Math.sin(rad), groundY, -(compassR + 16) * Math.cos(rad));

        ctx.strokeStyle = deg % 90 === 0 ? "#1e293b" : "#111a2b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p0.px, p0.py);
        ctx.lineTo(p1.px, p1.py);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = deg % 90 === 0 ? "bold 10px monospace" : "9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, pLbl.px, pLbl.py);
      });

      // Active Azimuth Heading Ray on Ground Plane
      const gCenter = worldToCam(0, groundY, 0);
      const gAzEnd = worldToCam(compassR * Math.sin(az), groundY, -compassR * Math.cos(az));
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(gCenter.px, gCenter.py);
      ctx.lineTo(gAzEnd.px, gAzEnd.py);
      ctx.stroke();
      ctx.setLineDash([]);

      // --- STEP B: 3D PEDESTAL TOWER & ROTATING AZIMUTH YOKE ---
      // Octagonal concrete/steel base cylinder (y = -56 to y = -16)
      const baseSides = 8;
      const baseBottomR = 16;
      const baseTopR = 11;
      const baseTopY = -16;
      const towerFaces = [];

      for (let i = 0; i < baseSides; i++) {
        const a1 = (i / baseSides) * Math.PI * 2;
        const a2 = ((i + 1) / baseSides) * Math.PI * 2;
        const v0 = worldToCam(baseBottomR * Math.cos(a1), groundY, baseBottomR * Math.sin(a1));
        const v1 = worldToCam(baseBottomR * Math.cos(a2), groundY, baseBottomR * Math.sin(a2));
        const v2 = worldToCam(baseTopR * Math.cos(a2), baseTopY, baseTopR * Math.sin(a2));
        const v3 = worldToCam(baseTopR * Math.cos(a1), baseTopY, baseTopR * Math.sin(a1));
        towerFaces.push({
          verts: [v0, v1, v2, v3],
          depth: (v0.depth + v1.depth + v2.depth + v3.depth) / 4,
          shade: i % 2 === 0 ? "#1e293b" : "#0f172a"
        });
      }
      towerFaces.sort((a, b) => b.depth - a.depth);
      towerFaces.forEach((f) => {
        ctx.fillStyle = f.shade;
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(f.verts[0].px, f.verts[0].py);
        f.verts.slice(1).forEach((v) => ctx.lineTo(v.px, v.py));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Orthonormal Dish Basis Vectors:
      // Right vector R (horizontal perpendicular to Azimuth)
      const Rx = Math.cos(az), Ry = 0, Rz = Math.sin(az);
      // Boresight vector B (points from dish vertex toward satellite at Azimuth, Elevation)
      const Bx = Math.sin(az) * Math.cos(el);
      const By = Math.sin(el);
      const Bz = -Math.cos(az) * Math.cos(el);
      // Dish Local Up vector U = B x R (tilts backward as dish tilts up)
      const Ux = -Math.sin(az) * Math.sin(el);
      const Uy = Math.cos(el);
      const Uz = Math.cos(az) * Math.sin(el);

      // Rotating U-Yoke Fork Arms rising from Turntable (y = -16) to Elevation Pivot (y = 0)
      const yokeSpread = 18;
      const yokeBaseLeft = worldToCam(-Rx * yokeSpread, baseTopY, -Rz * yokeSpread);
      const yokeBaseRight = worldToCam(Rx * yokeSpread, baseTopY, Rz * yokeSpread);
      const yokePivotLeft = worldToCam(-Rx * yokeSpread, 0, -Rz * yokeSpread);
      const yokePivotRight = worldToCam(Rx * yokeSpread, 0, Rz * yokeSpread);
      const yokeCenterBase = worldToCam(0, baseTopY, 0);

      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(yokePivotLeft.px, yokePivotLeft.py);
      ctx.lineTo(yokeBaseLeft.px, yokeBaseLeft.py);
      ctx.lineTo(yokeCenterBase.px, yokeCenterBase.py);
      ctx.lineTo(yokeBaseRight.px, yokeBaseRight.py);
      ctx.lineTo(yokePivotRight.px, yokePivotRight.py);
      ctx.stroke();

      // Elevation Axle Bar
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(yokePivotLeft.px, yokePivotLeft.py);
      ctx.lineTo(yokePivotRight.px, yokePivotRight.py);
      ctx.stroke();

      // --- STEP C: DEPTH-SORTED 3D PARABOLIC DISH SURFACE PANELS ---
      const dishLocalToWorld = (u, v, w) => ({
        wx: u * Rx + v * Ux + w * Bx,
        wy: u * Ry + v * Uy + w * By,
        wz: u * Rz + v * Uz + w * Bz
      });

      const rings = 5;
      const sectors = 24;
      const maxR = 54;
      const dishDepth = 22;
      const hubOffset = 5; // Dish vertex slightly forward of elevation axle

      const dishQuads = [];

      for (let r = 0; r < rings; r++) {
        const r1 = (r / rings) * maxR;
        const r2 = ((r + 1) / rings) * maxR;
        const w1 = hubOffset + (r1 * r1) / (maxR * maxR) * dishDepth;
        const w2 = hubOffset + (r2 * r2) / (maxR * maxR) * dishDepth;

        for (let s = 0; s < sectors; s++) {
          const a1 = (s / sectors) * Math.PI * 2;
          const a2 = ((s + 1) / sectors) * Math.PI * 2;

          const p00 = dishLocalToWorld(r1 * Math.cos(a1), r1 * Math.sin(a1), w1);
          const p10 = dishLocalToWorld(r2 * Math.cos(a1), r2 * Math.sin(a1), w2);
          const p11 = dishLocalToWorld(r2 * Math.cos(a2), r2 * Math.sin(a2), w2);
          const p01 = dishLocalToWorld(r1 * Math.cos(a2), r1 * Math.sin(a2), w1);

          const c00 = worldToCam(p00.wx, p00.wy, p00.wz);
          const c10 = worldToCam(p10.wx, p10.wy, p10.wz);
          const c11 = worldToCam(p11.wx, p11.wy, p11.wz);
          const c01 = worldToCam(p01.wx, p01.wy, p01.wz);

          // 2D screen-space cross product to determine if we are viewing the front concave bowl or rear housing
          const crossZ =
            (c10.px - c00.px) * (c01.py - c00.py) -
            (c10.py - c00.py) * (c01.px - c00.px);

          const avgDepth = (c00.depth + c10.depth + c11.depth + c01.depth) * 0.25;

          dishQuads.push({
            verts: [c00, c10, c11, c01],
            depth: avgDepth,
            isFrontFace: crossZ < 0,
            ringIdx: r,
            sectorIdx: s
          });
        }
      }

      // Painter's Algorithm: Sort panels from farthest to nearest
      dishQuads.sort((a, b) => b.depth - a.depth);

      const isLocked = rawEl > 0 && !updatingParams;

      dishQuads.forEach((q) => {
        ctx.beginPath();
        ctx.moveTo(q.verts[0].px, q.verts[0].py);
        ctx.lineTo(q.verts[1].px, q.verts[1].py);
        ctx.lineTo(q.verts[2].px, q.verts[2].py);
        ctx.lineTo(q.verts[3].px, q.verts[3].py);
        ctx.closePath();

        if (q.isFrontFace) {
          // Concave reflective inner dish surface
          ctx.fillStyle = q.ringIdx === 0
            ? "#0f172a"
            : isLocked
            ? "rgba(16, 185, 129, 0.22)"
            : "rgba(56, 189, 248, 0.18)";
          ctx.strokeStyle = isLocked
            ? "rgba(52, 211, 153, 0.65)"
            : "rgba(56, 189, 248, 0.55)";
        } else {
          // Metallic rear structural shell of the dish
          ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
          ctx.strokeStyle = "rgba(71, 85, 105, 0.65)";
        }
        ctx.lineWidth = q.ringIdx === rings - 1 ? 1.5 : 0.8;
        ctx.fill();
        ctx.stroke();
      });

      // --- STEP D: 4-STRUT SUB-REFLECTOR & LNA FEED HORN ALONG BORESIGHT ---
      const focalW = hubOffset + 44;
      const dishVertexW = dishLocalToWorld(0, 0, hubOffset);
      const feedTipW = dishLocalToWorld(0, 0, focalW);
      const cVertex = worldToCam(dishVertexW.wx, dishVertexW.wy, dishVertexW.wz);
      const cFeed = worldToCam(feedTipW.wx, feedTipW.wy, feedTipW.wz);

      // 4 Quadripod support struts from outer dish rim to focal LNA
      [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((ang) => {
        const rimW = dishLocalToWorld(
          maxR * 0.88 * Math.cos(ang),
          maxR * 0.88 * Math.sin(ang),
          hubOffset + 0.88 * 0.88 * dishDepth
        );
        const cRim = worldToCam(rimW.wx, rimW.wy, rimW.wz);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cRim.px, cRim.py);
        ctx.lineTo(cFeed.px, cFeed.py);
        ctx.stroke();
      });

      // Central waveguide tube
      ctx.strokeStyle = isLocked ? "#10b981" : "#38bdf8";
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(cVertex.px, cVertex.py);
      ctx.lineTo(cFeed.px, cFeed.py);
      ctx.stroke();

      // Focal LNA sub-reflector cap
      ctx.fillStyle = isLocked ? "#22c55e" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(cFeed.px, cFeed.py, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // --- STEP E: ANIMATED 3D RF WAVEFRONTS ALONG BORESIGHT VECTOR ---
      const pulsePhase = (performance.now() / 900) % 1;
      for (let wIdx = 0; wIdx < 3; wIdx++) {
        const frac = (pulsePhase + wIdx / 3) % 1;
        const waveDist = focalW + 8 + frac * 62;
        const waveRadius = 8 + frac * 22;
        const alpha = (1 - frac) * (isLocked ? 0.85 : 0.45);

        ctx.beginPath();
        for (let d = 0; d <= 360; d += 15) {
          const rad = (d * Math.PI) / 180;
          const ptW = dishLocalToWorld(
            waveRadius * Math.cos(rad),
            waveRadius * Math.sin(rad),
            waveDist
          );
          const ptC = worldToCam(ptW.wx, ptW.wy, ptW.wz);
          if (d === 0) ctx.moveTo(ptC.px, ptC.py);
          else ctx.lineTo(ptC.px, ptC.py);
        }
        ctx.strokeStyle = isLocked
          ? `rgba(16, 185, 129, ${alpha.toFixed(2)})`
          : `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // Boresight Laser Vector Line
      const farBeamW = dishLocalToWorld(0, 0, focalW + 78);
      const cFarBeam = worldToCam(farBeamW.wx, farBeamW.wy, farBeamW.wz);
      ctx.strokeStyle = isLocked ? "rgba(16, 185, 129, 0.7)" : "rgba(56, 189, 248, 0.45)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cFeed.px, cFeed.py);
      ctx.lineTo(cFarBeam.px, cFarBeam.py);
      ctx.stroke();
      ctx.setLineDash([]);

      // --- STEP F: TELEMETRY HUD OVERLAY ---
      ctx.textAlign = "left";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px monospace";
      ctx.fillText(`AZIMUTH (YAW):  ${updatingParams ? "UPDATING..." : `${azDeg.toFixed(1)}°`}`, 10, 16);
      ctx.fillText(
        `ELEVATION:      ${updatingParams ? "UPDATING..." : `${rawEl.toFixed(1)}° (GIMBAL: ${servoElDeg.toFixed(1)}°)`}`,
        10,
        30
      );
      ctx.fillStyle = updatingParams ? "#f59e0b" : isLocked ? "#22c55e" : "#38bdf8";
      ctx.font = "bold 10px monospace";
      ctx.fillText(
        updatingParams
          ? "⟳ SLEWING 3D GIMBAL..."
          : isLocked
          ? "● RF BORESIGHT LOCKED ON SATELLITE"
          : "● STANDBY TRACKING (DRAG TO ROTATE 3D VIEW)",
        10,
        44
      );

      animId = requestAnimationFrame(render3DAntenna);
    };

    render3DAntenna();
    return () => cancelAnimationFrame(animId);
  }, [currentPt, updatingParams, camOrbit]);

  const handleMouseDown3D = (e) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      yaw: camOrbit.yaw,
      pitch: camOrbit.pitch
    };
  };

  const handleMouseMove3D = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setCamOrbit({
      yaw: dragRef.current.yaw + dx * 0.6,
      pitch: Math.max(8, Math.min(65, dragRef.current.pitch + dy * 0.4))
    });
  };

  const handleMouseUp3D = () => {
    dragRef.current.active = false;
  };

  const handleDecodePass = async () => {
    setDecoding(true);
    try {
      const params = new URLSearchParams({
        sat_id: selectedSat.id,
        lat: selectedStation.lat,
        lon: selectedStation.lon,
        station_name: selectedStation.name
      });
      const res = await fetch(`${API_BASE}/api/process-pass?${params.toString()}`, {
        method: "POST"
      });
      const data = await res.json();
      setDecodedResult(data);
    } catch (e) {
      alert("Backend connection failed. Verify FastAPI is running on port 8000.");
    }
    setDecoding(false);
  };

  const filteredSats = categoryFilter === "ALL"
    ? SATELLITE_CATALOG
    : SATELLITE_CATALOG.filter((s) => s.category === categoryFilter);

  const getImageFilterStyle = () => {
    switch (imgFilter) {
      case "CONTRAST":
        return "contrast(135%) brightness(105%)";
      case "INVERT":
        return "invert(100%)";
      default:
        return "none";
    }
  };

  const imageUrl = decodedResult?.image_url ? `${API_BASE}${decodedResult.image_url}` : null;
  const isAboveHorizon = Number(currentPt.elevation) > 0;

  return (
    <div style={{ background: "#060a12", color: "#e2e8f0", height: "100vh", overflow: "hidden", fontFamily: "'Inter', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>
      
      {/* GLOBAL ANIMATIONS & DUAL SCROLLBAR STYLES */}
      <style>{`
        @keyframes blink-red-btn {
          0% {
            background-color: #dc2626;
            box-shadow: 0 0 14px rgba(239, 68, 68, 0.85), inset 0 0 6px rgba(255, 255, 255, 0.35);
            border-color: #fca5a5;
          }
          50% {
            background-color: #7f1d1d;
            box-shadow: 0 0 4px rgba(239, 68, 68, 0.3);
            border-color: #ef4444;
          }
          100% {
            background-color: #dc2626;
            box-shadow: 0 0 14px rgba(239, 68, 68, 0.85), inset 0 0 6px rgba(255, 255, 255, 0.35);
            border-color: #fca5a5;
          }
        }
        @keyframes pulse-updating {
          0% { opacity: 1; }
          50% { opacity: 0.35; }
          100% { opacity: 1; }
        }
        .live-red-btn-active {
          animation: blink-red-btn 1.1s infinite ease-in-out;
        }
        .updating-text {
          color: #f59e0b !important;
          animation: pulse-updating 0.7s infinite;
          font-size: 12px !important;
          letter-spacing: 0.5px;
        }
        .tle-scroll-window {
          overflow-x: scroll !important;
          overflow-y: scroll !important;
        }
        .tle-scroll-window::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .tle-scroll-window::-webkit-scrollbar-track {
          background: #060a12;
          border-radius: 4px;
        }
        .tle-scroll-window::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 4px;
          border: 1px solid #1e293b;
        }
        .tle-scroll-window::-webkit-scrollbar-thumb:hover {
          background: #38bdf8;
        }
        .tle-scroll-window::-webkit-scrollbar-corner {
          background: #060a12;
        }
      `}</style>

      {/* TOP HEADER BAR WITH LARGER MISSION CLOCK & DATES */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", background: "#0b111e", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 900, fontSize: "17px", letterSpacing: "0.9px", color: "#f8fafc" }}>
            🛰️ SATELLITE TRACKING AND IMAGE DECODING
          </span>
          <span style={{ fontSize: "11px", background: "#064e3b", color: "#34d399", padding: "3px 8px", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700 }}>
            REAL-TIME SGP4 + NASA EOSDIS
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontFamily: "monospace" }}>
          <div style={{ background: "#060a12", padding: "6px 14px", borderRadius: "6px", border: "1px solid #334155", display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}>
            <span style={{ color: "#f8fafc", fontWeight: 800 }}>📅 {liveClockFormatted.date}</span>
            <span style={{ color: "#475569" }}>|</span>
            <span style={{ color: "#38bdf8", fontWeight: 800 }}>🕒 {liveClockFormatted.utcTime}</span>
            <span style={{ color: "#475569" }}>|</span>
            <span style={{ color: "#f59e0b", fontWeight: 800 }}>{liveClockFormatted.localTime} IST</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", background: serverOnline ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.15)", border: `1px solid ${serverOnline ? "#10b981" : "#ef4444"}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: serverOnline ? "#10b981" : "#ef4444" }} />
            <span style={{ color: serverOnline ? "#10b981" : "#ef4444", fontWeight: 800 }}>
              {serverOnline ? "TELEMETRY ONLINE" : "BACKEND OFFLINE"}
            </span>
          </div>
        </div>
      </header>

      {/* MAIN 3-COLUMN WORKSPACE */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 480px", gap: "12px", padding: "12px", flex: 1, minHeight: 0 }}>

        {/* LEFT COLUMN: STATION + FLEET + PASSES */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: 0 }}>
          
          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "10px", flexShrink: 0 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#38bdf8", marginBottom: "6px" }}>🌐 GROUND STATION NODE</div>
            <select
              value={selectedStation.id}
              onChange={(e) => {
                const st = stations.find((s) => s.id === Number(e.target.value));
                if (st) setSelectedStation({ id: st.id, name: st.name, lat: Number(st.lat), lon: Number(st.lng ?? st.lon), alt: Number(st.altitude || 200) });
              }}
              style={{ width: "100%", padding: "7px", background: "#060a12", color: "#f8fafc", border: "1px solid #334155", borderRadius: "4px", fontSize: "11px" }}
            >
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({Number(st.lat).toFixed(1)}°, {Number(st.lng ?? st.lon).toFixed(1)}°)
                </option>
              ))}
            </select>
          </div>

          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "10px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#38bdf8", marginBottom: "6px" }}>🛰️ SATELLITE FLEET ({SATELLITE_CATALOG.length})</div>

            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "8px", flexShrink: 0 }}>
              {["ALL", "Weather", "Earth Obs", "Space Station", "CubeSat"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    fontSize: "10px",
                    padding: "3px 6px",
                    borderRadius: "4px",
                    border: "1px solid",
                    borderColor: categoryFilter === cat ? "#38bdf8" : "#1e293b",
                    background: categoryFilter === cat ? "rgba(56, 189, 248, 0.15)" : "#060a12",
                    color: categoryFilter === cat ? "#38bdf8" : "#94a3b8",
                    cursor: "pointer"
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "5px", paddingRight: "3px" }}>
              {filteredSats.map((sat) => {
                const active = selectedSat.id === sat.id;
                return (
                  <div
                    key={sat.id}
                    onClick={() => setSelectedSat(sat)}
                    style={{
                      padding: "7px 9px",
                      borderRadius: "5px",
                      background: active ? "rgba(56, 189, 248, 0.14)" : "#060a12",
                      border: `1px solid ${active ? "#38bdf8" : "#1e293b"}`,
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: active ? "#38bdf8" : "#f1f5f9" }}>{sat.name}</span>
                        <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "3px", background: sat.hasImager ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)", color: sat.hasImager ? "#10b981" : "#f59e0b" }}>
                          {sat.hasImager ? "IMG" : "TLM"}
                        </span>
                      </div>
                      <div style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>#{sat.id} • {sat.mode}</div>
                    </div>
                    <div style={{ fontSize: "10px", fontFamily: "monospace", color: "#10b981", fontWeight: 600 }}>{sat.freq} MHz</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "5px", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #1e293b", flexShrink: 0 }}>
              <input
                type="number"
                placeholder="Custom NORAD ID"
                value={customNorad}
                onChange={(e) => setCustomNorad(e.target.value)}
                style={{ flex: 1, background: "#060a12", border: "1px solid #334155", color: "#fff", padding: "5px 7px", borderRadius: "4px", fontSize: "11px" }}
              />
              <button
                onClick={() => {
                  if (customNorad) setSelectedSat({ id: Number(customNorad), name: `NORAD #${customNorad}`, category: "Custom", freq: 137.5, mode: "Custom", hasImager: false });
                }}
                style={{ background: "#0284c7", color: "#fff", border: "none", borderRadius: "4px", padding: "5px 9px", fontSize: "10px", fontWeight: 600, cursor: "pointer" }}
              >
                Track
              </button>
            </div>
          </div>

          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "10px", height: "175px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#38bdf8", marginBottom: "6px", display: "flex", justifyContent: "space-between" }}>
              <span>UPCOMING SGP4 PASSES ({passes.length})</span>
              {updatingParams && <span style={{ color: "#f59e0b" }}>UPDATING...</span>}
            </div>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
              {updatingParams ? (
                <div className="updating-text" style={{ padding: "8px", fontFamily: "monospace" }}>Propagating SGP4 orbit...</div>
              ) : passes.length === 0 ? (
                <div style={{ fontSize: "10px", color: "#64748b", padding: "4px" }}>No passes above 5° in next 24h.</div>
              ) : (
                passes.map((p, idx) => {
                  const dt = formatDateTime(p.aos);
                  const isSelected = trackingMode === "PASS_REPLAY" && selectedPassIdx === idx;
                  return (
                    <div
                      key={idx}
                      onClick={() => { setTrackingMode("PASS_REPLAY"); setSelectedPassIdx(idx); setStepIdx(0); }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: "4px",
                        background: isSelected ? "rgba(16, 185, 129, 0.14)" : "#060a12",
                        border: `1px solid ${isSelected ? "#10b981" : "#1e293b"}`,
                        cursor: "pointer",
                        fontSize: "10px",
                        fontFamily: "monospace"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#f8fafc" }}>
                        <span>PASS #{idx + 1} • {dt.date}</span>
                        <span style={{ color: "#10b981" }}>Max {p.max_elevation}°</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", marginTop: "2px" }}>
                        <span>AOS: {dt.localTime} IST</span>
                        <span>{p.duration_sec}s</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* CENTER COLUMN: TELEMETRY PARAMETERS AT TOP + SKYPLOT & 3D ANTENNA + DUAL-SCROLLBAR TLE */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: 0 }}>
          
          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "12px", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#f8fafc" }}>
                  📡 {selectedSat.name} ORBITAL PARAMETERS
                </span>
                <span style={{ fontSize: "10px", fontFamily: "monospace", padding: "2px 7px", borderRadius: "4px", background: updatingParams ? "rgba(245, 158, 11, 0.2)" : isAboveHorizon ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)", color: updatingParams ? "#f59e0b" : isAboveHorizon ? "#10b981" : "#f59e0b", fontWeight: 700 }}>
                  {updatingParams ? "⟳ UPDATING TELEMETRY..." : isAboveHorizon ? "● IN VIEW (ABOVE HORIZON)" : "● BELOW HORIZON"}
                </span>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  onClick={() => { setTrackingMode("LIVE_NOW"); setIsPlaying(false); }}
                  className={trackingMode === "LIVE_NOW" ? "live-red-btn-active" : ""}
                  style={{
                    background: trackingMode === "LIVE_NOW" ? "#dc2626" : "#1e293b",
                    color: "#ffffff",
                    border: trackingMode === "LIVE_NOW" ? "2px solid #fca5a5" : "2px solid #334155",
                    borderRadius: "6px",
                    padding: "5px 14px",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.7px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  ● LIVE NOW
                </button>

                <button
                  onClick={() => setTrackingMode("PASS_REPLAY")}
                  style={{
                    background: trackingMode === "PASS_REPLAY" ? "#0284c7" : "#1e293b",
                    color: "#fff",
                    border: "2px solid",
                    borderColor: trackingMode === "PASS_REPLAY" ? "#38bdf8" : "#334155",
                    borderRadius: "6px",
                    padding: "5px 12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  🔭 PASS #{selectedPassIdx + 1}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontFamily: "monospace" }}>
              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>SUB-SATELLITE LAT / LON</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "14px", fontWeight: 700, color: "#38bdf8", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : `${currentPt.sat_lat}°, ${currentPt.sat_lon}°`}
                </div>
              </div>

              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>AZIMUTH / ELEVATION</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "14px", fontWeight: 700, color: isAboveHorizon ? "#10b981" : "#f59e0b", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : `${currentPt.azimuth}° / ${currentPt.elevation}°`}
                </div>
              </div>

              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>SLANT RANGE (LINE OF SIGHT)</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : `${currentPt.range_km} km`}
                </div>
              </div>

              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>ORBITAL ALTITUDE</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "14px", fontWeight: 700, color: "#34d399", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : `${currentPt.sat_alt_km} km`}
                </div>
              </div>

              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>DOPPLER SHIFT (Δf)</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "14px", fontWeight: 700, color: Number(currentPt.doppler_hz) >= 0 ? "#10b981" : "#f43f5e", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : `${currentPt.doppler_hz} Hz`}
                </div>
              </div>

              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>CORRECTED RX FREQ</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "14px", fontWeight: 700, color: "#a855f7", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : `${currentPt.rx_freq_mhz} MHz`}
                </div>
              </div>

              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>RADIAL VELOCITY / LOSS</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : `${currentPt.range_rate_kms} km/s (-${currentPt.fspl_db}dB)`}
                </div>
              </div>

              <div style={{ background: "#060a12", padding: "9px", borderRadius: "5px", border: "1px solid #1e293b" }}>
                <div style={{ fontSize: "9px", color: "#64748b" }}>STATE TIMESTAMP</div>
                <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "13px", fontWeight: 700, color: "#f59e0b", marginTop: "3px" }}>
                  {updatingParams ? "UPDATING..." : passTimeFormatted.utcTime}
                </div>
              </div>
            </div>

            {trackingMode === "PASS_REPLAY" && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #1e293b" }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    background: isPlaying ? "#ef4444" : "#10b981",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 10px",
                    fontSize: "10px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {isPlaying ? "⏸ PAUSE" : "▶ SCRUB PASS"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, trajectory.length - 1)}
                  value={stepIdx}
                  onChange={(e) => setStepIdx(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#38bdf8", cursor: "pointer" }}
                />
                <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}>
                  {passTimeFormatted.date} • {passTimeFormatted.localTime} IST
                </span>
              </div>
            )}
          </div>

          {/* 2. DETAILED POLAR HORIZON SKYPLOT + TRUE 3D PARABOLIC TRACKING ANTENNA */}
          <div style={{ display: "grid", gridTemplateColumns: "245px 1fr", gap: "10px", background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "12px", flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "100%", fontSize: "10px", fontWeight: 700, color: "#38bdf8", marginBottom: "6px" }}>
                🧭 DETAILED POLAR HORIZON SKYPLOT
              </div>
              <canvas ref={radarCanvasRef} width={225} height={225} style={{ borderRadius: "50%", border: "1px solid #1e293b", background: "#060a12" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", fontWeight: 700, color: "#10b981", marginBottom: "6px" }}>
                <span>📡 3D PARABOLIC AZ/EL TRACKING DISH (DRAG TO ORBIT 3D CAMERA)</span>
                <button
                  onClick={() => setCamOrbit({ yaw: -28, pitch: 24 })}
                  style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: "3px", fontSize: "9px", padding: "1px 6px", cursor: "pointer", fontFamily: "monospace" }}
                >
                  Reset 3D View
                </button>
              </div>
              <canvas
                ref={antennaCanvasRef}
                width={440}
                height={225}
                onMouseDown={handleMouseDown3D}
                onMouseMove={handleMouseMove3D}
                onMouseUp={handleMouseUp3D}
                onMouseLeave={handleMouseUp3D}
                style={{ width: "100%", height: "225px", borderRadius: "6px", border: "1px solid #1e293b", cursor: "grab" }}
              />
            </div>
          </div>

          {/* 3. NORAD TLE WINDOW WITH EXPLICIT HORIZONTAL & VERTICAL SCROLLBARS */}
          <div
            className="tle-scroll-window"
            style={{
              background: "#0b111e",
              border: "1px solid #1e293b",
              borderRadius: "7px",
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: "11px",
              color: "#38bdf8",
              height: "74px",
              whiteSpace: "pre",
              flexShrink: 0
            }}
          >
            <div style={{ minWidth: "780px", paddingBottom: "8px" }}>
              <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: "4px" }}>
                NORAD TWO-LINE ELEMENT SET (CELESTRAK SGP4 EPHEMERIS — {selectedSat.name}):
              </div>
              {updatingParams ? (
                <div className="updating-text">FETCHING UPDATED NORAD TLE FROM CELESTRAK...</div>
              ) : tleLines.length > 0 ? (
                tleLines.map((line, i) => (
                  <div key={i} style={{ lineHeight: "1.45" }}>
                    {line}
                  </div>
                ))
              ) : (
                <div>Fetching CelesTrak GP Ephemeris...</div>
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: OPTIMIZED IMAGE DECODING & RADIOMETER SECTION */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: 0 }}>
          
          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "12px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#f8fafc" }}>
                  🖼️ SATELLITE IMAGE DECODER
                </div>
                <div style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace" }}>
                  BAND A: VISIBLE RGB  |  BAND B: 11.0µm THERMAL IR
                </div>
              </div>

              <div style={{ display: "flex", gap: "4px" }}>
                {[
                  { id: "RAW", label: "True Sensor" },
                  { id: "CONTRAST", label: "Contrast+" },
                  { id: "INVERT", label: "Invert IR" }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setImgFilter(mode.id)}
                    style={{
                      fontSize: "10px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "1px solid",
                      borderColor: imgFilter === mode.id ? "#38bdf8" : "#1e293b",
                      background: imgFilter === mode.id ? "rgba(56, 189, 248, 0.18)" : "#060a12",
                      color: imgFilter === mode.id ? "#38bdf8" : "#94a3b8",
                      cursor: "pointer"
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "10px", flexShrink: 0 }}>
              {selectedSat.hasImager ? (
                <button
                  onClick={handleDecodePass}
                  disabled={decoding || updatingParams}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: decoding ? "#047857" : "linear-gradient(90deg, #059669, #10b981)",
                    color: "#fff",
                    border: "1px solid #34d399",
                    borderRadius: "6px",
                    fontWeight: 800,
                    fontSize: "11px",
                    letterSpacing: "0.4px",
                    cursor: "pointer"
                  }}
                >
                  {decoding
                    ? "⟳ DECODING NASA EOSDIS VISIBLE & THERMAL IR SWATH..."
                    : `⚡ DECODE ${selectedSat.name} SWATH OVER ${selectedStation.name.split(" ")[0].toUpperCase()}`}
                </button>
              ) : (
                <div style={{ padding: "9px 11px", background: "rgba(245, 158, 11, 0.12)", border: "1px solid #f59e0b", borderRadius: "5px", color: "#fcd34d", fontSize: "10px", lineHeight: "1.4" }}>
                  <strong>⚠️ NON-IMAGING SPACECRAFT:</strong> <code>{selectedSat.name}</code> ({selectedSat.mode}) transmits packet/voice telemetry only. Select a <strong>Weather</strong> or <strong>Earth Obs</strong> satellite to decode imagery.
                </div>
              )}
            </div>

            {decodedResult?.decode?.status === "unsupported_payload" || decodedResult?.decode?.status === "error" ? (
              <div style={{ padding: "12px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid #ef4444", borderRadius: "5px", color: "#fca5a5", fontSize: "11px" }}>
                {decodedResult.decode.error_message}
              </div>
            ) : imageUrl ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
                
                <div style={{ background: "#060a12", border: "1px solid #334155", borderRadius: "6px", overflow: "hidden", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, padding: "4px" }}>
                  <img
                    src={imageUrl}
                    alt="Decoded Dual-Band Satellite Swath"
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", borderRadius: "4px", filter: getImageFilterStyle() }}
                  />
                </div>

                <div style={{ background: "#060a12", padding: "8px 10px", borderRadius: "6px", border: "1px solid #1e293b", fontFamily: "monospace", fontSize: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", flexShrink: 0 }}>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "9px" }}>ORBITAL SWATH DATE</span>
                    <span style={{ color: "#10b981", fontWeight: 700 }}>{decodedResult.decode?.swath_date}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "9px" }}>DECODE UTC TIME</span>
                    <span style={{ color: "#38bdf8", fontWeight: 700 }}>{decodedResult.decode?.capture_utc}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "9px" }}>GROUND BBOX CENTER</span>
                    <span style={{ color: "#f8fafc", fontWeight: 700 }}>{decodedResult.decode?.coordinates}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "9px" }}>LOCAL IST TIME</span>
                    <span style={{ color: "#f59e0b", fontWeight: 700 }}>{decodedResult.decode?.capture_ist}</span>
                  </div>
                </div>

                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textAlign: "center",
                    padding: "7px",
                    background: "#1e293b",
                    color: "#38bdf8",
                    textDecoration: "none",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: 700,
                    border: "1px solid #334155",
                    flexShrink: 0
                  }}
                >
                  🔍 Open Full-Resolution 2048px Dual-Sensor Frame ↗
                </a>
              </div>
            ) : (
              <div style={{ flex: 1, border: "1px dashed #1e293b", borderRadius: "6px", background: "#060a12", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px", textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: "26px", marginBottom: "8px" }}>🛰️</div>
                <div style={{ fontSize: "12px", color: "#cbd5e1", fontWeight: 700 }}>Dual-Sensor Radiometer Standby</div>
                <div style={{ fontSize: "11px", marginTop: "4px", maxWidth: "300px", lineHeight: "1.4" }}>
                  Click the decode button above to fetch and stitch real-time NASA EOSDIS Visible Reflectance & Band-31 Thermal IR tiles over {selectedStation.name}.
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}