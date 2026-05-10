import React, { useRef, useEffect, useState } from 'react';
import { useVisible } from '../../hooks/useVisible';
import rawTargets from '../../data/mandelbrotTargets.json';

const BOUNDS = 2.0;
const ITER_BASE = 128;

// ─── WebGPU (same shader/setup as MandelbrotExplorer) ───────────────────────

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
  let ppu  = min(u.resolution.x, u.resolution.y) * 0.5 * u.scale / 2.0;
  let c_re = u.center.x + (frag.x - u.resolution.x * 0.5) / ppu;
  let c_im = u.center.y - (frag.y - u.resolution.y * 0.5) / ppu;
  var zx = 0.0; var zy = 0.0;
  let max_i = u32(u.max_iter);
  var i = 0u;
  loop {
    if i >= max_i { break; }
    let x2 = zx * zx; let y2 = zy * zy;
    if x2 + y2 > 4.0 { break; }
    let nzy = 2.0 * zx * zy + c_im;
    zx = x2 - y2 + c_re; zy = nzy;
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
    const uniformBuffer = device.createBuffer({ size: 24, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
  } catch { return null; }
}

function gpuRender(gpu, view, w, h, dpr) {
  const { device, pipeline, uniformBuffer, bindGroup, gpuCanvas, gpuCtx } = gpu;
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
  if (gpuCanvas.width !== pw || gpuCanvas.height !== ph) {
    gpuCanvas.width = pw; gpuCanvas.height = ph;
  }
  const zoomBoost = Math.max(0, Math.log2(view.scale));
  const maxIter = Math.min(800, Math.round(ITER_BASE + 60 * zoomBoost));
  device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([pw, ph, view.cx, view.cy, view.scale, maxIter]));
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: gpuCtx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
  });
  pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(6); pass.end();
  device.queue.submit([encoder.finish()]);
}

// ─── CPU fallback palette ────────────────────────────────────────────────────

const PALETTE_SIZE = 512;
const cpuPalette = (() => {
  const stops = [
    [0.00,[3,7,18]],[0.08,[12,25,90]],[0.20,[34,90,200]],[0.35,[56,189,248]],
    [0.50,[192,255,0]],[0.65,[251,146,60]],[0.80,[248,113,113]],[0.92,[255,220,200]],[1.00,[255,255,255]],
  ];
  const buf = new Uint32Array(PALETTE_SIZE);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const t = i / (PALETTE_SIZE - 1);
    let s = 0;
    while (s < stops.length - 1 && stops[s + 1][0] < t) s++;
    let r, g, b;
    if (s >= stops.length - 1) [r, g, b] = stops[stops.length - 1][1];
    else {
      const a = stops[s], c = stops[s + 1], f = (t - a[0]) / (c[0] - a[0]);
      r = Math.round(a[1][0] + (c[1][0] - a[1][0]) * f);
      g = Math.round(a[1][1] + (c[1][1] - a[1][1]) * f);
      b = Math.round(a[1][2] + (c[1][2] - a[1][2]) * f);
    }
    buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return buf;
})();
const SET_COLOR_CPU = (255 << 24) | (24 << 16) | (8 << 8) | 4;

function renderCPU(imgData, w, h, view) {
  const data = new Uint32Array(imgData.data.buffer);
  const ppu = (Math.min(w, h) / 2) * view.scale / BOUNDS;
  const maxIter = 96;
  for (let py = 0; py < h; py++) {
    const cIm = view.cy - (py - h / 2) / ppu;
    for (let px = 0; px < w; px++) {
      const cRe = view.cx + (px - w / 2) / ppu;
      let x = 0, y = 0, i = 0, esc = false;
      while (i < maxIter) {
        const x2 = x * x, y2 = y * y;
        if (x2 + y2 > 4) { esc = true; break; }
        const ny = 2 * x * y + cIm; x = x2 - y2 + cRe; y = ny; i++;
      }
      if (!esc) { data[py * w + px] = SET_COLOR_CPU; continue; }
      const log_zn = 0.5 * Math.log(x * x + y * y);
      const nu = Math.log(log_zn / Math.LN2) / Math.LN2;
      const t = Math.sqrt(Math.min(1, (i + 1 - nu) / maxIter));
      data[py * w + px] = cpuPalette[Math.min(PALETTE_SIZE - 1, (t * (PALETTE_SIZE - 1)) | 0)];
    }
  }
}

// ─── Zoom sequence ───────────────────────────────────────────────────────────

const FULL = { cx: -0.75, cy: 0, scale: 1 };

// WebGPU uses f32 — precision breaks below ~4 f32 steps per pixel.
// Near x≈-0.75: f32 ULP ≈ 1.2e-7; at 400px canvas safe min width ≈ 4.8e-5 → scale ≤ ~80 000.
// Near x≈+0.25: f32 ULP ≈ 3e-8; Elephant Valley can safely reach scale 80 000.
const F32_SCALE_MAX = 80000;

