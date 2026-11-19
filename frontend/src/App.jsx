import React, { useState, useEffect, useRef } from "react";

const API_BASE = "https://orbit-vieww-api.onrender.com";

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

function getSubsolarPoint(dateObj) {
  const d = dateObj || new Date();
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const dayOfYear = (d - startOfYear) / 86400000;
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;

  const gamma = ((2 * Math.PI) / 365.25) * (dayOfYear - 81);
  const sunDeclDeg = 23.44 * Math.sin(gamma);
  const eqTimeMin = 9.87 * Math.sin(2 * gamma) - 7.53 * Math.cos(gamma) - 1.5 * Math.sin(gamma);
  let sunLonDeg = (12.0 - utcHours) * 15.0 - eqTimeMin * 0.25;
  sunLonDeg = ((sunLonDeg + 540) % 360) - 180;

  return { sunLat: sunDeclDeg, sunLon: sunLonDeg };
}

function isPointInNight(latDeg, lonDeg, sunLatDeg, sunLonDeg) {
  const latRad = (latDeg * Math.PI) / 180;
  const sunLatRad = (sunLatDeg * Math.PI) / 180;
  const dLonRad = ((lonDeg - sunLonDeg) * Math.PI) / 180;
  const cosZenith = Math.sin(latRad) * Math.sin(sunLatRad) + Math.cos(latRad) * Math.cos(sunLatRad) * Math.cos(dLonRad);
  return cosZenith < 0;
}

function formatCoordPair(latVal, lonVal) {
  const latNum = Number(latVal);
  const lonNum = Number(lonVal);
  const latStr = Number.isFinite(latNum) ? `${Math.abs(latNum).toFixed(2)}°${latNum >= 0 ? "N" : "S"}` : "--";
  const lonStr = Number.isFinite(lonNum) ? `${Math.abs(lonNum).toFixed(2)}°${lonNum >= 0 ? "E" : "W"}` : "--";
  return `${latStr}, ${lonStr}`;
}

