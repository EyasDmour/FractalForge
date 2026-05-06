import React, { useRef, useEffect, useState, useCallback } from 'react';
import { InlineMath } from 'react-katex';

// ─── Constants ───
const BOUNDS = 1.7;          // default half-bounds (view shows -BOUNDS..+BOUNDS at scale=1)
const ESCAPE_R_SQ = 4;
const PALETTE_SIZE = 512;
const MAX_ORBIT = 30;
const HOVER_MAX = 50;

// Internal render resolutions (CSS-scaled to canvas size)
const JULIA_STATIC_LONG = 900;
const JULIA_LIVE_LONG   = 500;   // only used when c changes (drag/slider)
const ITER_STATIC_BASE  = 128;
const ITER_LIVE         = 72;

// Debounce after wheel/pan/slider stops before triggering full-quality render
const DEBOUNCE_MS = 220;

// Zoom limits
const SCALE_MIN = 0.5;
const SCALE_MAX = 256;

// ─── Helpers ───
function pxPerUnit(w, h, view) {
  return (Math.min(w, h) / 2) * view.scale / BOUNDS;
}

// ─── Palette ───
const palette = (() => {
  const stops = [
    [0.00, [3, 7, 18]],
    [0.08, [12, 25, 90]],
    [0.20, [34, 90, 200]],
    [0.35, [56, 189, 248]],
    [0.50, [192, 255, 0]],
    [0.65, [251, 146, 60]],
    [0.80, [248, 113, 113]],
    [0.92, [255, 220, 200]],
    [1.00, [255, 255, 255]],
  ];
  const buf = new Uint32Array(PALETTE_SIZE);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const t = i / (PALETTE_SIZE - 1);
    let s = 0;
    while (s < stops.length - 1 && stops[s + 1][0] < t) s++;
    let r, g, b;
    if (s >= stops.length - 1) [r, g, b] = stops[stops.length - 1][1];
    else {
      const a = stops[s], c = stops[s + 1];
      const f = (t - a[0]) / (c[0] - a[0]);
      r = Math.round(a[1][0] + (c[1][0] - a[1][0]) * f);
      g = Math.round(a[1][1] + (c[1][1] - a[1][1]) * f);
      b = Math.round(a[1][2] + (c[1][2] - a[1][2]) * f);
    }
    buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return buf;
})();
const SET_COLOR = (255 << 24) | (24 << 16) | (8 << 8) | 4;

// ─── Julia rendering (CPU, view-aware) ───
function renderJulia(imgData, w, h, view, cx, cy, maxIter) {
  const data = new Uint32Array(imgData.data.buffer);
  const ppu = pxPerUnit(w, h, view);
  const halfW = w / 2, halfH = h / 2;
  const log2 = Math.LN2;
  for (let py = 0; py < h; py++) {
    const my = view.cy - (py - halfH) / ppu;
    for (let px = 0; px < w; px++) {
      const mx = view.cx + (px - halfW) / ppu;
      let x = mx, y = my;
      let i = 0, escaped = false;
      while (i < maxIter) {
        const x2 = x * x, y2 = y * y;
        if (x2 + y2 > ESCAPE_R_SQ) { escaped = true; break; }
        const ny = 2 * x * y + cy;
        x = x2 - y2 + cx;
        y = ny;
        i++;
      }
      if (!escaped) {
        data[py * w + px] = SET_COLOR;
      } else {
        const log_zn = 0.5 * Math.log(x * x + y * y);
        const nu = Math.log(log_zn / log2) / log2;
        const smooth = i + 1 - nu;
        const t = Math.sqrt(Math.min(1, smooth / maxIter));
        const idx = Math.min(PALETTE_SIZE - 1, Math.max(0, (t * (PALETTE_SIZE - 1)) | 0));
        data[py * w + px] = palette[idx];
      }
    }
  }
}

function computeOrbit(zx, zy, cx, cy, maxIter) {
  const pts = [{ x: zx, y: zy }];
  let x = zx, y = zy;
  for (let i = 1; i <= maxIter; i++) {
    const x2 = x * x, y2 = y * y;
    if (x2 + y2 > ESCAPE_R_SQ) {
      return { pts, escaped: true, escapedAt: i - 1 };
    }
    const ny = 2 * x * y + cy;
    x = x2 - y2 + cx;
    y = ny;
    pts.push({ x, y });
  }
  return { pts, escaped: false, escapedAt: null };
}