const TARGETS = rawTargets.map(t => {
  const naturalScale = 4 / t.width;  // visible math width = 4/scale for square canvas with BOUNDS=2
  const scale = Math.min(F32_SCALE_MAX, naturalScale);
  // Longer excursion for deeper zooms so there's time to appreciate the detail
  const excursionMs = scale < 500 ? 4000 : scale < 5000 ? 5500 : 7000;
  return { cx: t.x, cy: t.y, scale, excursionMs };
});

const PAUSE_MS = 250;

let _cum = 0;
const TIMELINE = TARGETS.map(target => {
  const start = _cum;
  _cum = start + target.excursionMs + PAUSE_MS;
  return { target, start, end: _cum };
});
const TOTAL_MS = _cum;

function lerp(a, b, t) { return a + (b - a) * t; }

// sin²(πt): 0 → 1 → 0  smooth symmetric — no hold, no abrupt direction change
function excursionEase(t) { const s = Math.sin(Math.PI * t); return s * s; }

function viewAtTime(elapsed, w, h) {
  const tLoop = elapsed % TOTAL_MS;
  const entry = TIMELINE.find(e => tLoop < e.end) ?? TIMELINE[TIMELINE.length - 1];
  const { target, start } = entry;
  const local = tLoop - start;

  if (local >= target.excursionMs) return { ...FULL };

  const t = local / target.excursionMs;
  const e = excursionEase(t);

  const scale = Math.exp(lerp(Math.log(FULL.scale), Math.log(target.scale), e));

  // Pan coupled to zoom: target moves linearly in screen space toward center
  const ppuFull = (Math.min(w, h) / 2) * FULL.scale / BOUNDS;
  const sxT = w / 2 + (target.cx - FULL.cx) * ppuFull;
  const syT = h / 2 - (target.cy - FULL.cy) * ppuFull;
  const sxC = lerp(sxT, w / 2, e);
  const syC = lerp(syT, h / 2, e);
  const ppu = (Math.min(w, h) / 2) * scale / BOUNDS;

  return {
    cx:    target.cx - (sxC - w / 2) / ppu,
    cy:    target.cy + (syC - h / 2) / ppu,
    scale,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MandelbrotZoom() {
  const [containerRef, visible] = useVisible();
  const canvasRef    = useRef(null);
  const gpuRef       = useRef(null);
  const offscreenRef = useRef(null);
  const startRef     = useRef(null);
  const [dims, setDims]     = useState({ w: 400, h: 400 });
  const [gpuActive, setGpuActive] = useState(false);
  const [cpuReady, setCpuReady]   = useState(false);

  useEffect(() => {
    const obs = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.floor(rect.width) - 4; // subtract 2px border each side
      setDims({ w, h: w });
    };
    obs();
    const ro = new ResizeObserver(obs);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // WebGPU init (once)
  useEffect(() => {
    offscreenRef.current = document.createElement('canvas');
    initWebGPU().then(gpu => {
      if (gpu) { gpuRef.current = gpu; setGpuActive(true); }
    });
    return () => { if (gpuRef.current) { gpuRef.current.device.destroy(); gpuRef.current = null; } };
  }, []);

  // CPU fallback: render once when dims known and no GPU
  useEffect(() => {
    if (gpuActive || cpuReady) return;
    const off = offscreenRef.current;
    if (!off) return;
    const rw = Math.floor(dims.w / 2), rh = Math.floor(dims.h / 2);
    off.width = rw; off.height = rh;
    const ofCtx = off.getContext('2d');
    const id = ofCtx.createImageData(rw, rh);
    renderCPU(id, rw, rh, FULL);
    ofCtx.putImageData(id, 0, 0);
    setCpuReady(true);
  }, [dims, gpuActive, cpuReady]);

  // rAF draw loop
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const draw = (time) => {
      const { w, h } = dims;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw; canvas.height = ph;
        ctx.scale(dpr, dpr);
      }

      if (gpuRef.current) {
        if (startRef.current === null) startRef.current = time;
        const view = viewAtTime(time - startRef.current, w, h);
        gpuRender(gpuRef.current, view, w, h, dpr);
        ctx.drawImage(gpuRef.current.gpuCanvas, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, w, h);
        if (offscreenRef.current && cpuReady) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(offscreenRef.current, 0, 0, w, h);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dims, visible, cpuReady]);

  return (
    <div ref={containerRef} style={{ width: '100%', border: '2px solid var(--accent-cyan)', background: 'rgb(3,7,18)', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: dims.w, height: dims.h }} />
      {gpuActive && (
        <div style={{
          position: 'absolute', bottom: '0.5rem', right: '0.5rem',
          fontFamily: 'var(--font-display)', fontSize: '0.6rem',
          color: '#c0ff00', border: '1px solid rgba(192,255,0,0.4)',
          padding: '1px 5px', letterSpacing: '0.05em',
          background: 'rgba(3,7,18,0.7)',
        }}>WebGPU</div>
      )}
    </div>
  );
}
