import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVisible } from '../../hooks/useVisible';

// Newton's method for f(z) = z³ − 1
// N(z) = (2z³ + 1) / (3z²)
// Three roots: (1,0)  |  (−½, +√3/2)  |  (−½, −√3/2)

const BOUNDS = 2.0; // same convention as MandelbrotExplorer

// ─── CPU renderer ────────────────────────────────────────────────────────────

function renderNewtonCPU(canvas, w, h, cx, cy, scale) {
  const sw = Math.floor(w / 2);
  const sh = Math.floor(h / 2);
  canvas.width  = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  const img  = ctx.createImageData(sw, sh);
  const data = img.data;
  const ppu  = (Math.min(sw, sh) / 2) * scale / BOUNDS;
  const MAX  = 60;
  const EPS2 = 1e-6;
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      let zx = cx + (px - sw / 2) / ppu;
      let zy = cy - (py - sh / 2) / ppu;
      let it = 0, root = -1;
      while (it < MAX) {
        const z2x = zx * zx - zy * zy, z2y = 2 * zx * zy;
        const z3x = z2x * zx - z2y * zy, z3y = z2x * zy + z2y * zx;
        const nx = 2 * z3x + 1, ny = 2 * z3y;
        const dx = 3 * z2x,    dy = 3 * z2y;
        const den = dx * dx + dy * dy;
        if (den < 1e-10) break;
        zx = (nx * dx + ny * dy) / den;
        zy = (ny * dx - nx * dy) / den;
        if ((zx - 1  ) ** 2 + zy ** 2                           < EPS2) { root = 0; break; }
        if ((zx + 0.5) ** 2 + (zy - 0.8660254) ** 2             < EPS2) { root = 1; break; }
        if ((zx + 0.5) ** 2 + (zy + 0.8660254) ** 2             < EPS2) { root = 2; break; }
        it++;
      }
      const shade = 1 - Math.sqrt(it / MAX) * 0.78;
      const p = (py * sw + px) * 4;
      if      (root === 0) { data[p] = 34  * shade; data[p+1] = 211 * shade; data[p+2] = 238 * shade; } // #22d3ee cyan
      else if (root === 1) { data[p] = 192 * shade; data[p+1] = 255 * shade; data[p+2] =   0 * shade; } // #c0ff00 neon
      else if (root === 2) { data[p] = 148 * shade; data[p+1] = 163 * shade; data[p+2] = 184 * shade; } // #94a3b8 slate
      else                 { data[p] = 4;            data[p+1] = 5;           data[p+2] =  13;          }
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
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
  let ppu = min(u.resolution.x, u.resolution.y) * 0.5 * u.scale / 2.0;
  var zx  = u.center.x + (frag.x - u.resolution.x * 0.5) / ppu;
  var zy  = u.center.y - (frag.y - u.resolution.y * 0.5) / ppu;

  let max_i = u32(u.max_iter);
  var i: u32   = 0u;
  var root: i32 = -1;

  loop {
    if i >= max_i { break; }
    let z2x = zx * zx - zy * zy;
    let z2y = 2.0 * zx * zy;
    let z3x = z2x * zx - z2y * zy;
    let z3y = z2x * zy + z2y * zx;
    let nx  = 2.0 * z3x + 1.0;
    let ny  = 2.0 * z3y;
    let dx  = 3.0 * z2x;
    let dy  = 3.0 * z2y;
    let den = dx * dx + dy * dy;
    if den < 0.000001 { break; }
    zx = (nx * dx + ny * dy) / den;
    zy = (ny * dx - nx * dy) / den;
    let e = 0.000001;
    if (zx - 1.0) * (zx - 1.0) + zy * zy                               < e { root = 0; break; }
    if (zx + 0.5) * (zx + 0.5) + (zy - 0.8660254) * (zy - 0.8660254)  < e { root = 1; break; }
    if (zx + 0.5) * (zx + 0.5) + (zy + 0.8660254) * (zy + 0.8660254)  < e { root = 2; break; }
    i += 1u;
  }

  let shade = 1.0 - sqrt(f32(i) / u.max_iter) * 0.78;
  if root == 0 { return vec4f(vec3f( 34.0, 211.0, 238.0) / 255.0 * shade, 1.0); } // #22d3ee cyan
  if root == 1 { return vec4f(vec3f(192.0, 255.0,   0.0) / 255.0 * shade, 1.0); } // #c0ff00 neon
  if root == 2 { return vec4f(vec3f(148.0, 163.0, 184.0) / 255.0 * shade, 1.0); } // #94a3b8 slate
  return vec4f(0.015, 0.02, 0.05, 1.0);
}
`;

// Identical to MandelbrotExplorer.initWebGPU — same 24-byte uniform layout
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
  const maxIter   = Math.min(256, Math.round(60 + 40 * zoomBoost));
  device.queue.writeBuffer(uniformBuffer, 0,
    new Float32Array([pw, ph, view.cx, view.cy, view.scale, maxIter]));
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: gpuCtx.getCurrentTexture().createView(),
      clearValue: { r: 0.015, g: 0.02, b: 0.05, a: 1 },
      loadOp: 'clear', storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_VIEW = { cx: 0, cy: 0, scale: 1.0 };

export default function NewtonFractal() {
  const [containerRef, visible] = useVisible();
  const canvasRef     = useRef(null);
  const gpuRef        = useRef(null);
  const offscreenRef  = useRef(null);
  const viewRef       = useRef({ ...DEFAULT_VIEW });
  const dimsRef       = useRef({ w: 800, h: 500 });
  const draggingRef   = useRef(false);
  const lastPosRef    = useRef({ x: 0, y: 0 });
  const renderTimerRef = useRef(null);

  const [dims, setDims]       = useState({ w: 800, h: 500 });
  const [gpuActive, setGpuActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { dimsRef.current = dims; }, [dims]);

  // Resize observer
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.max(360, Math.min(600, Math.floor(w * 0.55)));
      setDims({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // CPU offscreen canvas
  useEffect(() => { offscreenRef.current = document.createElement('canvas'); }, []);

  // GPU init
  useEffect(() => {
    initWebGPU().then(gpu => {
      if (gpu) { gpuRef.current = gpu; setGpuActive(true); }
    });
    return () => gpuRef.current?.device.destroy();
  }, []);

  // CPU render helper (uses refs — no stale closure)
  const scheduleCPURender = useCallback(() => {
    if (gpuRef.current || !offscreenRef.current) return;
    clearTimeout(renderTimerRef.current);
    renderTimerRef.current = setTimeout(() => {
      const { w, h } = dimsRef.current;
      const v = viewRef.current;
      renderNewtonCPU(offscreenRef.current, w, h, v.cx, v.cy, v.scale);
    }, 300);
  }, []);

  // Initial CPU render when dims settle (GPU path doesn't need this)
  useEffect(() => {
    if (!gpuActive) scheduleCPURender();
  }, [dims, gpuActive, scheduleCPURender]);

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
      if (gpuRef.current) {
        gpuRender(gpuRef.current, viewRef.current, w, h, dpr);
        ctx.drawImage(gpuRef.current.gpuCanvas, 0, 0, w, h);
      } else if (offscreenRef.current?.width) {
        ctx.drawImage(offscreenRef.current, 0, 0, w, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dims, visible]);

  // ── Pan ──
  const onPointerDown = useCallback((e) => {
    draggingRef.current = true;
    lastPosRef.current  = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    canvasRef.current.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const { w, h } = dimsRef.current;
    const ppu = (Math.min(w, h) / 2) * viewRef.current.scale / BOUNDS;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    viewRef.current = {
      ...viewRef.current,
      cx: viewRef.current.cx - dx / ppu,
      cy: viewRef.current.cy + dy / ppu,
    };
    scheduleCPURender();
  }, [scheduleCPURender]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    setIsDragging(false);
  }, []);

  // ── Zoom (wheel) ──
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1 / 0.85;
    viewRef.current = { ...viewRef.current, scale: viewRef.current.scale * factor };
    scheduleCPURender();
  }, [scheduleCPURender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onReset = useCallback(() => {
    viewRef.current = { ...DEFAULT_VIEW };
    scheduleCPURender();
  }, [scheduleCPURender]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', background: 'rgba(3,7,18,0.95)', border: '2px solid var(--accent-cyan)' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ display: 'block', width: '100%', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      />
      <div style={{
        padding: '0.4rem 1rem',
        borderTop: '1px solid rgba(34,211,238,0.18)',
        background: 'rgba(3,7,18,0.7)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        fontFamily: 'monospace',
        fontSize: '11px',
      }}>
        {gpuActive && (
          <span style={{ color: '#c0ff00', border: '1px solid #c0ff0066', padding: '1px 5px' }}>WebGPU</span>
        )}
        <span style={{ color: 'rgba(148,163,184,0.5)' }}>scroll to zoom · drag to pan</span>
        <span style={{ color: 'rgba(148,163,184,0.4)', flexGrow: 1 }}>
          f(z) = z³ − 1 &nbsp;·&nbsp;
          <span style={{ color: '#22d3ee' }}>■</span> root 1 &nbsp;
          <span style={{ color: '#c0ff00' }}>■</span> root 2 &nbsp;
          <span style={{ color: '#94a3b8' }}>■</span> root 3
        </span>
        <button
          onClick={onReset}
          style={{
            background: 'transparent',
            border: '1px solid rgba(34,211,238,0.3)',
            color: 'rgba(34,211,238,0.6)',
            fontFamily: 'monospace',
            fontSize: '11px',
            padding: '0.2rem 0.5rem',
            cursor: 'pointer',
          }}
        >
          reset view
        </button>
      </div>
    </div>
  );
}
