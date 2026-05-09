import React, { useRef, useEffect, useState, useCallback } from 'react';
import { InlineMath } from 'react-katex';
import { useVisible } from '../../hooks/useVisible';

// ─── Constants ───
const BOUNDS = 2.0;
const ESCAPE_R_SQ = 4;
const PALETTE_SIZE = 512;
const MAX_ORBIT = 150;
const ITER_STATIC_BASE = 128;
const JULIA_LIVE_LONG = 500;
const ITER_LIVE = 72;
const DEBOUNCE_MS = 220;
const SCALE_MIN = 0.5;
const SCALE_MAX = 1e6;
const ORBIT_LIVE_STEPS = 150;

function pxPerUnit(w, h, view) {
  return (Math.min(w, h) / 2) * view.scale / BOUNDS;
}

// ─── CPU Palette (identical to Julia) ───
const palette = (() => {
  const stops = [
    [0.00, [3,   7,   18 ]],
    [0.08, [12,  25,  90 ]],
    [0.20, [34,  90,  200]],
    [0.35, [56,  189, 248]],
    [0.50, [192, 255, 0  ]],
    [0.65, [251, 146, 60 ]],
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

// ─── CPU Mandelbrot renderer ───
function renderMandelbrot(imgData, w, h, view, maxIter) {
  const data = new Uint32Array(imgData.data.buffer);
  const ppu = pxPerUnit(w, h, view);
  const halfW = w / 2, halfH = h / 2;
  const log2 = Math.LN2;
  for (let py = 0; py < h; py++) {
    const cIm = view.cy - (py - halfH) / ppu;
    for (let px = 0; px < w; px++) {
      const cRe = view.cx + (px - halfW) / ppu;
      let x = 0, y = 0, i = 0, escaped = false;
      while (i < maxIter) {
        const x2 = x * x, y2 = y * y;
        if (x2 + y2 > ESCAPE_R_SQ) { escaped = true; break; }
        const ny = 2 * x * y + cIm;
        x = x2 - y2 + cRe;
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

// Orbit always starts from z₀ = 0
function computeOrbit(cx, cy, maxIter) {
  const pts = [{ x: 0, y: 0 }];
  let x = 0, y = 0;
  for (let i = 1; i <= maxIter; i++) {
    const x2 = x * x, y2 = y * y;
    if (x2 + y2 > ESCAPE_R_SQ) return { pts, escaped: true, escapedAt: i - 1 };
    const ny = 2 * x * y + cy;
    x = x2 - y2 + cx;
    y = ny;
    pts.push({ x, y });
  }
  return { pts, escaped: false, escapedAt: null };
}

// ─── WebGPU ──────────────────────────────────────────────────────────────────

const WGSL_SOURCE = `
struct Uniforms {
  resolution : vec2f,
  center     : vec2f,
  scale      : f32,
  max_iter   : f32,
}
@group(0) @binding(0) var<uniform> u : Uniforms;

fn palette_color(t: f32) -> vec3f {
  let ts = array<f32, 9>(0.0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1.0);
  let cs = array<vec3f, 9>(
    vec3f(  3.0,   7.0,  18.0) / 255.0,
    vec3f( 12.0,  25.0,  90.0) / 255.0,
    vec3f( 34.0,  90.0, 200.0) / 255.0,
    vec3f( 56.0, 189.0, 248.0) / 255.0,
    vec3f(192.0, 255.0,   0.0) / 255.0,
    vec3f(251.0, 146.0,  60.0) / 255.0,
    vec3f(248.0, 113.0, 113.0) / 255.0,
    vec3f(255.0, 220.0, 200.0) / 255.0,
    vec3f(255.0, 255.0, 255.0) / 255.0,
  );
  var s = 0u;
  for (var i = 0u; i < 8u; i++) {
    if ts[i + 1u] <= t { s = i + 1u; }
  }
  if s >= 8u { return cs[8u]; }
  let f = (t - ts[s]) / (ts[s + 1u] - ts[s]);
  return mix(cs[s], cs[s + 1u], f);
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0), vec2f( 1.0,  1.0), vec2f(-1.0,  1.0),
  );
  return vec4f(pos[vi], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let ppu  = min(u.resolution.x, u.resolution.y) * 0.5 * u.scale / ${BOUNDS};
  let c_re = u.center.x + (frag.x - u.resolution.x * 0.5) / ppu;
  let c_im = u.center.y - (frag.y - u.resolution.y * 0.5) / ppu;

  var zx = 0.0;
  var zy = 0.0;
  let max_i = u32(u.max_iter);
  var i = 0u;
  loop {
    if i >= max_i { break; }
    let x2 = zx * zx;
    let y2 = zy * zy;
    if x2 + y2 > 4.0 { break; }
    let nzy = 2.0 * zx * zy + c_im;
    zx = x2 - y2 + c_re;
    zy = nzy;
    i++;
  }

  if i >= max_i {
    return vec4f(4.0 / 255.0, 8.0 / 255.0, 24.0 / 255.0, 1.0);
  }

  let log_zn   = 0.5 * log(zx * zx + zy * zy);
  let nu       = log(log_zn / log(2.0)) / log(2.0);
  let smooth_f = f32(i) + 1.0 - nu;
  let t        = sqrt(clamp(smooth_f / f32(max_i), 0.0, 1.0));
  return vec4f(palette_color(t), 1.0);
}
`;

async function initWebGPU() {
  if (!navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const gpuCanvas = document.createElement('canvas');
    const gpuCtx = gpuCanvas.getContext('webgpu');
    if (!gpuCtx) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    gpuCtx.configure({ device, format, alphaMode: 'opaque' });
    const uniformBuffer = device.createBuffer({
      size: 24,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const shaderModule = device.createShaderModule({ code: WGSL_SOURCE });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex:   { module: shaderModule, entryPoint: 'vs_main' },
      fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    return { device, pipeline, uniformBuffer, bindGroup, gpuCanvas, gpuCtx };
  } catch {
    return null;
  }
}

function gpuRender(gpu, view, w, h, dpr) {
  const { device, pipeline, uniformBuffer, bindGroup, gpuCanvas, gpuCtx } = gpu;
  const pw = Math.floor(w * dpr);
  const ph = Math.floor(h * dpr);
  if (gpuCanvas.width !== pw || gpuCanvas.height !== ph) {
    gpuCanvas.width  = pw;
    gpuCanvas.height = ph;
  }
  const zoomBoost = Math.max(0, Math.log2(view.scale));
  const maxIter = Math.min(800, Math.round(ITER_STATIC_BASE + 60 * zoomBoost));
  device.queue.writeBuffer(
    uniformBuffer, 0,
    new Float32Array([pw, ph, view.cx, view.cy, view.scale, maxIter]),
  );
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: gpuCtx.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// ─── Presets ───
const PRESETS = [
  { name: 'cardioid center',  c: [-0.25,   0.0   ] },
  { name: 'period-2 bulb',    c: [-1.0,    0.0   ] },
  { name: 'period-3 bulb',    c: [-0.125,  0.744 ] },
  { name: 'antenna tip',      c: [-2.0,    0.0   ] },
  { name: 'seahorse valley',  c: [-0.745,  0.113 ] },
  { name: 'elephant valley',  c: [ 0.275,  0.0   ] },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function MandelbrotExplorer({ onCChange } = {}) {
  const [containerRef, visible] = useVisible();
  const canvasRef     = useRef(null);
  const offscreenRef  = useRef(null);
  const gpuRef        = useRef(null);

  const viewRef         = useRef({ cx: -0.75, cy: 0, scale: 1 });
  const cRef            = useRef({ x: -0.5, y: 0 });
  const orbitRef        = useRef([]);
  const hoverOrbitRef   = useRef(null);
  const draggingRef     = useRef(null);
  const animTimerRef    = useRef(null);
  const renderedViewRef = useRef(null);
  const panStartRef     = useRef(null);
  const staticDebounceRef = useRef(null);
  const setRenderedRef  = useRef(false);
  const hoverOrbitOnRef = useRef(false);

  const [dims, setDims]               = useState({ w: 1100, h: 640 });
  const [cUI, setCUI]                 = useState({ x: -0.5, y: 0 });
  const [gpuActive, setGpuActive]     = useState(false);
  const [setRendered, setSetRendered] = useState(false);
  const [pendingRender, setPendingRender] = useState(false);
  const [verdict, setVerdict]         = useState(null);
  const [orbitCount, setOrbitCount]   = useState(0);
  const [running, setRunning]         = useState(false);
  const [speed, setSpeed]             = useState('normal');
  const [isDragging, setIsDragging]   = useState(false);
  const [zoomLevel, setZoomLevel]     = useState(1);
  const [hoverOrbitOn, _setHoverOrbitOn] = useState(false);
  const setHoverOrbitOn = (v) => { hoverOrbitOnRef.current = v; _setHoverOrbitOn(v); if (!v) hoverOrbitRef.current = null; };

  // CPU offscreen canvas
  useEffect(() => { offscreenRef.current = document.createElement('canvas'); }, []);

  // WebGPU init
  useEffect(() => {
    initWebGPU().then(gpu => {
      if (!gpu) return;
      gpuRef.current = gpu;
      setRenderedRef.current = true;
      setSetRendered(true);
      setGpuActive(true);
    });
    return () => { if (gpuRef.current) { gpuRef.current.device.destroy(); gpuRef.current = null; } };
  }, []);

  // Cleanup timers
  useEffect(() => () => {
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    if (staticDebounceRef.current) clearTimeout(staticDebounceRef.current);
  }, []);

  // Compute initial orbit for the default c
  useEffect(() => {
    const o = computeOrbit(cRef.current.x, cRef.current.y, ORBIT_LIVE_STEPS);
    orbitRef.current = o.pts;
    setOrbitCount(o.pts.length);
    setVerdict(o.escaped ? { escapedAt: o.escapedAt } : 'bounded');
  }, []);

  // Responsive sizing
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

  // ── Coord helpers ──
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

  // ── CPU render (fallback) ──
  const renderMandelbrotSet = useCallback((mode) => {
    const aspect = dims.h / dims.w;
    let renderW, renderH, maxIter;
    if (mode === 'live') {
      renderW = JULIA_LIVE_LONG;
      renderH = Math.max(40, Math.round(JULIA_LIVE_LONG * aspect));
      maxIter = ITER_LIVE;
    } else {
      renderW = 1400;
      renderH = Math.max(80, Math.round(1400 * aspect));
      const zoomBoost = Math.max(0, Math.log2(viewRef.current.scale));
      maxIter = Math.min(800, Math.round(ITER_STATIC_BASE + 60 * zoomBoost));
    }
    const off = offscreenRef.current;
    if (!off) return;
    off.width  = renderW;
    off.height = renderH;
    const ofctx = off.getContext('2d');
    const id = ofctx.createImageData(renderW, renderH);
    renderMandelbrot(id, renderW, renderH, viewRef.current, maxIter);
    ofctx.putImageData(id, 0, 0);
    renderedViewRef.current = {
      cx: viewRef.current.cx, cy: viewRef.current.cy,
      scale: viewRef.current.scale, dimsW: dims.w, dimsH: dims.h,
    };
    setRenderedRef.current = true;
    setSetRendered(true);
    if (mode === 'static') setPendingRender(false);
  }, [dims]);

  const scheduleStaticRender = useCallback(() => {
    setPendingRender(true);
    if (staticDebounceRef.current) clearTimeout(staticDebounceRef.current);
    staticDebounceRef.current = setTimeout(() => {
      staticDebounceRef.current = null;
      renderMandelbrotSet('static');
    }, DEBOUNCE_MS);
  }, [renderMandelbrotSet]);

  const clearOrbit = useCallback(() => {
    if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }
    orbitRef.current = [];
    setOrbitCount(0);
    setVerdict(null);
    setRunning(false);
  }, []);

  // ── Pointer handlers ──
  const onPointerDown = useCallback((e) => {
    const { sx, sy } = eventToMath(e);
    const cs = mathToScreen(cRef.current.x, cRef.current.y);
    const dc = Math.hypot(sx - cs.sx, sy - cs.sy);
    if (dc <= 22) {
      draggingRef.current = 'c';
    } else {
      draggingRef.current = 'pan';
      panStartRef.current = { sx, sy, viewCx: viewRef.current.cx, viewCy: viewRef.current.cy };
    }
    setIsDragging(true);
    canvasRef.current.setPointerCapture(e.pointerId);
  }, [eventToMath, mathToScreen]);

  const onPointerMove = useCallback((e) => {
    const { mx, my, sx, sy } = eventToMath(e);

    if (!draggingRef.current) {
      if (hoverOrbitOnRef.current) {
        const o = computeOrbit(mx, my, 80);
        hoverOrbitRef.current = o;
      }
      return;
    }

    if (draggingRef.current === 'pan') {
      const ps = panStartRef.current;
      const ppu = pxPerUnit(dims.w, dims.h, viewRef.current);
      viewRef.current = {
        cx: ps.viewCx - (sx - ps.sx) / ppu,
        cy: ps.viewCy + (sy - ps.sy) / ppu,
        scale: viewRef.current.scale,
      };
      if (!gpuRef.current && setRenderedRef.current) scheduleStaticRender();
      return;
    }

    // Drag c
    const newC = { x: mx, y: my };
    cRef.current = newC;
    setCUI(newC);
    onCChange?.(newC);
    const o = computeOrbit(newC.x, newC.y, ORBIT_LIVE_STEPS);
    orbitRef.current = o.pts;
    setOrbitCount(o.pts.length);
    setVerdict(o.escaped ? { escapedAt: o.escapedAt } : 'bounded');
    setRunning(false);
    if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }
  }, [eventToMath, dims, scheduleStaticRender, onCChange]);

  const onPointerUp = useCallback(() => {
    const which = draggingRef.current;
    draggingRef.current = null;
    setIsDragging(false);
    if (!gpuRef.current && which === 'pan' && setRenderedRef.current) {
      if (staticDebounceRef.current) { clearTimeout(staticDebounceRef.current); staticDebounceRef.current = null; }
      requestAnimationFrame(() => renderMandelbrotSet('static'));
    }
  }, [renderMandelbrotSet]);

  const onPointerLeave = useCallback(() => { hoverOrbitRef.current = null; }, []);

  // ── Wheel zoom ──
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
      const mx = v.cx + (sx - dims.w / 2) / ppu;
      const my = v.cy - (sy - dims.h / 2) / ppu;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, v.scale * factor));
      const newPpu = (Math.min(dims.w, dims.h) / 2) * newScale / BOUNDS;
      viewRef.current = {
        cx: mx - (sx - dims.w / 2) / newPpu,
        cy: my + (sy - dims.h / 2) / newPpu,
        scale: newScale,
      };
      setZoomLevel(newScale);
      if (!gpuRef.current && setRenderedRef.current) scheduleStaticRender();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [dims, scheduleStaticRender]);

  // ── Buttons ──
  const onResetView = useCallback(() => {
    viewRef.current = { cx: -0.75, cy: 0, scale: 1 };
    setZoomLevel(1);
    if (!gpuRef.current && setRenderedRef.current) renderMandelbrotSet('static');
  }, [renderMandelbrotSet]);

  const onRunOrbit = useCallback(() => {
    clearOrbit();
    const c = cRef.current;
    if (speed === 'instant') {
      const o = computeOrbit(c.x, c.y, MAX_ORBIT);
      orbitRef.current = o.pts;
      setOrbitCount(o.pts.length);
      setVerdict(o.escaped ? { escapedAt: o.escapedAt } : 'bounded');
      return;
    }
    setRunning(true);
    orbitRef.current = [{ x: 0, y: 0 }];
    setOrbitCount(1);
    const stepDelay = speed === 'slow' ? 250 : 80;
    let zx = 0, zy = 0, step_i = 0;
    const step = () => {
      step_i++;
      if (step_i > MAX_ORBIT) { animTimerRef.current = null; setRunning(false); setVerdict('bounded'); return; }
      const x2 = zx * zx, y2 = zy * zy;
      if (x2 + y2 > ESCAPE_R_SQ) { animTimerRef.current = null; setRunning(false); setVerdict({ escapedAt: step_i - 1 }); return; }
      const ny = 2 * zx * zy + c.y;
      zx = x2 - y2 + c.x; zy = ny;
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
    onCChange?.(newC);
    if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }
    setRunning(false);
    const o = computeOrbit(newC.x, newC.y, ORBIT_LIVE_STEPS);
    orbitRef.current = o.pts;
    setOrbitCount(o.pts.length);
    setVerdict(o.escaped ? { escapedAt: o.escapedAt } : 'bounded');
  }, [onCChange]);

  // ── Main rAF draw loop ──
  useEffect(() => {
    if (!visible) return;
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

      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, w, h);

      // ── Mandelbrot blit ──
      if (gpuRef.current) {
        gpuRender(gpuRef.current, v, w, h, dpr);
        ctx.drawImage(gpuRef.current.gpuCanvas, 0, 0, w, h);
      } else if (setRenderedRef.current && offscreenRef.current && renderedViewRef.current) {
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

      const hasSet = setRenderedRef.current || !!gpuRef.current;

      // Grid
      ctx.strokeStyle = hasSet ? 'rgba(255,255,255,0.04)' : 'rgba(34,211,238,0.07)';
      ctx.lineWidth = 1;
      const halfB = BOUNDS / v.scale;
      for (let i = Math.ceil(v.cx - halfB); i <= Math.floor(v.cx + halfB); i++) {
        const a = S(i, v.cy - halfB), b = S(i, v.cy + halfB);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
      for (let j = Math.ceil(v.cy - halfB); j <= Math.floor(v.cy + halfB); j++) {
        const a = S(v.cx - halfB, j), b = S(v.cx + halfB, j);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }

      // Axes
      if (O.sx >= 0 && O.sx <= w) {
        ctx.strokeStyle = hasSet ? 'rgba(255,255,255,0.1)' : 'rgba(34,211,238,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(O.sx, 0); ctx.lineTo(O.sx, h); ctx.stroke();
      }
      if (O.sy >= 0 && O.sy <= h) {
        ctx.strokeStyle = hasSet ? 'rgba(255,255,255,0.1)' : 'rgba(34,211,238,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, O.sy); ctx.lineTo(w, O.sy); ctx.stroke();
      }

      // Region labels (only when zoomed out)
      if (v.scale < 2.5) {
        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        const cardioidS = S(0.0, 0.3);
        ctx.fillText('cardioid', cardioidS.sx - 30, cardioidS.sy);
        const p2S = S(-1.0, 0.35);
        ctx.fillText('period-2', p2S.sx - 27, p2S.sy);
      }

      // Orbit
      const orbit = orbitRef.current;
      if (orbit.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < orbit.length; i++) {
          const p = S(orbit[i].x, orbit[i].y);
          if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
        }
        ctx.strokeStyle = 'rgba(56,189,248,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let i = 0; i < orbit.length; i++) {
          const p = S(orbit[i].x, orbit[i].y);
          const isHead = i === orbit.length - 1;
          const isOrigin = i === 0;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, isHead ? 5.5 : isOrigin ? 4.5 : 2.5, 0, 2 * Math.PI);
          if (isOrigin) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
          } else {
            ctx.fillStyle = isHead ? '#22d3ee' : `rgba(56,189,248,${0.3 + 0.6 * (i / orbit.length)})`;
          }
          ctx.fill();
          if (isHead || isOrigin) {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        // z₀ = 0 label
        const originS = S(0, 0);
        if (originS.sx >= 0 && originS.sx <= w && originS.sy >= 0 && originS.sy <= h) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('z₀=0', originS.sx + 8, originS.sy - 6);
        }
      }

      // Hover orbit
      if (hoverOrbitRef.current && !draggingRef.current) {
        const ho = hoverOrbitRef.current;
        if (ho.pts.length > 1) {
          ctx.strokeStyle = ho.escaped ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < ho.pts.length; i++) {
            const p = S(ho.pts[i].x, ho.pts[i].y);
            if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
          }
          ctx.stroke();
        }
      }

      // c marker
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

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dims, visible]);

  // CPU auto-render on resize
  useEffect(() => {
    if (gpuRef.current) return;
    renderMandelbrotSet('static');
  }, [dims, renderMandelbrotSet]);

  // ── UI ──
  const fmt = (x, y) => {
    const s = y < 0 ? '−' : '+';
    return `${x.toFixed(4)} ${s} ${Math.abs(y).toFixed(4)}i`;
  };

  const btn = (color, disabled) => ({
    background: 'transparent', border: `2px solid ${color}`, color,
    fontFamily: 'monospace', fontSize: '12px', padding: '0.4rem 0.85rem',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
    transition: 'opacity 0.15s', whiteSpace: 'nowrap',
  });

  const cursor = isDragging ? 'grabbing' : 'crosshair';

  return (
    <div ref={containerRef} style={{ width: '100%', background: 'rgba(3,7,18,0.95)', border: '2px solid var(--accent-cyan)' }}>
      {/* Header */}
      <div style={{
        padding: '0.55rem 1.1rem', borderBottom: '1px solid rgba(34,211,238,0.18)',
        fontFamily: 'monospace', fontSize: '12.5px', color: 'var(--text-main)',
        display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap',
        background: 'rgba(3,7,18,0.7)',
      }}>
        <span style={{ color: 'rgba(148,163,184,0.7)', letterSpacing: '0.05em' }}>FORMULA</span>
        <span style={{ fontSize: '15px' }}><InlineMath math="z_{n+1} = z_n^2 + c \quad (z_0 = 0)" /></span>
        {gpuActive && (
          <span style={{ fontSize: '10px', color: '#c0ff00', border: '1px solid rgba(192,255,0,0.5)', padding: '1px 6px', letterSpacing: '0.05em' }}>
            WebGPU
          </span>
        )}
        <span style={{ color: 'rgba(148,163,184,0.55)', marginLeft: 'auto', fontSize: '11px' }}>
          drag <span style={{ color: '#4ade80' }}>c</span> to see its orbit
          {' · scroll to zoom · drag empty area to pan'}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerLeave}
        style={{ display: 'block', width: '100%', cursor, touchAction: 'none' }}
      />

      {/* Info panel */}
      <div style={{
        padding: '0.85rem 1.1rem', borderTop: '1px solid rgba(34,211,238,0.18)',
        display: 'flex', flexDirection: 'column', gap: '0.7rem', background: 'rgba(3,7,18,0.7)',
      }}>
        {/* c readout */}
        <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.7, color: 'var(--text-main)', display: 'flex', flexWrap: 'wrap', gap: '0 2.5rem' }}>
          <div><span style={{ color: '#4ade80', fontWeight: 'bold' }}>c</span>{' = '}{fmt(cUI.x, cUI.y)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '11px', alignSelf: 'center' }}>
            orbit starts at <span style={{ color: 'rgba(255,255,255,0.8)' }}>z₀ = 0</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={onRunOrbit} disabled={running} style={btn('#22d3ee', running)}>
            {running ? 'running…' : 'Animate orbit'}
          </button>
          <button onClick={clearOrbit} style={btn('rgba(34,211,238,0.55)', false)}>Reset orbit</button>
          <button
            onClick={() => setHoverOrbitOn(!hoverOrbitOn)}
            style={{ ...btn(hoverOrbitOn ? '#c0ff00' : 'rgba(148,163,184,0.5)', false), background: hoverOrbitOn ? 'rgba(192,255,0,0.08)' : 'transparent', border: `1px solid ${hoverOrbitOn ? '#c0ff00' : 'rgba(148,163,184,0.35)'}`, fontSize: '11px', padding: '0.25rem 0.65rem' }}
          >
            hover orbit
          </button>
          <button
            onClick={onResetView}
            disabled={zoomLevel === 1 && viewRef.current.cx === -0.75 && viewRef.current.cy === 0}
            style={btn('rgba(192,255,0,0.7)', zoomLevel === 1 && viewRef.current.cx === -0.75 && viewRef.current.cy === 0)}
          >
            Reset view
          </button>

          <label style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'rgba(148,163,184,0.8)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
            speed:
            <select value={speed} onChange={(e) => setSpeed(e.target.value)}
              style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid rgba(34,211,238,0.4)', fontFamily: 'monospace', fontSize: '11.5px', padding: '0.18rem 0.3rem' }}>
              <option value="slow">slow</option>
              <option value="normal">normal</option>
              <option value="instant">instant</option>
            </select>
          </label>

          <label style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'rgba(148,163,184,0.8)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            preset c:
            <select defaultValue="-1"
              onChange={(e) => { const idx = parseInt(e.target.value, 10); if (idx >= 0) onPreset(PRESETS[idx]); e.target.value = '-1'; }}
              style={{ background: 'transparent', color: '#4ade80', border: '1px solid rgba(74,222,128,0.4)', fontFamily: 'monospace', fontSize: '11.5px', padding: '0.18rem 0.3rem' }}>
              <option value="-1">choose…</option>
              {PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
            </select>
          </label>

          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '11.5px', color: 'rgba(148,163,184,0.7)' }}>
            zoom: <span style={{ color: '#c0ff00' }}>{zoomLevel < 10 ? zoomLevel.toFixed(2) : zoomLevel.toFixed(0)}×</span>
          </span>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', fontFamily: 'monospace', fontSize: '12px', minHeight: '1.6rem' }}>
          {orbitCount > 0 && (
            <span style={{ color: 'rgba(148,163,184,0.85)' }}>
              orbit: <span style={{ color: '#22d3ee' }}>{orbitCount}</span> step{orbitCount !== 1 ? 's' : ''}
            </span>
          )}
          {verdict === 'bounded' && (
            <span style={{ color: '#4ade80', fontWeight: 'bold', padding: '0.2rem 0.55rem', border: '1px solid rgba(74,222,128,0.35)' }}>
              ✓ bounded — c is in the Mandelbrot set
            </span>
          )}
          {verdict && typeof verdict === 'object' && (
            <span style={{ color: '#f87171', fontWeight: 'bold', padding: '0.2rem 0.55rem', border: '1px solid rgba(248,113,113,0.35)' }}>
              ⚠ escaped at step {verdict.escapedAt} — c is outside the set
            </span>
          )}
          {!gpuActive && setRendered && pendingRender && (
            <span style={{ color: 'rgba(192,255,0,0.65)', fontSize: '11px' }}>⚡ sharpening…</span>
          )}
        </div>
      </div>
    </div>
  );
}
