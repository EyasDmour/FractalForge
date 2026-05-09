import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVisible } from '../../hooks/useVisible';
import { InlineMath } from 'react-katex';

const BOUNDS = 1.0;
const ESCAPE_R_SQ = 4;
const MAX_ORBIT = 150;
const PAINT_ORBIT_STEPS = 100;
const PAINT_THROTTLE = 12;
const DOT_LIFESPAN = 20000; // ms
const THROW_BATCH = 6;      // dots per 16ms interval → ~375/sec
const THROW_INTERVAL = 16;

function computeOrbit(zx, zy, cx, cy, maxSteps) {
  const pts = [{ x: zx, y: zy }];
  let x = zx, y = zy;
  for (let i = 1; i <= maxSteps; i++) {
    const x2 = x * x, y2 = y * y;
    if (x2 + y2 > ESCAPE_R_SQ) return { pts, escaped: true, escapedAt: i - 1 };
    const ny = 2 * x * y + cy;
    x = x2 - y2 + cx;
    y = ny;
    pts.push({ x, y });
  }
  return { pts, escaped: false, escapedAt: null };
}

function getScale(w, h) { return Math.min(w, h) / (2 * BOUNDS); }

// ─── Palette (shared with Mandelbrot/Julia) ───────────────────────────────────
const PALETTE_SIZE = 512;
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

