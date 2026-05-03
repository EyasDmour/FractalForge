import React, { useRef, useEffect, useState, useCallback } from 'react';
import { coastlinePoints, landmarks, REAL_KM } from '../../data/aqabaCoast';

/*
 * CoastlineMeasurement
 * 
 * Canvas-based visualization of the coastline paradox.
 * User adjusts ruler size → sees measured length change.
 * Renders inside the DeepDive panel (~680px max width).
 */

// ── Geometry helpers ──

function dist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/** Walk along the coastline with a fixed ruler length. Returns ruler endpoints. */
function measureWithRuler(points, rulerLen) {
  if (points.length < 2 || rulerLen <= 0) return [];

  const segments = [];
  let current = 0; // index of current anchor point

  while (current < points.length - 1) {
    const start = points[current];
    let best = current + 1;

    // Walk forward to find the farthest point within rulerLen straight-line distance
    for (let j = current + 1; j < points.length; j++) {
      const d = dist(start, points[j]);
      if (d <= rulerLen) {
        best = j;
      } else {
        break;
      }
    }

    // If we haven't moved, force advance
    if (best === current) best = current + 1;

    segments.push([start, points[best]]);
    current = best;

    // Reached end
    if (current >= points.length - 1) break;
  }

  return segments;
}

/** Compute the total path length of the raw coastline */
function totalPathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += dist(points[i - 1], points[i]);
  }
  return len;
}

// ── Component ──

export default function CoastlineMeasurement() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [rulerPct, setRulerPct] = useState(50); // 0–100 slider
  const [dimensions, setDimensions] = useState({ w: 600, h: 500 });
  const [stats, setStats] = useState({ segments: 0, measuredKm: 0 });

  // Responsive canvas sizing
  useEffect(() => {
    const observe = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.max(400, Math.min(600, Math.floor(w * 0.85)));
      setDimensions({ w, h });
    };
    observe();
    const ro = new ResizeObserver(observe);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Map slider to ruler size in normalized coordinate space
  // Slider 0 = smallest ruler (~0.015), slider 100 = largest (~0.25)
  const rulerNorm = 0.015 + (rulerPct / 100) * 0.235;

  // Compute total raw path length for km scaling
  const rawLen = totalPathLength(coastlinePoints);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Padding
    const pad = 30;
    const drawW = w - pad * 2;
    const drawH = h - pad * 2;

    // Map normalized [0,1] coords to canvas
    const toCanvas = ([x, y]) => [pad + x * drawW, pad + y * drawH];

    // ── Clear ──
    ctx.fillStyle = 'rgba(3, 7, 18, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // ── Grid (subtle coordinate plane) ──
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.06)';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx <= w; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 0; gy <= h; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    // ── Water tint (left side of coastline) ──
    const pts = coastlinePoints.map(toCanvas);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.04)';
    ctx.fill();

    // ── Land tint (right side) ──
    ctx.beginPath();
    ctx.moveTo(w, 0);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(192, 255, 0, 0.02)';
    ctx.fill();

    // ── Coastline stroke ──
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Glow pass ──
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // ── Ruler segments ──
    const segments = measureWithRuler(coastlinePoints, rulerNorm);
    let totalMeasured = 0;

    segments.forEach(([a, b]) => {
      const [ax, ay] = toCanvas(a);
      const [bx, by] = toCanvas(b);
      totalMeasured += dist(a, b);

      // Ruler line
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = 'rgba(192, 255, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Endpoints
      [
        [ax, ay],
        [bx, by],
      ].forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#c0ff00';
        ctx.fill();
      });
    });

    // ── Landmarks ──
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    landmarks.forEach(({ name, pos }) => {
      const [lx, ly] = toCanvas(pos);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.7)';
      ctx.fillText(name, lx + 8, ly);
    });

    // ── Water / Land labels ──
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
    ctx.fillText('GULF OF AQABA', 12, h - 16);
    ctx.fillStyle = 'rgba(192, 255, 0, 0.1)';
    ctx.textAlign = 'right';
    ctx.fillText('JORDAN', w - 12, h - 16);
    ctx.textAlign = 'left';

    // Compute km
    const kmPerUnit = REAL_KM / rawLen;
    const measuredKm = totalMeasured * kmPerUnit;

    setStats({
      segments: segments.length,
      measuredKm: measuredKm.toFixed(1),
    });
  }, [dimensions, rulerNorm, rawLen]);

  useEffect(() => { draw(); }, [draw]);

  // Ruler size in "km" for display
  const rulerKm = (rulerNorm * (REAL_KM / rawLen) * Math.sqrt(dimensions.w ** 2 + dimensions.h ** 2) / Math.sqrt(2) * 0.003).toFixed(1);

  return (
    <div ref={containerRef} className="coastline-viz">
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.w, height: dimensions.h, display: 'block' }}
      />

      {/* Controls */}
      <div className="coastline-controls">
        <div className="coastline-slider-row">
          <label className="coastline-label">RULER_SIZE</label>
          <input
            type="range"
            min="0"
            max="100"
            value={rulerPct}
            onChange={(e) => setRulerPct(Number(e.target.value))}
            className="coastline-slider"
          />
        </div>
        <div className="coastline-stats">
          <div className="coastline-stat">
            <span className="coastline-stat-label">SEGMENTS</span>
            <span className="coastline-stat-value">{stats.segments}</span>
          </div>
          <div className="coastline-stat">
            <span className="coastline-stat-label">MEASURED</span>
            <span className="coastline-stat-value coastline-stat-value--accent">{stats.measuredKm} km</span>
          </div>
        </div>
      </div>
    </div>
  );
}