const PRESETS = [
  { name: 'classic swirl',  c: [-0.40,    0.60   ] },
  { name: 'dendrite',       c: [-0.7269,  0.1889 ] },
  { name: 'spiral islands', c: [ 0.285,   0.01   ] },
  { name: 'connected blob', c: [-0.80,    0.156  ] },
  { name: 'douady rabbit',  c: [-0.123,   0.745  ] },
  { name: 'san marco',      c: [-0.75,    0.0    ] },
];

export default function JuliaSetGenerator() {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const offscreenRef = useRef(null);

  // Refs read by canvas render loop
  const z0Ref          = useRef({ x: 0.0, y: 0.0 });
  const cRef           = useRef({ x: -0.4, y: 0.6 });
  const orbitRef       = useRef([]);
  const hoverOrbitRef  = useRef(null);
  const draggingRef    = useRef(null); // 'z0' | 'c' | 'pan' | null
  const setRenderedRef = useRef(false);
  const viewRef        = useRef({ cx: 0, cy: 0, scale: 1 });
  const renderedViewRef = useRef(null); // {cx, cy, scale, dimsW, dimsH} of the last render
  const panStartRef    = useRef(null);

  // Throttle/debounce
  const liveScheduledRef    = useRef(false);
  const staticDebounceRef   = useRef(null);
  const animTimerRef        = useRef(null);

  // React state for UI
  const [dims, setDims]                   = useState({ w: 1100, h: 640 });
  const [z0UI, setZ0UI]                   = useState({ x: 0.0, y: 0.0 });
  const [cUI, setCUI]                     = useState({ x: -0.4, y: 0.6 });
  const [setRendered, setSetRendered]     = useState(false);
  const [pendingRender, setPendingRender] = useState(false);
  const [verdict, setVerdict]             = useState(null);
  const [orbitCount, setOrbitCount]       = useState(0);
  const [running, setRunning]             = useState(false);
  const [speed, setSpeed]                 = useState('normal');
  const [isDragging, setIsDragging]       = useState(false);
  const [hoverInfo, setHoverInfo]         = useState(null);
  const [zoomLevel, setZoomLevel]         = useState(1);

  useEffect(() => { offscreenRef.current = document.createElement('canvas'); }, []);

  useEffect(() => () => {
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    if (staticDebounceRef.current) clearTimeout(staticDebounceRef.current);
  }, []);

  // Responsive sizing — wider + taller to use the wide layout
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.max(420, Math.min(720, Math.floor(w * 0.55)));
      setDims({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Coord conversion (uses viewRef) ──
  const eventToMath = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (dims.w / rect.width);
    const sy = (e.clientY - rect.top)  * (dims.h / rect.height);
    const v = viewRef.current;
    const ppu = pxPerUnit(dims.w, dims.h, v);
    return {
      mx: v.cx + (sx - dims.w / 2) / ppu,
      my: v.cy - (sy - dims.h / 2) / ppu,
      sx, sy,
    };
  }, [dims]);

  const mathToScreen = useCallback((mx, my) => {
    const v = viewRef.current;
    const ppu = pxPerUnit(dims.w, dims.h, v);
    return { sx: dims.w / 2 + (mx - v.cx) * ppu, sy: dims.h / 2 - (my - v.cy) * ppu };
  }, [dims]);

  // ── Render Julia into offscreen ──
  const renderJuliaSet = useCallback((cx, cy, mode) => {
    const aspect = dims.h / dims.w;
    let renderW, renderH, maxIter;
    if (mode === 'live') {
      renderW = JULIA_LIVE_LONG;
      renderH = Math.max(40, Math.round(JULIA_LIVE_LONG * aspect));
      maxIter = ITER_LIVE;
    } else {
      renderW = JULIA_STATIC_LONG;
      renderH = Math.max(80, Math.round(JULIA_STATIC_LONG * aspect));
      // More iterations needed when zoomed in (detail at boundary)
      const zoomBoost = Math.max(0, Math.log2(viewRef.current.scale));
      maxIter = Math.min(800, Math.round(ITER_STATIC_BASE + 60 * zoomBoost));
    }
    const off = offscreenRef.current;
    if (!off) return;
    off.width = renderW;
    off.height = renderH;
    const ofctx = off.getContext('2d');
    const id = ofctx.createImageData(renderW, renderH);
    renderJulia(id, renderW, renderH, viewRef.current, cx, cy, maxIter);
    ofctx.putImageData(id, 0, 0);

    renderedViewRef.current = {
      cx: viewRef.current.cx,
      cy: viewRef.current.cy,
      scale: viewRef.current.scale,
      dimsW: dims.w,
      dimsH: dims.h,
    };
    setRenderedRef.current = true;
    setSetRendered(true);
    if (mode === 'static') setPendingRender(false);
  }, [dims]);

  // Throttled live render (rAF)
  const scheduleLiveRender = useCallback(() => {
    if (liveScheduledRef.current) return;
    liveScheduledRef.current = true;
    requestAnimationFrame(() => {
      liveScheduledRef.current = false;
      renderJuliaSet(cRef.current.x, cRef.current.y, 'live');
    });
  }, [renderJuliaSet]);

  // Debounced static render (after user stops interacting)
  const scheduleStaticRender = useCallback(() => {
    setPendingRender(true);
    if (staticDebounceRef.current) clearTimeout(staticDebounceRef.current);
    staticDebounceRef.current = setTimeout(() => {
      staticDebounceRef.current = null;
      renderJuliaSet(cRef.current.x, cRef.current.y, 'static');
    }, DEBOUNCE_MS);
  }, [renderJuliaSet]);

  const clearOrbit = useCallback(() => {
    if (animTimerRef.current) {
      clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    orbitRef.current = [];
    setOrbitCount(0);
    setVerdict(null);
    setRunning(false);
  }, []);

  // ── Pointer handlers (drag z₀ / c / pan) ──
  const onPointerDown = useCallback((e) => {
    const { sx, sy } = eventToMath(e);
    const z0s = mathToScreen(z0Ref.current.x, z0Ref.current.y);
    const cs  = mathToScreen(cRef.current.x,  cRef.current.y);
    const dz = Math.hypot(sx - z0s.sx, sy - z0s.sy);
    const dc = Math.hypot(sx - cs.sx,  sy - cs.sy);

    if (Math.min(dz, dc) <= 22) {
      draggingRef.current = (dz <= dc) ? 'z0' : 'c';
    } else {
      // Empty area → start panning the view
      draggingRef.current = 'pan';
      panStartRef.current = {
        sx, sy,
        viewCx: viewRef.current.cx,
        viewCy: viewRef.current.cy,
      };
    }
    setIsDragging(true);
    canvasRef.current.setPointerCapture(e.pointerId);
  }, [eventToMath, mathToScreen]);

  const onPointerMove = useCallback((e) => {
    const { mx, my, sx, sy } = eventToMath(e);

    // Hover preview
    if (!draggingRef.current && setRenderedRef.current) {
      const o = computeOrbit(mx, my, cRef.current.x, cRef.current.y, HOVER_MAX);
      hoverOrbitRef.current = o;
      setHoverInfo({ escaped: o.escaped, n: o.escaped ? o.escapedAt : HOVER_MAX });
    }

    if (!draggingRef.current) return;

    if (draggingRef.current === 'pan') {
      const ps = panStartRef.current;
      const ppu = pxPerUnit(dims.w, dims.h, viewRef.current);
      viewRef.current = {
        cx: ps.viewCx - (sx - ps.sx) / ppu,
        cy: ps.viewCy + (sy - ps.sy) / ppu,
        scale: viewRef.current.scale,
      };
      // No live re-render: existing image is transformed under the new view.
      // Static render fires after debounce.
      if (setRenderedRef.current) scheduleStaticRender();
      return;
    }

    // Drag z₀ or c — clamp to current visible viewport (so user can place even when zoomed)
    const halfB = BOUNDS / viewRef.current.scale;
    const clampX = (v) => Math.max(viewRef.current.cx - halfB + 0.02 * halfB, Math.min(viewRef.current.cx + halfB - 0.02 * halfB, v));
    const clampY = (v) => Math.max(viewRef.current.cy - halfB + 0.02 * halfB, Math.min(viewRef.current.cy + halfB - 0.02 * halfB, v));
    const px = { x: clampX(mx), y: clampY(my) };

    if (draggingRef.current === 'z0') {
      z0Ref.current = px;
      setZ0UI(px);
      clearOrbit();
    } else {
      cRef.current = px;
      setCUI(px);
      clearOrbit();
      if (setRenderedRef.current) {
        scheduleLiveRender();
        scheduleStaticRender();
      }
    }
  }, [eventToMath, dims, scheduleLiveRender, scheduleStaticRender, clearOrbit]);

  const onPointerUp = useCallback(() => {
    const which = draggingRef.current;
    draggingRef.current = null;
    setIsDragging(false);
    if ((which === 'c' || which === 'pan') && setRenderedRef.current) {
      // Cancel pending debounce — fire the final hi-res render immediately
      if (staticDebounceRef.current) {
        clearTimeout(staticDebounceRef.current);
        staticDebounceRef.current = null;
      }
      requestAnimationFrame(() => {
        renderJuliaSet(cRef.current.x, cRef.current.y, 'static');
      });
    }
  }, [renderJuliaSet]);

  const onPointerLeave = useCallback(() => {
    hoverOrbitRef.current = null;
    setHoverInfo(null);
  }, []);

  // ── Wheel zoom (toward cursor) ──
  // Attached imperatively so we can preventDefault (React wheel is passive)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (dims.w / rect.width);
      const sy = (e.clientY - rect.top)  * (dims.h / rect.height);

      const v = viewRef.current;
      const ppu = pxPerUnit(dims.w, dims.h, v);
      // Math point under cursor before zoom
      const mx = v.cx + (sx - dims.w / 2) / ppu;
      const my = v.cy - (sy - dims.h / 2) / ppu;

      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, v.scale * factor));
      const newPpu = (Math.min(dims.w, dims.h) / 2) * newScale / BOUNDS;
      const newCx = mx - (sx - dims.w / 2) / newPpu;
      const newCy = my + (sy - dims.h / 2) / newPpu;

      viewRef.current = { cx: newCx, cy: newCy, scale: newScale };
      setZoomLevel(newScale);

      // Don't re-render during zoom; existing image stretches with the view.
      if (setRenderedRef.current) scheduleStaticRender();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [dims, scheduleStaticRender]);

  // Reset view (zoom + pan)
  const onResetView = useCallback(() => {
    viewRef.current = { cx: 0, cy: 0, scale: 1 };
    setZoomLevel(1);
    if (setRenderedRef.current) renderJuliaSet(cRef.current.x, cRef.current.y, 'static');
  }, [renderJuliaSet]);

  // ── Buttons ──
  const onGenerateSet = useCallback(() => {
    renderJuliaSet(cRef.current.x, cRef.current.y, 'static');
  }, [renderJuliaSet]);

  const onRunOrbit = useCallback(() => {
    clearOrbit();
    const z0 = z0Ref.current;
    const c  = cRef.current;

    if (speed === 'instant') {
      const o = computeOrbit(z0.x, z0.y, c.x, c.y, MAX_ORBIT);
      orbitRef.current = o.pts;
      setOrbitCount(o.pts.length);
      setVerdict(o.escaped ? { escapedAt: o.escapedAt } : 'bounded');
      return;
    }

    setRunning(true);
    orbitRef.current = [{ x: z0.x, y: z0.y }];
    setOrbitCount(1);

    const stepDelay = speed === 'slow' ? 250 : 80;
    let step_i = 0;
    let zx = z0.x, zy = z0.y;

    const step = () => {
      step_i++;
      if (step_i > MAX_ORBIT) {
        animTimerRef.current = null;
        setRunning(false);
        setVerdict('bounded');
        return;
      }
      const x2 = zx * zx, y2 = zy * zy;
      if (x2 + y2 > ESCAPE_R_SQ) {
        animTimerRef.current = null;
        setRunning(false);
        setVerdict({ escapedAt: step_i - 1 });
        return;
      }
      const ny = 2 * zx * zy + c.y;
      zx = x2 - y2 + c.x;
      zy = ny;
      orbitRef.current = [...orbitRef.current, { x: zx, y: zy }];
      setOrbitCount(orbitRef.current.length);
      animTimerRef.current = setTimeout(step, stepDelay);
    };
    animTimerRef.current = setTimeout(step, stepDelay);
  }, [speed, clearOrbit]);

  const onPreset = useCallback((preset) => {
    const newC = { x: preset.c[0], y: preset.c[1] };
    cRef.current = newC;
    setCUI(newC);
    clearOrbit();
    if (setRenderedRef.current) renderJuliaSet(newC.x, newC.y, 'static');
  }, [renderJuliaSet, clearOrbit]);

  const onSliderChange = useCallback((axis, e) => {
    const v = parseFloat(e.target.value);
    const newC = axis === 'x' ? { x: v, y: cRef.current.y } : { x: cRef.current.x, y: v };
    cRef.current = newC;
    setCUI(newC);
    clearOrbit();
    if (setRenderedRef.current) {
      scheduleLiveRender();
      scheduleStaticRender();
    }
  }, [scheduleLiveRender, scheduleStaticRender, clearOrbit]);

  // ── Main canvas render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const draw = () => {
      const { w, h } = dims;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      const v = viewRef.current;
      const ppu = pxPerUnit(w, h, v);
      const O = { sx: w / 2 - v.cx * ppu, sy: h / 2 + v.cy * ppu };
      const S = (mx, my) => ({
        sx: w / 2 + (mx - v.cx) * ppu,
        sy: h / 2 - (my - v.cy) * ppu,
      });

      // Background
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, w, h);

      // Julia set — draw the cached offscreen, transformed from its rendered viewport
      // into the current viewport. Stretches/blurs under zoom/pan until debounce
      // fires a fresh static render.
      if (setRenderedRef.current && offscreenRef.current && renderedViewRef.current) {
        const rv = renderedViewRef.current;
        const ppuR = (Math.min(rv.dimsW, rv.dimsH) / 2) * rv.scale / BOUNDS;
        const halfBxR = (rv.dimsW / 2) / ppuR;
        const halfByR = (rv.dimsH / 2) / ppuR;
        const tl = S(rv.cx - halfBxR, rv.cy + halfByR);
        const br = S(rv.cx + halfBxR, rv.cy - halfByR);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offscreenRef.current, tl.sx, tl.sy, br.sx - tl.sx, br.sy - tl.sy);
      }

      const onJulia = setRenderedRef.current;

      // Subtle grid (integer math units)
      ctx.strokeStyle = onJulia ? 'rgba(255,255,255,0.05)' : 'rgba(34,211,238,0.07)';
      ctx.lineWidth = 1;
      const halfB = BOUNDS / v.scale;
      const startI = Math.ceil(v.cx - halfB);
      const endI   = Math.floor(v.cx + halfB);
      const startJ = Math.ceil(v.cy - halfB);
      const endJ   = Math.floor(v.cy + halfB);
      for (let i = startI; i <= endI; i++) {
        const a = S(i, v.cy - halfB), b = S(i, v.cy + halfB);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
      for (let j = startJ; j <= endJ; j++) {
        const a = S(v.cx - halfB, j), b = S(v.cx + halfB, j);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }

      // Axes (only if origin is in view)
      if (O.sx >= 0 && O.sx <= w) {
        ctx.strokeStyle = onJulia ? 'rgba(255,255,255,0.13)' : 'rgba(34,211,238,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(O.sx, 0); ctx.lineTo(O.sx, h); ctx.stroke();
      }
      if (O.sy >= 0 && O.sy <= h) {
        ctx.strokeStyle = onJulia ? 'rgba(255,255,255,0.13)' : 'rgba(34,211,238,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, O.sy); ctx.lineTo(w, O.sy); ctx.stroke();
      }

      // Hover orbit
      if (hoverOrbitRef.current && !draggingRef.current && onJulia) {
        const ho = hoverOrbitRef.current;
        if (ho.pts.length > 1) {
          ctx.strokeStyle = ho.escaped ? 'rgba(255,200,200,0.55)' : 'rgba(220,255,200,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < ho.pts.length; i++) {
            const p = S(ho.pts[i].x, ho.pts[i].y);
            if (i === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          }
          ctx.stroke();
        }
        if (ho.pts.length > 0) {
          const p0 = S(ho.pts[0].x, ho.pts[0].y);
          ctx.beginPath();
          ctx.arc(p0.sx, p0.sy, 3.5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fill();
        }
      }

      // Active orbit (Run)
      const orbit = orbitRef.current;
      if (orbit.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < orbit.length; i++) {
          const p = S(orbit[i].x, orbit[i].y);
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.strokeStyle = 'rgba(56,189,248,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 0; i < orbit.length; i++) {
          const p = S(orbit[i].x, orbit[i].y);
          const isHead = i === orbit.length - 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, isHead ? 5.5 : 3, 0, 2 * Math.PI);
          ctx.fillStyle = isHead ? '#22d3ee' : `rgba(56,189,248,${0.4 + 0.5 * (1 - i / orbit.length)})`;
          ctx.fill();
          if (isHead) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // c point
      const c = cRef.current;
      const cs = S(c.x, c.y);
      ctx.beginPath();
      ctx.arc(cs.sx, cs.sy, 9, 0, 2 * Math.PI);
      ctx.fillStyle = '#4ade80';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('c', cs.sx + 12, cs.sy - 8);

      // z₀ point
      const z0 = z0Ref.current;
      const z0s = S(z0.x, z0.y);
      ctx.beginPath();
      ctx.arc(z0s.sx, z0s.sy, 9, 0, 2 * Math.PI);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('z₀', z0s.sx + 12, z0s.sy - 8);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dims]);

  // Re-render at full quality when canvas dimensions change (rendered offscreen aspect would otherwise be wrong)
  useEffect(() => {
    if (setRenderedRef.current) {
      renderJuliaSet(cRef.current.x, cRef.current.y, 'static');
    }
  }, [dims, renderJuliaSet]);

  // ── UI helpers ──
  const fmt = (x, y) => {
    const s = y < 0 ? '−' : '+';
    return `${x.toFixed(3)} ${s} ${Math.abs(y).toFixed(3)}i`;
  };
  const z0sqPlusC = {
    x: z0UI.x * z0UI.x - z0UI.y * z0UI.y + cUI.x,
    y: 2 * z0UI.x * z0UI.y + cUI.y,
  };

  const btn = (color, disabled) => ({
    background: 'transparent',
    border: `2px solid ${color}`,
    color: color,
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '0.4rem 0.85rem',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
  });

  const cursor = isDragging
    ? (draggingRef.current === 'pan' ? 'grabbing' : 'grabbing')
    : 'crosshair';

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', background: 'rgba(3,7,18,0.95)', border: '2px solid var(--accent-cyan)' }}
    >
      {/* Formula header */}
      <div style={{
        padding: '0.55rem 1.1rem',
        borderBottom: '1px solid rgba(34,211,238,0.18)',
        fontFamily: 'monospace',
        fontSize: '12.5px',
        color: 'var(--text-main)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.7rem',
        flexWrap: 'wrap',
        background: 'rgba(3,7,18,0.7)',
      }}>
        <span style={{ color: 'rgba(148,163,184,0.7)', letterSpacing: '0.05em' }}>FORMULA</span>
        <span style={{ fontSize: '15px' }}><InlineMath math="z_{n+1} = z_n^2 + c" /></span>
        <span style={{ color: 'rgba(148,163,184,0.55)', marginLeft: 'auto', fontSize: '11px' }}>
          drag <span style={{ color: '#38bdf8' }}>z₀</span> &amp; <span style={{ color: '#4ade80' }}>c</span>
          {' · scroll to zoom · drag empty area to pan'}
          {setRendered && <> · hover for orbit preview</>}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerLeave}
        style={{
          display: 'block',
          width: '100%',
          cursor,
          touchAction: 'none',
        }}
      />

      {/* Info panel */}
      <div style={{
        padding: '0.85rem 1.1rem',
        borderTop: '1px solid rgba(34,211,238,0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.7rem',
        background: 'rgba(3,7,18,0.7)',
      }}>
        {/* Coord readouts */}
        <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.7, color: 'var(--text-main)', display: 'flex', flexWrap: 'wrap', gap: '0 2.5rem' }}>
          <div>
            <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>z₀</span>
            {' = '}{fmt(z0UI.x, z0UI.y)}
          </div>
          <div>
            <span style={{ color: '#4ade80', fontWeight: 'bold' }}>c</span>
            {' = '}{fmt(cUI.x, cUI.y)}
          </div>
          <div>
            <span style={{ color: '#fb923c', fontWeight: 'bold' }}>z₀² + c</span>
            {' = '}{fmt(z0sqPlusC.x, z0sqPlusC.y)}
          </div>
        </div>

        {/* C sliders */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 2rem', alignItems: 'center', fontFamily: 'monospace', fontSize: '11.5px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'rgba(148,163,184,0.85)' }}>
            <span>Re(c)</span>
            <input
              type="range" min="-1.5" max="1.5" step="0.001" value={cUI.x}
              onChange={(e) => onSliderChange('x', e)}
              style={{ width: '180px', accentColor: '#4ade80' }}
            />
            <span style={{ color: '#4ade80', minWidth: '60px' }}>{cUI.x.toFixed(3)}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'rgba(148,163,184,0.85)' }}>
            <span>Im(c)</span>
            <input
              type="range" min="-1.5" max="1.5" step="0.001" value={cUI.y}
              onChange={(e) => onSliderChange('y', e)}
              style={{ width: '180px', accentColor: '#4ade80' }}
            />
            <span style={{ color: '#4ade80', minWidth: '60px' }}>{cUI.y.toFixed(3)}</span>
          </label>
        </div>

        {/* Buttons row 1: orbit controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={onRunOrbit} disabled={running} style={btn('#22d3ee', running)}>
            {running ? 'running…' : 'Run orbit'}
          </button>
          <button onClick={onGenerateSet} style={btn('#c0ff00', false)}>
            {setRendered ? 'Re-render set' : 'Generate Julia set'}
          </button>
          <button onClick={clearOrbit} style={btn('rgba(34,211,238,0.55)', false)}>
            Reset orbit
          </button>
          <button onClick={onResetView} disabled={zoomLevel === 1 && viewRef.current.cx === 0 && viewRef.current.cy === 0}
            style={btn('rgba(192,255,0,0.7)', zoomLevel === 1 && viewRef.current.cx === 0 && viewRef.current.cy === 0)}>
            Reset view
          </button>

          <label style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'rgba(148,163,184,0.8)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
            speed:
            <select
              value={speed} onChange={(e) => setSpeed(e.target.value)}
              style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid rgba(34,211,238,0.4)', fontFamily: 'monospace', fontSize: '11.5px', padding: '0.18rem 0.3rem' }}
            >
              <option value="slow">slow</option>
              <option value="normal">normal</option>
              <option value="instant">instant</option>
            </select>
          </label>

          <label style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'rgba(148,163,184,0.8)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            preset c:
            <select
              defaultValue="-1"
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                if (idx >= 0) onPreset(PRESETS[idx]);
                e.target.value = '-1';
              }}
              style={{ background: 'transparent', color: '#4ade80', border: '1px solid rgba(74,222,128,0.4)', fontFamily: 'monospace', fontSize: '11.5px', padding: '0.18rem 0.3rem' }}
            >
              <option value="-1">choose…</option>
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>{p.name}</option>
              ))}
            </select>
          </label>

          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '11.5px', color: 'rgba(148,163,184,0.7)' }}>
            zoom: <span style={{ color: '#c0ff00' }}>{zoomLevel < 10 ? zoomLevel.toFixed(2) : zoomLevel.toFixed(0)}×</span>
          </span>
        </div>

        {/* Status row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', fontFamily: 'monospace', fontSize: '12px', minHeight: '1.6rem' }}>
          {orbitCount > 0 && (
            <span style={{ color: 'rgba(148,163,184,0.85)' }}>
              orbit: <span style={{ color: '#22d3ee' }}>{orbitCount}</span> step{orbitCount !== 1 ? 's' : ''}
            </span>
          )}
          {verdict === 'bounded' && (
            <span style={{ color: '#4ade80', fontWeight: 'bold', padding: '0.2rem 0.55rem', border: '1px solid rgba(74,222,128,0.35)' }}>
              ✓ bounded
            </span>
          )}
          {verdict && typeof verdict === 'object' && (
            <span style={{ color: '#f87171', fontWeight: 'bold', padding: '0.2rem 0.55rem', border: '1px solid rgba(248,113,113,0.35)' }}>
              ⚠ escaped at step {verdict.escapedAt}
            </span>
          )}
          {setRendered && pendingRender && (
            <span style={{ color: 'rgba(192,255,0,0.65)', fontSize: '11px' }}>
              ⚡ sharpening…
            </span>
          )}
          {hoverInfo && setRendered && !isDragging && (
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginLeft: 'auto' }}>
              hover orbit: {hoverInfo.escaped ? `escapes @ ${hoverInfo.n}` : 'bounded'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