export default function App() {
  const [selectedSat, setSelectedSat] = useState(SATELLITE_CATALOG[0]);
  const [categoryFilter, setCategoryFilter] = useState("ALL");

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
  const [groundTrack, setGroundTrack] = useState([]);
  const [passes, setPasses] = useState([]);
  const [selectedPassIdx, setSelectedPassIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [updatingParams, setUpdatingParams] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [liveClock, setLiveClock] = useState(new Date());

  const [decoding, setDecoding] = useState(false);
  const [decodedResult, setDecodedResult] = useState(null);
  const [imgFilter, setImgFilter] = useState("RAW");

  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const earthImgRef = useRef(null);
  const [earthLoaded, setEarthLoaded] = useState(false);

  const [camOrbit, setCamOrbit] = useState({ yaw: -32, pitch: 26 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, yaw: -32, pitch: 26 });

  const radarCanvasRef = useRef(null);
  const antennaCanvasRef = useRef(null);
  const lowerMapCanvasRef = useRef(null);
  const fullMapCanvasRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg";
    img.onload = () => {
      earthImgRef.current = img;
      setEarthLoaded(true);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setIsMapFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      setLiveNowPt(data.live_now || null);
      setGroundTrack(data.ground_track || []);
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
          sat_lat: 17.385,
          sat_lon: 78.4867,
          sat_alt_km: 790.4,
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

  // World Map + Orbit Renderer (Night shader kept; yellow sun dot removed)
  const drawWorldTrackMap = (canvas, isLargeView = false) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const padLeft = isLargeView ? 46 : 32;
    const padBottom = isLargeView ? 24 : 18;
    const padTop = isLargeView ? 20 : 8;
    const padRight = isLargeView ? 16 : 10;

    const mapW = w - padLeft - padRight;
    const mapH = h - padTop - padBottom;

    ctx.fillStyle = "#050912";
    ctx.fillRect(0, 0, w, h);

    const latLonToXY = (lat, lon) => ({
      x: padLeft + ((lon + 180) / 360) * mapW,
      y: padTop + ((90 - lat) / 180) * mapH
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, mapW, mapH);
    ctx.clip();

    if (earthImgRef.current) {
      ctx.drawImage(earthImgRef.current, padLeft, padTop, mapW, mapH);
      ctx.fillStyle = "rgba(4, 9, 20, 0.20)";
      ctx.fillRect(padLeft, padTop, mapW, mapH);
    } else {
      ctx.fillStyle = "#071326";
      ctx.fillRect(padLeft, padTop, mapW, mapH);
    }

    const lonStep = isLargeView ? 30 : 60;
    for (let lon = -180; lon <= 180; lon += lonStep) {
      const { x } = latLonToXY(0, lon);
      ctx.strokeStyle = lon === 0 ? "rgba(56, 189, 248, 0.4)" : "rgba(148, 163, 184, 0.18)";
      ctx.lineWidth = lon === 0 ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + mapH);
      ctx.stroke();
    }

    [-60, -30, 0, 30, 60].forEach((lat) => {
      const { y } = latLonToXY(lat, 0);
      ctx.strokeStyle = lat === 0 ? "rgba(56, 189, 248, 0.45)" : "rgba(148, 163, 184, 0.18)";
      ctx.lineWidth = lat === 0 ? 1.3 : 0.8;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + mapW, y);
      ctx.stroke();
    });

    const activeTime = trackingMode === "LIVE_NOW" ? liveClock : new Date(currentPt.timestamp || Date.now());
    const { sunLat, sunLon } = getSubsolarPoint(activeTime);
    const declRad = (sunLat * Math.PI) / 180;
    const tanDecl = Math.abs(Math.tan(declRad)) < 1e-4 ? 1e-4 : Math.tan(declRad);

    const terminatorPts = [];
    for (let dx = 0; dx <= mapW; dx += 3) {
      const lon = (dx / mapW) * 360 - 180;
      const hourAngleRad = ((lon - sunLon) * Math.PI) / 180;
      const latRad = Math.atan(-Math.cos(hourAngleRad) / tanDecl);
      const latDeg = Math.max(-85, Math.min(85, (latRad * 180) / Math.PI));
      const px = padLeft + dx;
      const py = padTop + ((90 - latDeg) / 180) * mapH;
      terminatorPts.push({ px, py, lon });
    }

    const midLon = terminatorPts[Math.floor(terminatorPts.length / 2)]?.lon ?? 0;
    const northEdgeIsNight = isPointInNight(85, midLon, sunLat, sunLon);

    ctx.beginPath();
    ctx.moveTo(terminatorPts[0].px, terminatorPts[0].py);
    terminatorPts.forEach((pt) => ctx.lineTo(pt.px, pt.py));
    if (northEdgeIsNight) {
      ctx.lineTo(padLeft + mapW, padTop);
      ctx.lineTo(padLeft, padTop);
    } else {
      ctx.lineTo(padLeft + mapW, padTop + mapH);
      ctx.lineTo(padLeft, padTop + mapH);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(2, 6, 17, 0.65)";
    ctx.fill();

    ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
    ctx.lineWidth = isLargeView ? 2.0 : 1.3;
    ctx.beginPath();
    terminatorPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.px, pt.py);
      else ctx.lineTo(pt.px, pt.py);
    });
    ctx.stroke();

    const orbitPts =
      groundTrack && groundTrack.length > 1
        ? groundTrack
        : trajectory.map((p) => ({ lat: p.sat_lat, lon: p.sat_lon, is_past: false }));

    if (!updatingParams && orbitPts.length > 1) {
      for (let i = 1; i < orbitPts.length; i++) {
        const pPrev = orbitPts[i - 1];
        const pCurr = orbitPts[i];
        if (Math.abs(pCurr.lon - pPrev.lon) > 90) continue;

        const xy0 = latLonToXY(pPrev.lat, pPrev.lon);
        const xy1 = latLonToXY(pCurr.lat, pCurr.lon);

        ctx.beginPath();
        ctx.moveTo(xy0.x, xy0.y);
        ctx.lineTo(xy1.x, xy1.y);

        if (pCurr.is_past) {
          ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = isLargeView ? 2 : 1.4;
        } else {
          ctx.strokeStyle = "#f59e0b";
          ctx.setLineDash([]);
          ctx.lineWidth = isLargeView ? 2.6 : 1.9;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    const stXY = latLonToXY(selectedStation.lat, selectedStation.lon);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = isLargeView ? 2 : 1.6;
    ctx.beginPath();
    ctx.arc(stXY.x, stXY.y, isLargeView ? 7 : 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(stXY.x, stXY.y, isLargeView ? 3 : 2.2, 0, Math.PI * 2);
    ctx.fill();

    const satLat = Number(currentPt.sat_lat) || 0;
    const satLon = Number(currentPt.sat_lon) || 0;
    const satAlt = Number(currentPt.sat_alt_km) || 790;
    const satXY = latLonToXY(satLat, satLon);

    const earthRadiusKm = 6371.0;
    const footprintDeg = (Math.acos(earthRadiusKm / (earthRadiusKm + Math.max(200, satAlt))) * 180) / Math.PI;
    const footprintPxR = (footprintDeg / 180) * mapH;

    ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
    ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
    ctx.lineWidth = isLargeView ? 1.8 : 1.3;
    ctx.beginPath();
    ctx.arc(satXY.x, satXY.y, footprintPxR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(satXY.x, satXY.y, isLargeView ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (isLargeView) {
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`STN: ${selectedStation.name.split(" (")[0]}`, stXY.x + 10, stXY.y);

      ctx.fillStyle = "#fca5a5";
      ctx.fillText(`${selectedSat.name}`, satXY.x + 10, satXY.y - 8);
      ctx.fillStyle = "#6ee7b7";
      ctx.fillText(`FOOTPRINT`, satXY.x + 10, satXY.y + 6);
    }

    ctx.restore();

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, mapW, mapH);

    ctx.font = isLargeView ? "bold 10px monospace" : "8.5px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [60, 30, 0, -30, -60].forEach((lat) => {
      const { y } = latLonToXY(lat, 0);
      const txt = lat === 0 ? "0°" : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`;
      ctx.fillStyle = lat === 0 ? "#38bdf8" : "#94a3b8";
      ctx.fillText(txt, padLeft - 4, y);
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [-120, -60, 0, 60, 120].forEach((lon) => {
      const { x } = latLonToXY(0, lon);
      const txt = lon === 0 ? "0°" : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;
      ctx.fillStyle = lon === 0 ? "#38bdf8" : "#94a3b8";
      ctx.fillText(txt, x, padTop + mapH + 4);
    });
  };

  useEffect(() => {
    drawWorldTrackMap(lowerMapCanvasRef.current, false);
    if (isMapFullscreen) {
      drawWorldTrackMap(fullMapCanvasRef.current, true);
    }
  }, [currentPt, groundTrack, trajectory, selectedStation, selectedSat, liveClock, earthLoaded, isMapFullscreen, updatingParams]);

  // Polar Skyplot Canvas
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = cx - 22;

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

      for (let deg = 0; deg < 360; deg += 30) {
        const rad = (deg - 90) * (Math.PI / 180);
        ctx.strokeStyle = "#1e293b";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + maxR * Math.cos(rad), cy + maxR * Math.sin(rad));
        ctx.stroke();
      }

      const ordinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      ordinals.forEach((ord, i) => {
        const deg = i * 45;
        const rad = (deg - 90) * (Math.PI / 180);
        ctx.fillStyle = i % 2 === 0 ? "#38bdf8" : "#64748b";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labelR = maxR + 11;
        ctx.fillText(ord, cx + labelR * Math.cos(rad), cy + labelR * Math.sin(rad));
      });

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
      }

      const target = azElToXY(currentPt.azimuth, currentPt.elevation);
      const isAbove = Number(currentPt.elevation) > 0;
      ctx.strokeStyle = isAbove ? "#10b981" : "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = isAbove ? "#22c55e" : "#f59e0b";
      ctx.beginPath();
      ctx.arc(target.x, target.y, 3, 0, Math.PI * 2);
      ctx.fill();

      animFrameId = requestAnimationFrame(renderRadar);
    };

    renderRadar();
    return () => cancelAnimationFrame(animFrameId);
  }, [trajectory, stepIdx, currentPt, updatingParams]);

  // Solid 3D Antenna Engine
  useEffect(() => {
    const canvas = antennaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2 + 34;
    const cy = h / 2 + 5;

    let animId;
    const renderSolid3DAntenna = () => {
      ctx.clearRect(0, 0, w, h);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "#08101f");
      bgGrad.addColorStop(1, "#050912");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const azDeg = Number(currentPt.azimuth) || 0;
      const rawEl = Number(currentPt.elevation) || 0;
      const servoElDeg = rawEl > 0 ? Math.max(5.0, rawEl) : 18.0;
      const isLocked = rawEl > 0 && !updatingParams;

      const az = (azDeg * Math.PI) / 180;
      const el = (servoElDeg * Math.PI) / 180;
      const camYaw = (camOrbit.yaw * Math.PI) / 180;
      const camPitch = (camOrbit.pitch * Math.PI) / 180;

      const worldToCam = (wx, wy, wz) => {
        const x1 = wx * Math.cos(camYaw) + wz * Math.sin(camYaw);
        const z1 = -wx * Math.sin(camYaw) + wz * Math.cos(camYaw);
        const y1 = wy;
        const y2 = y1 * Math.cos(camPitch) - z1 * Math.sin(camPitch);
        const z2 = y1 * Math.sin(camPitch) + z1 * Math.cos(camPitch);
        const x2 = x1;
        const fov = 215;
        const camDist = 295;
        const scale = fov / Math.max(40, camDist + z2);
        return { px: cx + x2 * scale, py: cy - y2 * scale, depth: z2 };
      };

      const groundY = -44;
      const compassR = 68;

      ctx.beginPath();
      for (let d = 0; d <= 360; d += 5) {
        const rad = (d * Math.PI) / 180;
        const pt = worldToCam(compassR * Math.sin(rad), groundY, -compassR * Math.cos(rad));
        if (d === 0) ctx.moveTo(pt.px, pt.py);
        else ctx.lineTo(pt.px, pt.py);
      }
      ctx.fillStyle = "#0b1526";
      ctx.fill();
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ["N", "E", "S", "W"].forEach((lbl, i) => {
        const rad = (i * 90 * Math.PI) / 180;
        const pLbl = worldToCam((compassR + 13) * Math.sin(rad), groundY, -(compassR + 13) * Math.cos(rad));
        ctx.fillStyle = i === 0 ? "#38bdf8" : "#cbd5e1";
        ctx.font = "bold 8.5px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lbl, pLbl.px, pLbl.py);
      });

      const gCenter = worldToCam(0, groundY + 0.5, 0);
      const arrowTip = worldToCam((compassR - 4) * Math.sin(az), groundY + 0.5, -(compassR - 4) * Math.cos(az));
      const arrowLeft = worldToCam((compassR - 13) * Math.sin(az - 0.14), groundY + 0.5, -(compassR - 13) * Math.cos(az - 0.14));
      const arrowRight = worldToCam((compassR - 13) * Math.sin(az + 0.14), groundY + 0.5, -(compassR - 13) * Math.cos(az + 0.14));

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(gCenter.px, gCenter.py);
      ctx.lineTo(arrowTip.px, arrowTip.py);
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(arrowTip.px, arrowTip.py);
      ctx.lineTo(arrowLeft.px, arrowLeft.py);
      ctx.lineTo(arrowRight.px, arrowRight.py);
      ctx.closePath();
      ctx.fill();

      const baseSides = 12;
      const baseBottomR = 14;
      const baseTopR = 10;
      const baseTopY = -15;
      const towerQuads = [];

      for (let i = 0; i < baseSides; i++) {
        const a1 = (i / baseSides) * Math.PI * 2;
        const a2 = ((i + 1) / baseSides) * Math.PI * 2;
        const v0 = worldToCam(baseBottomR * Math.cos(a1), groundY, baseBottomR * Math.sin(a1));
        const v1 = worldToCam(baseBottomR * Math.cos(a2), groundY, baseBottomR * Math.sin(a2));
        const v2 = worldToCam(baseTopR * Math.cos(a2), baseTopY, baseTopR * Math.sin(a2));
        const v3 = worldToCam(baseTopR * Math.cos(a1), baseTopY, baseTopR * Math.sin(a1));
        const lum = Math.floor(38 + 22 * Math.cos(a1 - camYaw));
        towerQuads.push({
          verts: [v0, v1, v2, v3],
          depth: (v0.depth + v1.depth + v2.depth + v3.depth) * 0.25,
          color: `rgb(${lum}, ${lum + 10}, ${lum + 24})`
        });
      }
      towerQuads.sort((a, b) => b.depth - a.depth);
      towerQuads.forEach((q) => {
        ctx.fillStyle = q.color;
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(q.verts[0].px, q.verts[0].py);
        q.verts.slice(1).forEach((v) => ctx.lineTo(v.px, v.py));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      const Rx = Math.cos(az), Ry = 0, Rz = Math.sin(az);
      const Bx = Math.sin(az) * Math.cos(el);
      const By = Math.sin(el);
      const Bz = -Math.cos(az) * Math.cos(el);
      const Ux = -Math.sin(az) * Math.sin(el);
      const Uy = Math.cos(el);
      const Uz = Math.cos(az) * Math.sin(el);

      const dishLocalToWorld = (u, v, w) => ({
        wx: u * Rx + v * Ux + w * Bx,
        wy: u * Ry + v * Uy + w * By,
        wz: u * Rz + v * Uz + w * Bz
      });

      const yokeSpread = 14;
      const yokeBaseL = worldToCam(-Rx * yokeSpread, baseTopY, -Rz * yokeSpread);
      const yokeBaseR = worldToCam(Rx * yokeSpread, baseTopY, Rz * yokeSpread);
      const yokeTopL = worldToCam(-Rx * yokeSpread, 0, -Rz * yokeSpread);
      const yokeTopR = worldToCam(Rx * yokeSpread, 0, Rz * yokeSpread);
      const yokeMid = worldToCam(0, baseTopY, 0);

      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(yokeTopL.px, yokeTopL.py);
      ctx.lineTo(yokeBaseL.px, yokeBaseL.py);
      ctx.lineTo(yokeMid.px, yokeMid.py);
      ctx.lineTo(yokeBaseR.px, yokeBaseR.py);
      ctx.lineTo(yokeTopR.px, yokeTopR.py);
      ctx.stroke();

      const rings = 5;
      const sectors = 24;
      const maxR = 40;
      const dishDepth = 15;
      const hubOffset = 5;
      const allPolygons = [];
      const Lx = -0.35, Ly = 0.82, Lz = 0.45;

      for (let r = 0; r < rings; r++) {
        const r1 = (r / rings) * maxR;
        const r2 = ((r + 1) / rings) * maxR;
        const w1 = hubOffset + ((r1 * r1) / (maxR * maxR)) * dishDepth;
        const w2 = hubOffset + ((r2 * r2) / (maxR * maxR)) * dishDepth;

        for (let s = 0; s < sectors; s++) {
          const a1 = (s / sectors) * Math.PI * 2;
          const a2 = ((s + 1) / sectors) * Math.PI * 2;
          const aMid = (a1 + a2) * 0.5;

          const p00 = dishLocalToWorld(r1 * Math.cos(a1), r1 * Math.sin(a1), w1);
          const p10 = dishLocalToWorld(r2 * Math.cos(a1), r2 * Math.sin(a1), w2);
          const p11 = dishLocalToWorld(r2 * Math.cos(a2), r2 * Math.sin(a2), w2);
          const p01 = dishLocalToWorld(r1 * Math.cos(a2), r1 * Math.sin(a2), w1);

          const c00 = worldToCam(p00.wx, p00.wy, p00.wz);
          const c10 = worldToCam(p10.wx, p10.wy, p10.wz);
          const c11 = worldToCam(p11.wx, p11.wy, p11.wz);
          const c01 = worldToCam(p01.wx, p01.wy, p01.wz);

          const crossZ = (c10.px - c00.px) * (c01.py - c00.py) - (c10.py - c00.py) * (c01.px - c00.px);
          const isFrontFace = crossZ < 0;

          const slope = (2 * ((r1 + r2) * 0.5) * dishDepth) / (maxR * maxR);
          const nxLocal = -slope * Math.cos(aMid);
          const nyLocal = -slope * Math.sin(aMid);
          const nzLocal = 1.0;
          const nLen = Math.sqrt(nxLocal * nxLocal + nyLocal * nyLocal + nzLocal * nzLocal);
          const nWx = (nxLocal * Rx + nyLocal * Ux + nzLocal * Bx) / nLen;
          const nWy = (nxLocal * Ry + nyLocal * Uy + nzLocal * By) / nLen;
          const nWz = (nxLocal * Rz + nyLocal * Uz + nzLocal * Bz) / nLen;
          const dotLight = Math.max(-1, Math.min(1, nWx * Lx + nWy * Ly + nWz * Lz));

          let fillStyle, strokeStyle;
          if (isFrontFace) {
            const shade = Math.floor(165 + 65 * Math.max(0, dotLight) - (rings - r) * 8);
            fillStyle = r === rings - 1 ? (isLocked ? "#10b981" : "#38bdf8") : `rgb(${shade}, ${shade + 8}, ${Math.min(255, shade + 18)})`;
            strokeStyle = "rgb(100, 116, 139)";
          } else {
            const backShade = Math.floor(36 + 28 * Math.max(0, -dotLight));
            fillStyle = s % 4 === 0 ? `rgb(${backShade + 18}, ${backShade + 26}, ${backShade + 40})` : `rgb(${backShade}, ${backShade + 8}, ${backShade + 18})`;
            strokeStyle = "rgb(30, 41, 59)";
          }

          allPolygons.push({
            verts: [c00, c10, c11, c01],
            depth: (c00.depth + c10.depth + c11.depth + c01.depth) * 0.25,
            fill: fillStyle,
            stroke: strokeStyle
          });
        }
      }

      allPolygons.sort((a, b) => b.depth - a.depth);
      allPolygons.forEach((poly) => {
        ctx.fillStyle = poly.fill;
        ctx.strokeStyle = poly.stroke;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(poly.verts[0].px, poly.verts[0].py);
        poly.verts.slice(1).forEach((v) => ctx.lineTo(v.px, v.py));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      const focalW = hubOffset + 30;
      const feedTipW = dishLocalToWorld(0, 0, focalW);
      const cFeed = worldToCam(feedTipW.wx, feedTipW.wy, feedTipW.wz);

      ctx.fillStyle = isLocked ? "#22c55e" : "#f59e0b";
      ctx.beginPath();
      ctx.arc(cFeed.px, cFeed.py, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(6, 10, 18, 0.9)";
      ctx.fillRect(6, 6, 144, 30);
      ctx.strokeStyle = "#1e293b";
      ctx.strokeRect(6, 6, 144, 30);

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "bold 8.5px monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(`AZ ${updatingParams ? "..." : `${azDeg.toFixed(1)}°`} • EL ${updatingParams ? "..." : `${servoElDeg.toFixed(1)}°`}`, 11, 10);
      ctx.fillStyle = isLocked ? "#22c55e" : "#94a3b8";
      ctx.fillText(isLocked ? "● LOCKED ON PASS" : "● STANDBY", 11, 21);

      animId = requestAnimationFrame(renderSolid3DAntenna);
    };

    renderSolid3DAntenna();
    return () => cancelAnimationFrame(animId);
  }, [currentPt, updatingParams, camOrbit]);

  const handleMouseDown3D = (e) => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, yaw: camOrbit.yaw, pitch: camOrbit.pitch };
  };

  const handleMouseMove3D = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setCamOrbit({
      yaw: dragRef.current.yaw + dx * 0.6,
      pitch: Math.max(10, Math.min(65, dragRef.current.pitch + dy * 0.4))
    });
  };

  const handleMouseUp3D = () => { dragRef.current.active = false; };

  const handleDecodePass = async () => {
    setDecoding(true);
    try {
      const params = new URLSearchParams({
        sat_id: selectedSat.id,
        lat: selectedStation.lat,
        lon: selectedStation.lon,
        station_name: selectedStation.name,
        sat_lat: currentPt.sat_lat,
        sat_lon: currentPt.sat_lon,
        sat_alt_km: currentPt.sat_alt_km
      });
      const res = await fetch(`${API_BASE}/api/process-pass?${params.toString()}`, { method: "POST" });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
      }
      const data = await res.json();
      setDecodedResult(data);
    } catch (e) {
      console.error("Decode error:", e);
      alert(`Decode failed: ${e.message}`);
    }
    setDecoding(false);
  };

  const filteredSats = categoryFilter === "ALL" ? SATELLITE_CATALOG : SATELLITE_CATALOG.filter((s) => s.category === categoryFilter);

  const getImageFilterStyle = () => {
    switch (imgFilter) {
      case "CONTRAST": return "contrast(135%) brightness(105%)";
      case "INVERT": return "invert(100%)";
      default: return "none";
    }
  };

  const imageUrl = decodedResult?.image_url ? `${API_BASE}${decodedResult.image_url}` : null;
  const isAboveHorizon = Number(currentPt.elevation) > 0;
  const formattedSatCoords = formatCoordPair(currentPt.sat_lat, currentPt.sat_lon);

  return (
    <div style={{ background: "#060a12", color: "#e2e8f0", height: "100vh", overflow: "hidden", fontFamily: "'Inter', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>
      
      <style>{`
        @keyframes blink-red-btn {
          0% { background-color: #dc2626; box-shadow: 0 0 14px rgba(239, 68, 68, 0.85); border-color: #fca5a5; }
          50% { background-color: #7f1d1d; box-shadow: 0 0 4px rgba(239, 68, 68, 0.3); border-color: #ef4444; }
          100% { background-color: #dc2626; box-shadow: 0 0 14px rgba(239, 68, 68, 0.85); border-color: #fca5a5; }
        }
        @keyframes pulse-updating { 0% { opacity: 1; } 50% { opacity: 0.35; } 100% { opacity: 1; } }
        .live-red-btn-active { animation: blink-red-btn 1.1s infinite ease-in-out; }
        .updating-text { color: #f59e0b !important; animation: pulse-updating 0.7s infinite; font-size: 11.5px !important; }
      `}</style>

      {/* FULLSCREEN WORLD MAP MODAL */}
      {isMapFullscreen && (
        <div onClick={() => setIsMapFullscreen(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(3, 7, 15, 0.92)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#0b111e", border: "1px solid #38bdf8", borderRadius: "10px", padding: "16px", width: "95vw", maxWidth: "1500px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: 900, color: "#f8fafc" }}>🌍 GLOBAL ORBIT TRACK & LAT/LON GRID — {selectedSat.name} (#{selectedSat.id})</span>
                <span style={{ fontSize: "11px", fontFamily: "monospace", background: "#022c22", border: "1px solid #10b981", color: "#6ee7b7", padding: "4px 10px", borderRadius: "4px", fontWeight: 700 }}>
                  SAT POS: {updatingParams ? "SYNC..." : formattedSatCoords} | ALT: {updatingParams ? "..." : `${currentPt.sat_alt_km} km`}
                </span>
              </div>
              <button onClick={() => setIsMapFullscreen(false)} style={{ background: "#dc2626", color: "#fff", border: "1px solid #fca5a5", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>✕ CLOSE (ESC)</button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", padding: "6px 10px", background: "#060a12", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "10.5px", fontFamily: "monospace", color: "#cbd5e1" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444", border: "1px solid #fff" }} />
                <span><strong>Red Dot:</strong> {selectedSat.name} Position</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(16, 185, 129, 0.25)", border: "1px solid #10b981" }} />
                <span><strong>Green Ring:</strong> Swath Footprint</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#38bdf8", border: "1px solid #fff" }} />
                <span><strong>Blue Dot:</strong> Ground Station ({selectedStation.name.split(" (")[0]})</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 14, height: 2.5, background: "#f59e0b" }} />
                <span><strong>Amber Line:</strong> Next Orbit Path</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 14, height: 0, borderTop: "2px dashed #38bdf8" }} />
                <span><strong>Cyan Dashed:</strong> Past Track</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "2px", background: "rgba(2, 6, 17, 0.85)", border: "1px solid rgba(251, 191, 36, 0.65)" }} />
                <span><strong>Shaded Region:</strong> Night Side</span>
              </span>
            </div>

            <canvas ref={fullMapCanvasRef} width={1460} height={740} style={{ maxWidth: "100%", maxHeight: "72vh", borderRadius: "8px", border: "1px solid #334155", background: "#050912" }} />
          </div>
        </div>
      )}

      {/* TOP HEADER */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "54px", padding: "8px 20px", background: "#0b111e", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 900, fontSize: "17px", color: "#f8fafc", lineHeight: 1.2 }}>🛰️ SATELLITE TRACKING AND IMAGE DECODING</span>
          <span style={{ fontSize: "11px", background: "#064e3b", color: "#34d399", padding: "3px 8px", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700, lineHeight: 1.2 }}>REAL-TIME SGP4 + NASA EOSDIS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontFamily: "monospace" }}>
          <div style={{ background: "#060a12", padding: "7px 15px", borderRadius: "6px", border: "1px solid #334155", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", lineHeight: 1.2 }}>
            <span style={{ color: "#f8fafc", fontWeight: 800 }}>📅 {liveClockFormatted.date}</span>
            <span style={{ color: "#475569" }}>|</span>
            <span style={{ color: "#38bdf8", fontWeight: 800 }}>🕒 {liveClockFormatted.utcTime}</span>
            <span style={{ color: "#475569" }}>|</span>
            <span style={{ color: "#f59e0b", fontWeight: 800 }}>{liveClockFormatted.localTime} IST</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 12px", borderRadius: "6px", fontSize: "12px", lineHeight: 1.2, background: serverOnline ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.15)", border: `1px solid ${serverOnline ? "#10b981" : "#ef4444"}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: serverOnline ? "#10b981" : "#ef4444" }} />
            <span style={{ color: serverOnline ? "#10b981" : "#ef4444", fontWeight: 800 }}>{serverOnline ? "TELEMETRY ONLINE" : "BACKEND OFFLINE"}</span>
          </div>
        </div>
      </header>

      {/* MAIN 3-COLUMN WORKSPACE */}
      <div style={{ display: "grid", gridTemplateColumns: "290px 1fr 460px", gap: "10px", padding: "10px", flex: 1, minHeight: 0 }}>

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
                <option key={st.id} value={st.id}>{st.name} ({Number(st.lat).toFixed(1)}°, {Number(st.lng ?? st.lon).toFixed(1)}°)</option>
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
                    fontSize: "9.5px",
                    padding: "2px 5.5px",
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
                  <div key={sat.id} onClick={() => setSelectedSat(sat)} style={{ padding: "7px 9px", borderRadius: "5px", background: active ? "rgba(56, 189, 248, 0.14)" : "#060a12", border: `1px solid ${active ? "#38bdf8" : "#1e293b"}`, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: active ? "#38bdf8" : "#f1f5f9" }}>{sat.name}</span>
                        <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "3px", background: sat.hasImager ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)", color: sat.hasImager ? "#10b981" : "#f59e0b" }}>{sat.hasImager ? "IMG" : "TLM"}</span>
                      </div>
                      <div style={{ fontSize: "9px", color: "#64748b", fontFamily: "monospace" }}>#{sat.id} • {sat.mode}</div>
                    </div>
                    <div style={{ fontSize: "10px", fontFamily: "monospace", color: "#10b981", fontWeight: 600 }}>{sat.freq} MHz</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "10px", height: "165px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#38bdf8", marginBottom: "6px" }}>UPCOMING SGP4 PASSES ({passes.length})</div>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
              {passes.map((p, idx) => {
                const dt = formatDateTime(p.aos);
                const isSelected = trackingMode === "PASS_REPLAY" && selectedPassIdx === idx;
                return (
                  <div key={idx} onClick={() => { setTrackingMode("PASS_REPLAY"); setSelectedPassIdx(idx); setStepIdx(0); }} style={{ padding: "6px 8px", borderRadius: "4px", background: isSelected ? "rgba(16, 185, 129, 0.14)" : "#060a12", border: `1px solid ${isSelected ? "#10b981" : "#1e293b"}`, cursor: "pointer", fontSize: "10px", fontFamily: "monospace" }}>
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
              })}
            </div>
          </div>

        </div>

        {/* CENTER COLUMN: TELEMETRY (WITH 3D ANTENNA ON LEFT) + LOWER VIEWPORT (SKYPLOT + WORLD MAP) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: 0 }}>
          
          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "10px", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#f8fafc" }}>📡 {selectedSat.name} ORBITAL TELEMETRY</span>
                <span style={{ fontSize: "10px", fontFamily: "monospace", padding: "2px 7px", borderRadius: "4px", background: updatingParams ? "rgba(245, 158, 11, 0.2)" : isAboveHorizon ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)", color: updatingParams ? "#f59e0b" : isAboveHorizon ? "#10b981" : "#f59e0b", fontWeight: 700 }}>
                  {updatingParams ? "⟳ UPDATING..." : isAboveHorizon ? "● IN VIEW" : "● BELOW HORIZON"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { setTrackingMode("LIVE_NOW"); setIsPlaying(false); }} className={trackingMode === "LIVE_NOW" ? "live-red-btn-active" : ""} style={{ background: trackingMode === "LIVE_NOW" ? "#dc2626" : "#1e293b", color: "#fff", border: trackingMode === "LIVE_NOW" ? "2px solid #fca5a5" : "2px solid #334155", borderRadius: "6px", padding: "4px 12px", fontSize: "10px", fontWeight: 900, cursor: "pointer" }}>● LIVE NOW</button>
                <button onClick={() => setTrackingMode("PASS_REPLAY")} style={{ background: trackingMode === "PASS_REPLAY" ? "#0284c7" : "#1e293b", color: "#fff", border: "2px solid", borderColor: trackingMode === "PASS_REPLAY" ? "#38bdf8" : "#334155", borderRadius: "6px", padding: "4px 10px", fontSize: "10px", fontWeight: 700, cursor: "pointer" }}>🔭 PASS #{selectedPassIdx + 1}</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "330px 1fr", gap: "8px", alignItems: "stretch" }}>
              {/* TOP-LEFT SLOT: 3D ANTENNA WINDOW */}
              <div
                style={{
                  background: "#050912",
                  border: "1px solid #10b981",
                  borderRadius: "6px",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 7px", background: "rgba(11, 17, 30, 0.95)", borderBottom: "1px solid #1e293b", fontSize: "9px", fontFamily: "monospace" }}>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>📡 3D TRACKING DISH (DRAG)</span>
                  <button
                    onClick={() => setCamOrbit({ yaw: -32, pitch: 26 })}
                    style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", borderRadius: "3px", fontSize: "8.5px", padding: "1px 6px", cursor: "pointer", fontFamily: "monospace" }}
                  >
                    RESET
                  </button>
                </div>
                <canvas
                  ref={antennaCanvasRef}
                  width={330}
                  height={114}
                  onMouseDown={handleMouseDown3D}
                  onMouseMove={handleMouseMove3D}
                  onMouseUp={handleMouseUp3D}
                  onMouseLeave={handleMouseUp3D}
                  style={{ display: "block", cursor: "grab" }}
                />
              </div>

              {/* 6 TELEMETRY CARDS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px", fontFamily: "monospace" }}>
                <div style={{ background: "#060a12", padding: "7px 8px", borderRadius: "5px", border: "1px solid #1e293b", overflow: "hidden" }}>
                  <div style={{ fontSize: "8.5px", color: "#64748b", whiteSpace: "nowrap" }}>AZIMUTH / ELEVATION</div>
                  <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "12px", fontWeight: 700, color: isAboveHorizon ? "#10b981" : "#f59e0b", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{updatingParams ? "UPDATING..." : `${currentPt.azimuth}° / ${currentPt.elevation}°`}</div>
                </div>
                <div style={{ background: "#060a12", padding: "7px 8px", borderRadius: "5px", border: "1px solid #1e293b", overflow: "hidden" }}>
                  <div style={{ fontSize: "8.5px", color: "#64748b", whiteSpace: "nowrap" }}>SLANT RANGE</div>
                  <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "12px", fontWeight: 700, color: "#f8fafc", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{updatingParams ? "UPDATING..." : `${currentPt.range_km} km`}</div>
                </div>
                <div style={{ background: "#060a12", padding: "7px 8px", borderRadius: "5px", border: "1px solid #1e293b", overflow: "hidden" }}>
                  <div style={{ fontSize: "8.5px", color: "#64748b", whiteSpace: "nowrap" }}>ORBITAL ALTITUDE</div>
                  <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "12px", fontWeight: 700, color: "#34d399", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{updatingParams ? "UPDATING..." : `${currentPt.sat_alt_km || 790.4} km`}</div>
                </div>
                <div style={{ background: "#060a12", padding: "7px 8px", borderRadius: "5px", border: "1px solid #1e293b", overflow: "hidden" }}>
                  <div style={{ fontSize: "8.5px", color: "#64748b", whiteSpace: "nowrap" }}>DOPPLER SHIFT (Δf)</div>
                  <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "12px", fontWeight: 700, color: Number(currentPt.doppler_hz) >= 0 ? "#10b981" : "#f43f5e", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{updatingParams ? "UPDATING..." : `${currentPt.doppler_hz} Hz`}</div>
                </div>
                <div style={{ background: "#060a12", padding: "7px 8px", borderRadius: "5px", border: "1px solid #1e293b", overflow: "hidden" }}>
                  <div style={{ fontSize: "8.5px", color: "#64748b", whiteSpace: "nowrap" }}>CORRECTED RX FREQ</div>
                  <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "12px", fontWeight: 700, color: "#a855f7", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{updatingParams ? "UPDATING..." : `${currentPt.rx_freq_mhz} MHz`}</div>
                </div>
                <div style={{ background: "#060a12", padding: "7px 8px", borderRadius: "5px", border: "1px solid #1e293b", overflow: "hidden" }}>
                  <div style={{ fontSize: "8.5px", color: "#64748b", whiteSpace: "nowrap" }}>RADIAL VEL / FSPL</div>
                  <div className={updatingParams ? "updating-text" : ""} style={{ fontSize: "11.5px", fontWeight: 700, color: "#cbd5e1", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{updatingParams ? "UPDATING..." : `${currentPt.range_rate_kms}km/s (-${currentPt.fspl_db}dB)`}</div>
                </div>
              </div>
            </div>

            {trackingMode === "PASS_REPLAY" && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #1e293b" }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    background: isPlaying ? "#ef4444" : "#10b981",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 12px",
                    fontSize: "10px",
                    fontWeight: 800,
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
                <span style={{ fontFamily: "monospace", fontSize: "10.5px", color: "#38bdf8", fontWeight: 700 }}>
                  STEP {stepIdx + 1}/{Math.max(1, trajectory.length)} • {passTimeFormatted.date} • {passTimeFormatted.localTime} IST
                </span>
              </div>
            )}
          </div>

          {/* LOWER VIEWPORT: POLAR SKYPLOT + WORLD MAP WINDOW */}
          <div style={{ display: "grid", gridTemplateColumns: "255px 1fr", gap: "12px", background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "12px", flex: 1, minHeight: 0, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "100%", display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: 700, color: "#38bdf8", marginBottom: "8px" }}>
                <span>🧭 POLAR SKYPLOT</span>
                <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{updatingParams ? "SYNC..." : `${Number(currentPt.azimuth).toFixed(0)}° / ${Number(currentPt.elevation).toFixed(0)}°`}</span>
              </div>
              <canvas ref={radarCanvasRef} width={235} height={235} style={{ borderRadius: "50%", border: "1px solid #1e293b", background: "#060a12" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", fontWeight: 700, color: "#38bdf8", marginBottom: "6px" }}>
                <span>🌍 LAT/LON ORBIT WORLD MAP ({updatingParams ? "SYNC..." : formattedSatCoords})</span>
                <button
                  onClick={() => setIsMapFullscreen(true)}
                  style={{ background: "#1e293b", color: "#facc15", border: "1px solid #334155", borderRadius: "3px", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: "monospace", fontWeight: 700 }}
                >
                  ⛶ FULLSCREEN
                </button>
              </div>
              <canvas
                ref={lowerMapCanvasRef}
                width={460}
                height={210}
                onClick={() => setIsMapFullscreen(true)}
                title="Click to open Fullscreen World Map"
                style={{ borderRadius: "6px", border: "1px solid #38bdf8", background: "#050912", cursor: "pointer" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "6px", fontSize: "8.5px", fontFamily: "monospace", color: "#94a3b8" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />
                  <span>Sat Pos</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", border: "1px solid #10b981", background: "rgba(16, 185, 129, 0.2)" }} />
                  <span>Footprint</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#38bdf8" }} />
                  <span>Station</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: 11, height: 2, background: "#f59e0b" }} />
                  <span>Orbit Path</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "2px", background: "rgba(2, 6, 17, 0.85)", border: "1px solid rgba(251, 191, 36, 0.65)" }} />
                  <span>Night</span>
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: CLEAN SATELLITE IMAGE DECODER & CLOUD ANALYSIS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: 0 }}>
          
          <div style={{ background: "#0b111e", border: "1px solid #1e293b", borderRadius: "7px", padding: "10px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexShrink: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#f8fafc" }}>
                🖼️ SATELLITE IMAGE DECODER
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {[{ id: "RAW", label: "True Sensor" }, { id: "CONTRAST", label: "Contrast+" }, { id: "INVERT", label: "Invert IR" }].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setImgFilter(mode.id)}
                    style={{
                      fontSize: "10px",
                      padding: "3px 8px",
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

            <div style={{ marginBottom: "8px", flexShrink: 0 }}>
              {selectedSat.hasImager ? (
                <button
                  onClick={handleDecodePass}
                  disabled={decoding || updatingParams}
                  style={{
                    width: "100%",
                    padding: "9px",
                    background: decoding ? "#047857" : "linear-gradient(90deg, #059669, #10b981)",
                    color: "#fff",
                    border: "1px solid #34d399",
                    borderRadius: "6px",
                    fontWeight: 800,
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  {decoding ? "⟳ DECODING REAL SATELLITE SWATH & ANALYZING CLOUDS..." : `⚡ DECODE ${selectedSat.name} SWATH OVER ${selectedStation.name.split(" ")[0].toUpperCase()}`}
                </button>
              ) : (
                <div style={{ padding: "8px 10px", background: "rgba(245, 158, 11, 0.12)", border: "1px solid #f59e0b", borderRadius: "5px", color: "#fcd34d", fontSize: "10px" }}>
                  ⚠️ <strong>{selectedSat.name}</strong> transmits telemetry only. Select a Weather or Earth Obs satellite.
                </div>
              )}
            </div>

            {imageUrl ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
                <div
                  onClick={() => window.open(imageUrl, "_blank")}
                  title="Click image to view full resolution"
                  style={{
                    background: "#060a12",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    overflow: "hidden",
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 0,
                    cursor: "zoom-in"
                  }}
                >
                  <img
                    src={imageUrl}
                    alt="Decoded Satellite Swath"
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: getImageFilterStyle() }}
                  />
                </div>

                <div style={{ background: "#060a12", padding: "8px 10px", borderRadius: "6px", border: "1px solid #1e293b", fontFamily: "monospace", fontSize: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", flexShrink: 0 }}>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "8.5px" }}>IMAGE CAPTURE DATE & TIME</span>
                    <span style={{ color: "#10b981", fontWeight: 700 }}>{decodedResult.decode?.image_capture_datetime || decodedResult.decode?.swath_date}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "8.5px" }}>DECODING DATE & TIME</span>
                    <span style={{ color: "#38bdf8", fontWeight: 700 }}>{decodedResult.decode?.decode_datetime || decodedResult.decode?.capture_utc}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "8.5px" }}>CLOUD COVERAGE ANALYSIS</span>
                    <span style={{ color: "#f59e0b", fontWeight: 700 }}>{decodedResult.decode?.cloud_analysis || "Analyzed"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", display: "block", fontSize: "8.5px" }}>LAT / LON BOUNDING BOX</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{decodedResult.decode?.bbox || `${selectedStation.lat}°, ${selectedStation.lon}°`}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, border: "1px dashed #1e293b", borderRadius: "6px", background: "#060a12", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px", textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: "26px", marginBottom: "8px" }}>🛰️</div>
                <div style={{ fontSize: "12px", color: "#cbd5e1", fontWeight: 700 }}>Dual-Sensor Radiometer Standby</div>
                <div style={{ fontSize: "11px", marginTop: "4px", maxWidth: "280px" }}>Click Decode above to process the latest satellite swath with Lat/Lon grid and cloud analysis.</div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}