// ─── WebGPU ───────────────────────────────────────────────────────────────────
// Shader: c = pixel position, z starts at z₀ (uniform), BOUNDS = 1.0
const WGSL_SOURCE = `
struct Uniforms {
  resolution : vec2f,
  z0         : vec2f,
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
  // ppu = pixels per unit; BOUNDS = 1.0 so ppu = min(res) / 2
  let ppu  = min(u.resolution.x, u.resolution.y) * 0.5;
  let c_re = (frag.x - u.resolution.x * 0.5) / ppu;
  let c_im = -(frag.y - u.resolution.y * 0.5) / ppu;

  var zx = u.z0.x;
  var zy = u.z0.y;
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
    const device  = await adapter.requestDevice();
    const gpuCanvas = document.createElement('canvas');
    const gpuCtx  = gpuCanvas.getContext('webgpu');
    if (!gpuCtx) return null;
    const format  = navigator.gpu.getPreferredCanvasFormat();
    gpuCtx.configure({ device, format, alphaMode: 'opaque' });
    // Uniforms: resolution(vec2f) + z0(vec2f) + max_iter(f32) + padding = 24 bytes
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

function gpuRender(gpu, z0, w, h, dpr) {
  const { device, pipeline, uniformBuffer, bindGroup, gpuCanvas, gpuCtx } = gpu;
  const pw = Math.floor(w * dpr);
  const ph = Math.floor(h * dpr);
  if (gpuCanvas.width !== pw || gpuCanvas.height !== ph) {
    gpuCanvas.width  = pw;
    gpuCanvas.height = ph;
  }
  device.queue.writeBuffer(
    uniformBuffer, 0,
    new Float32Array([pw, ph, z0.x, z0.y, 200, 0]),
  );
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: gpuCtx.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear', storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// ─── CPU fallback renderer ────────────────────────────────────────────────────
function renderFormulaSet(offscreen, w, h, z0x, z0y) {
  offscreen.width  = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d');
  const imgData = ctx.createImageData(w, h);
  const data    = new Uint32Array(imgData.data.buffer);
  const ppu     = Math.min(w, h) / 2; // BOUNDS = 1.0
  const MAX_ITER_CPU = 200;
  for (let py = 0; py < h; py++) {
    const c_im = -(py - h / 2) / ppu;
    for (let px = 0; px < w; px++) {
      const c_re = (px - w / 2) / ppu;
      let zx = z0x, zy = z0y, i = 0;
      while (i < MAX_ITER_CPU) {
        const x2 = zx * zx, y2 = zy * zy;
        if (x2 + y2 > 4) break;
        const ny = 2 * zx * zy + c_im;
        zx = x2 - y2 + c_re; zy = ny; i++;
      }
      if (i >= MAX_ITER_CPU) {
        data[py * w + px] = SET_COLOR;
      } else {
        const log_zn = 0.5 * Math.log(zx * zx + zy * zy);
        const nu     = Math.log(log_zn / Math.LN2) / Math.LN2;
        const t      = Math.sqrt(Math.min(1, Math.max(0, (i + 1 - nu) / MAX_ITER_CPU)));
        const idx    = Math.min(PALETTE_SIZE - 1, (t * (PALETTE_SIZE - 1)) | 0);
        data[py * w + px] = palette[idx];
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export default function FormulaExplorer() {
  const [containerRef, visible] = useVisible();
  const canvasRef    = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });

  // Math refs
  const z0Ref        = useRef({ x: 0.5, y: 0.4 });
  const cRef         = useRef({ x: 0, y: 0 });
  const orbitRef     = useRef([]);
  const draggingRef  = useRef(null);
  const paintDotsRef   = useRef([]); // queue of { x, y, bounded, t }
  const lastPaintRef   = useRef(0);
  const lastDraggedRef = useRef(null); // 'z0' | 'c' | null — for clear-on-switch

  // GPU / render refs
  const gpuRef       = useRef(null);
  const offscreenRef = useRef(null);  // CPU fallback canvas
  const renderOnRef  = useRef(false);

  // Toggle refs (rAF reads these)
  const trailFadeOnRef = useRef(false);
  const throwingRef    = useRef(false);

  // dimsRef lets setInterval closures read current dims without stale closure
  const dimsRef = useRef({ w: 800, h: 500 });

  // React state (UI)
  const [z0UI, setZ0UI]         = useState({ x: 0.5, y: 0.4 });
  const [cUI, setCUI]           = useState({ x: 0, y: 0 });
  const [orbitLen, setOrbitLen] = useState(0);
  const [verdict, setVerdict]   = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dotCount, setDotCount] = useState(0);

  const [trailFadeOn, _setTrailFadeOn] = useState(false);
  const [throwing, _setThrowing]       = useState(false);
  const [gpuActive, setGpuActive]      = useState(false);
  const [renderOn, _setRenderOn]       = useState(false);

  const setTrailFadeOn = (v) => { trailFadeOnRef.current = v; _setTrailFadeOn(v); };
  const setThrowing    = (v) => { throwingRef.current    = v; _setThrowing(v);    };
  const setRenderOn    = (v) => { renderOnRef.current    = v; _setRenderOn(v);    };

  // Compute orbit instantly and set state
  const recomputeOrbit = useCallback((z0x, z0y, cx, cy) => {
    const o = computeOrbit(z0x, z0y, cx, cy, MAX_ORBIT);
    orbitRef.current = o.pts;
    setOrbitLen(o.pts.length);
    setVerdict(o.escaped ? { escapedAt: o.escapedAt } : 'bounded');
  }, []);

  // Initial orbit on mount + GPU init
  useEffect(() => {
    recomputeOrbit(z0Ref.current.x, z0Ref.current.y, cRef.current.x, cRef.current.y);
    offscreenRef.current = document.createElement('canvas');
    initWebGPU().then(gpu => {
      if (gpu) { gpuRef.current = gpu; setGpuActive(true); }
    });
    return () => { gpuRef.current?.device.destroy(); };
  }, []); // eslint-disable-line

  // Responsive sizing
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.max(380, Math.min(600, Math.floor(w * 0.56)));
      setDims({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Keep dimsRef current for interval closures
  useEffect(() => { dimsRef.current = dims; }, [dims]);

  // Dot throwing loop
  useEffect(() => {
    if (!throwing || !visible) return;
    const id = setInterval(() => {
      const now = Date.now();
      // Expire oldest dots
      const q = paintDotsRef.current;
      let expired = 0;
      while (expired < q.length && now - q[expired].t > DOT_LIFESPAN) expired++;
      if (expired) q.splice(0, expired);
      // Add random c dots across full visible canvas using current z₀
      const { w, h } = dimsRef.current;
      const sc = getScale(w, h);
      const xRange = (w / 2) / sc;
      const yRange = (h / 2) / sc;
      const z0 = z0Ref.current;
      for (let i = 0; i < THROW_BATCH; i++) {
        const cx = (Math.random() * 2 - 1) * xRange;
        const cy = (Math.random() * 2 - 1) * yRange;
        const m  = computeOrbit(z0.x, z0.y, cx, cy, PAINT_ORBIT_STEPS);
        q.push({ x: cx, y: cy, bounded: !m.escaped, t: now });
      }
      setDotCount(q.length);
    }, THROW_INTERVAL);
    return () => clearInterval(id);
  }, [throwing, visible]);

  const mathToScreen = useCallback((mx, my) => {
    const sc = getScale(dims.w, dims.h);
    return { sx: dims.w / 2 + mx * sc, sy: dims.h / 2 - my * sc };
  }, [dims]);

  const eventToCanvas = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      sx: (e.clientX - rect.left) * (dims.w / rect.width),
      sy: (e.clientY - rect.top)  * (dims.h / rect.height),
    };
  }, [dims]);

  const canvasToMath = useCallback((sx, sy) => {
    const sc = getScale(dims.w, dims.h);
    const xBound = (dims.w / 2) / sc - 0.02;
    const yBound = (dims.h / 2) / sc - 0.02;
    return {
      mx: Math.max(-xBound, Math.min(xBound, (sx - dims.w / 2) / sc)),
      my: Math.max(-yBound, Math.min(yBound, -(sy - dims.h / 2) / sc)),
    };
  }, [dims]);

  const clearDots = useCallback(() => {
    paintDotsRef.current = [];
    setDotCount(0);
  }, []);

  const onPointerDown = useCallback((e) => {
    const { sx, sy } = eventToCanvas(e);
    const z0s = mathToScreen(z0Ref.current.x, z0Ref.current.y);
    const cs  = mathToScreen(cRef.current.x,  cRef.current.y);
    const dz  = Math.hypot(sx - z0s.sx, sy - z0s.sy);
    const dc  = Math.hypot(sx - cs.sx,  sy - cs.sy);
    if (Math.min(dz, dc) <= 20) {
      const which = dz <= dc ? 'z0' : 'c';
      // Clear dots when switching between z₀ and c handles
      if (lastDraggedRef.current !== null && lastDraggedRef.current !== which) {
        paintDotsRef.current = [];
        setDotCount(0);
      }
      lastDraggedRef.current = which;
      draggingRef.current = which;
      setIsDragging(true);
      canvasRef.current.setPointerCapture(e.pointerId);
    }
  }, [eventToCanvas, mathToScreen]);

  const onPointerMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const { sx, sy } = eventToCanvas(e);
    const { mx, my } = canvasToMath(sx, sy);

    if (draggingRef.current === 'z0') {
      z0Ref.current = { x: mx, y: my };
      setZ0UI({ x: mx, y: my });
      recomputeOrbit(mx, my, cRef.current.x, cRef.current.y);
      // Paint dot at z₀ position — bounded = z₀ is in the Julia set for current c
      if (throwingRef.current) {
        const now = Date.now();
        if (now - lastPaintRef.current >= PAINT_THROTTLE) {
          lastPaintRef.current = now;
          const c = cRef.current;
          const m = computeOrbit(mx, my, c.x, c.y, PAINT_ORBIT_STEPS);
          paintDotsRef.current.push({ x: mx, y: my, bounded: !m.escaped, t: now });
          setDotCount(paintDotsRef.current.length);
        }
      }
    } else {
      cRef.current = { x: mx, y: my };
      setCUI({ x: mx, y: my });
      recomputeOrbit(z0Ref.current.x, z0Ref.current.y, mx, my);
      // Paint dot at c position — bounded = z₀ orbit stays bounded under this c
      if (throwingRef.current) {
        const now = Date.now();
        if (now - lastPaintRef.current >= PAINT_THROTTLE) {
          lastPaintRef.current = now;
          const z0 = z0Ref.current;
          const m = computeOrbit(z0.x, z0.y, mx, my, PAINT_ORBIT_STEPS);
          paintDotsRef.current.push({ x: mx, y: my, bounded: !m.escaped, t: now });
          setDotCount(paintDotsRef.current.length);
        }
      }
    }
  }, [eventToCanvas, canvasToMath, recomputeOrbit]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
    setIsDragging(false);
  }, []);

  // ── rAF draw loop ──
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
        canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);
      }

      const sc = getScale(w, h);
      const S  = (mx, my) => ({ sx: w / 2 + mx * sc, sy: h / 2 - my * sc });
      const O  = S(0, 0);

      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, w, h);

      // Render blit (GPU live or CPU static)
      if (renderOnRef.current) {
        if (gpuRef.current) {
          gpuRender(gpuRef.current, z0Ref.current, w, h, dpr);
          ctx.drawImage(gpuRef.current.gpuCanvas, 0, 0, w, h);
        } else if (offscreenRef.current?.width > 0) {
          ctx.drawImage(offscreenRef.current, 0, 0, w, h);
        }
      }

      // Expire old dots each frame
      const now = Date.now();
      const q = paintDotsRef.current;
      let expired = 0;
      while (expired < q.length && now - q[expired].t > DOT_LIFESPAN) expired++;
      if (expired) q.splice(0, expired);

      // Grid — cover full visible canvas (x is wider than BOUNDS due to aspect ratio)
      const xRange = (w / 2) / sc;
      ctx.strokeStyle = 'rgba(34,211,238,0.07)';
      ctx.lineWidth = 1;
      const gridStep = 0.25;
      for (let gi = -Math.ceil(xRange / gridStep) * gridStep; gi <= xRange + 0.001; gi += gridStep) {
        ctx.beginPath(); ctx.moveTo(S(gi, 0).sx, 0); ctx.lineTo(S(gi, 0).sx, h); ctx.stroke();
      }
      for (let gi = -BOUNDS; gi <= BOUNDS + 0.001; gi += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, S(0, gi).sy); ctx.lineTo(w, S(0, gi).sy); ctx.stroke();
      }

      // Axes
      ctx.strokeStyle = 'rgba(34,211,238,0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, O.sy); ctx.lineTo(w, O.sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(O.sx, 0); ctx.lineTo(O.sx, h); ctx.stroke();

      // Unit circle
      ctx.strokeStyle = 'rgba(34,211,238,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(O.sx, O.sy, 1 * sc, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);

      // Painted dots — batched by color for perf
      if (q.length > 0) {
        ctx.beginPath();
        for (const dot of q) {
          if (!dot.bounded) continue;
          const p = S(dot.x, dot.y);
          ctx.moveTo(p.sx + 2.5, p.sy);
          ctx.arc(p.sx, p.sy, 2.5, 0, 2 * Math.PI);
        }
        ctx.fillStyle = 'rgba(34,211,238,0.85)';
        ctx.fill();

        ctx.beginPath();
        for (const dot of q) {
          if (dot.bounded) continue;
          const p = S(dot.x, dot.y);
          ctx.moveTo(p.sx + 2.5, p.sy);
          ctx.arc(p.sx, p.sy, 2.5, 0, 2 * Math.PI);
        }
        ctx.fillStyle = 'rgba(239,68,68,0.85)';
        ctx.fill();
      }

      // Active orbit
      const orbit = orbitRef.current;
      if (orbit.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < orbit.length; i++) {
          const p = S(orbit[i].x, orbit[i].y);
          i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy);
        }
        ctx.strokeStyle = 'rgba(56,189,248,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let i = 1; i < orbit.length; i++) {
          const p = S(orbit[i].x, orbit[i].y);
          const alpha = trailFadeOnRef.current ? (i / orbit.length) : 0.8;
          const isLast = i === orbit.length - 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, isLast ? 5 : 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = isLast ? '#22d3ee' : `rgba(56,189,248,${alpha})`;
          ctx.fill();
          if (isLast) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
        }
      }

      // c dot (green)
      const c = cRef.current;
      const cs = S(c.x, c.y);
      ctx.beginPath(); ctx.arc(cs.sx, cs.sy, 9, 0, 2 * Math.PI);
      ctx.fillStyle = '#4ade80'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#4ade80'; ctx.font = 'bold 13px monospace';
      ctx.fillText('c', cs.sx + 12, cs.sy - 8);

      // z₀ dot (blue)
      const z0 = z0Ref.current;
      const z0s = S(z0.x, z0.y);
      ctx.beginPath(); ctx.arc(z0s.sx, z0s.sy, 9, 0, 2 * Math.PI);
      ctx.fillStyle = '#38bdf8'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 13px monospace';
      ctx.fillText('z₀', z0s.sx + 12, z0s.sy - 8);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dims, visible]);

  const fmt = (x, y) => `${x.toFixed(3)} ${y < 0 ? '−' : '+'} ${Math.abs(y).toFixed(3)}i`;
  const z0sqPlusC = {
    x: z0UI.x * z0UI.x - z0UI.y * z0UI.y + cUI.x,
    y: 2 * z0UI.x * z0UI.y + cUI.y,
  };

  const tgl = (label, active, onToggle) => (
    <button key={label} onClick={onToggle} style={{
      background: active ? 'rgba(192,255,0,0.08)' : 'transparent',
      border: `1px solid ${active ? '#c0ff00' : 'rgba(148,163,184,0.35)'}`,
      color: active ? '#c0ff00' : 'rgba(148,163,184,0.7)',
      fontFamily: 'monospace', fontSize: '11px', padding: '0.25rem 0.65rem',
      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  );

  return (
    <div ref={containerRef} style={{ width: '100%', background: 'rgba(3,7,18,0.95)', border: '2px solid var(--accent-cyan)' }}>
      {/* Header */}
      <div style={{ padding: '0.55rem 1.1rem', borderBottom: '1px solid rgba(34,211,238,0.18)', fontFamily: 'monospace', fontSize: '12.5px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', background: 'rgba(3,7,18,0.7)' }}>
        <span style={{ color: 'rgba(148,163,184,0.7)', letterSpacing: '0.05em' }}>FORMULA</span>
        <span style={{ fontSize: '15px' }}><InlineMath math="z_{n+1} = z_n^2 + c" /></span>
        <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto' }}>
          <span><span style={{ color: '#22d3ee', fontSize: '13px' }}>●</span> c inside (Julia connected)</span>
          <span><span style={{ color: '#ef4444', fontSize: '13px' }}>●</span> c outside (disconnected)</span>
        </span>
        <span style={{ color: 'rgba(148,163,184,0.45)', fontSize: '11px', whiteSpace: 'nowrap' }}>
          drag <span style={{ color: '#38bdf8' }}>z₀</span> or <span style={{ color: '#4ade80' }}>c</span>
        </span>
        {gpuActive && (
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#c0ff00', border: '1px solid rgba(192,255,0,0.5)', padding: '1px 5px', whiteSpace: 'nowrap' }}>
            WebGPU
          </span>
        )}
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ display: 'block', width: '100%', cursor: isDragging ? 'grabbing' : 'crosshair', touchAction: 'none' }}
      />

      {/* Info panel */}
      <div style={{ padding: '0.75rem 1.1rem', borderTop: '1px solid rgba(34,211,238,0.18)', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'rgba(3,7,18,0.7)' }}>

        {/* Row 1: Readouts + orbit status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.7, color: 'var(--text-main)', display: 'flex', flexWrap: 'wrap', gap: '0 2rem' }}>
            <div><span style={{ color: '#38bdf8', fontWeight: 'bold' }}>z₀</span>{' = '}{fmt(z0UI.x, z0UI.y)}</div>
            <div><span style={{ color: '#4ade80', fontWeight: 'bold' }}>c</span>{' = '}{fmt(cUI.x, cUI.y)}</div>
            <div><span style={{ color: '#fb923c', fontWeight: 'bold' }}>z₀²+c</span>{' = '}{fmt(z0sqPlusC.x, z0sqPlusC.y)}</div>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {orbitLen > 0 && (
              <span style={{ color: 'rgba(148,163,184,0.7)' }}>
                <span style={{ color: '#22d3ee' }}>{orbitLen}</span> steps
              </span>
            )}
            {verdict === 'bounded' && (
              <span style={{ color: '#4ade80', fontWeight: 'bold', padding: '0.15rem 0.5rem', border: '1px solid rgba(74,222,128,0.35)' }}>
                ✓ bounded
              </span>
            )}
            {verdict && typeof verdict === 'object' && (
              <span style={{ color: '#f87171', fontWeight: 'bold', padding: '0.15rem 0.5rem', border: '1px solid rgba(248,113,113,0.35)' }}>
                ⚠ escaped @{verdict.escapedAt}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Buttons (left) + Toggles (right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                if (!renderOn) {
                  // CPU path: trigger a one-shot render now, then show it
                  if (!gpuRef.current && offscreenRef.current) {
                    const z0 = z0Ref.current;
                    renderFormulaSet(offscreenRef.current, dims.w, dims.h, z0.x, z0.y);
                  }
                }
                setRenderOn(!renderOn);
              }}
              style={{
                background: renderOn ? 'rgba(192,255,0,0.12)' : 'transparent',
                border: `2px solid ${renderOn ? '#c0ff00' : 'rgba(192,255,0,0.5)'}`,
                color: renderOn ? '#c0ff00' : 'rgba(192,255,0,0.7)',
                fontFamily: 'monospace', fontSize: '12px', padding: '0.4rem 0.85rem',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {renderOn ? '■ Hide render' : '▶ Render'}
            </button>
            <button
              onClick={() => setThrowing(!throwing)}
              style={{
                background: throwing ? 'rgba(192,255,0,0.12)' : 'transparent',
                border: `2px solid ${throwing ? '#c0ff00' : 'rgba(34,211,238,0.7)'}`,
                color: throwing ? '#c0ff00' : '#22d3ee',
                fontFamily: 'monospace', fontSize: '12px', padding: '0.4rem 0.85rem',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {throwing ? '■ Stop' : '▶ Throw dots'}
            </button>
            <button
              onClick={() => {
                z0Ref.current = { x: 0, y: 0 };
                setZ0UI({ x: 0, y: 0 });
                recomputeOrbit(0, 0, cRef.current.x, cRef.current.y);
              }}
              style={{
                background: 'transparent', border: '2px solid rgba(56,189,248,0.6)', color: 'rgba(56,189,248,0.9)',
                fontFamily: 'monospace', fontSize: '12px', padding: '0.4rem 0.85rem',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              z₀=0
            </button>
            <button
              onClick={clearDots}
              disabled={dotCount === 0}
              style={{
                background: 'transparent', border: '2px solid rgba(239,68,68,0.6)', color: 'rgba(239,68,68,0.85)',
                fontFamily: 'monospace', fontSize: '12px', padding: '0.4rem 0.85rem',
                cursor: dotCount === 0 ? 'default' : 'pointer', opacity: dotCount === 0 ? 0.35 : 1,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              Clear {dotCount > 0 ? `(${dotCount})` : 'dots'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {tgl('trail fade', trailFadeOn, () => setTrailFadeOn(!trailFadeOn))}
          </div>
        </div>
      </div>
    </div>
  );
}
