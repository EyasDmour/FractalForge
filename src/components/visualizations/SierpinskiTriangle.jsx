import React, { useRef, useEffect, useState } from 'react';
import { useVisible } from '../../hooks/useVisible';

function midpoint(A, B) {
  return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
}

function centroid(tri) {
  return {
    x: (tri.a.x + tri.b.x + tri.c.x) / 3,
    y: (tri.a.y + tri.b.y + tri.c.y) / 3,
  };
}

function lerpPoint(A, B, t) {
  return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
}

function getInitialTriangle(w, h) {
  const s    = Math.min(w * 0.62, h * 0.72);
  const cx   = w / 2;
  const cy   = h / 2 + s * 0.06;
  const triH = s * Math.sqrt(3) / 2;
  return [{
    a: { x: cx,         y: cy - triH * 2 / 3 },
    b: { x: cx + s / 2, y: cy + triH / 3     },
    c: { x: cx - s / 2, y: cy + triH / 3     },
  }];
}

function nextIteration(triangles) {
  return triangles.flatMap(({ a, b, c }) => {
    const mab = midpoint(a, b);
    const mbc = midpoint(b, c);
    const mac = midpoint(a, c);
    return [
      { a,   b: mab, c: mac },
      { a: mab, b,   c: mbc },
      { a: mac, b: mbc, c   },
    ];
  });
}

const ANIM_DURATION = 600;
const MAX_ITERATIONS = 7;

export default function SierpinskiTriangle() {
  const [containerRef, visible] = useVisible();
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const [iteration, setIteration] = useState(0);

  const trianglesRef    = useRef([]);
  const oldTrianglesRef = useRef([]);
  const animRef         = useRef(null);

  // Responsive sizing
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

  // Init iter 0 on mount/resize
  useEffect(() => {
    if (iteration === 0 && !animRef.current) {
      trianglesRef.current = getInitialTriangle(dimensions.w, dimensions.h);
    }
  }, [dimensions, iteration]);

  const handleNext = () => {
    if (animRef.current) { animRef.current = null; return; }
    if (iteration >= MAX_ITERATIONS) return;

    oldTrianglesRef.current = trianglesRef.current;
    trianglesRef.current = nextIteration(trianglesRef.current);
    setIteration(i => i + 1);
    animRef.current = { startTime: performance.now() };
  };

  const handleReset = () => {
    if (animRef.current) animRef.current = null;
    trianglesRef.current = getInitialTriangle(dimensions.w, dimensions.h);
    setIteration(0);
  };

  // Render loop
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = (time) => {
      const { w, h } = dimensions;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.fillStyle = 'rgba(3, 7, 18, 0.95)';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      if (animRef.current) {
        const elapsed = time - animRef.current.startTime;

        if (elapsed >= ANIM_DURATION) {
          animRef.current = null;
        }

        const t = Math.min(elapsed / ANIM_DURATION, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        // Draw parent triangles solid
        ctx.fillStyle = '#22d3ee';
        oldTrianglesRef.current.forEach(({ a, b, c }) => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fill();
        });

        // Punch center holes: grow from hole centroid to full size
        ctx.fillStyle = 'rgb(3, 7, 18)';
        oldTrianglesRef.current.forEach(({ a, b, c }) => {
          const mab = midpoint(a, b);
          const mbc = midpoint(b, c);
          const mac = midpoint(a, c);
          const cg = { x: (mab.x + mbc.x + mac.x) / 3, y: (mab.y + mbc.y + mac.y) / 3 };
          const ha = lerpPoint(cg, mab, ease);
          const hb = lerpPoint(cg, mbc, ease);
          const hc = lerpPoint(cg, mac, ease);
          ctx.beginPath();
          ctx.moveTo(ha.x, ha.y); ctx.lineTo(hb.x, hb.y); ctx.lineTo(hc.x, hc.y);
          ctx.closePath();
          ctx.fill();
        });
      } else {
        // Static draw
        ctx.fillStyle = '#22d3ee';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = iteration === 0 ? 8 : 0;
        trianglesRef.current.forEach(({ a, b, c }) => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fill();
        });
        ctx.shadowBlur = 0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [dimensions, visible, iteration]);

  return (
    <div
      ref={containerRef}
      className="koch-viz schematic-box"
      style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: dimensions.w, height: dimensions.h }}
        />

        <div style={{
          position: 'absolute', top: '1rem', left: '1rem',
          fontFamily: 'var(--font-display)', fontSize: '0.75rem',
          color: 'var(--text-dim)', background: 'rgba(3,7,18,0.8)',
          padding: '0.5rem', border: '1px solid var(--accent-cyan)'
        }}>
          <div>ITERATION: <span style={{ color: 'var(--accent-neon)' }}>{iteration}</span></div>
          <div>TRIANGLES: <span style={{ color: 'var(--text-main)' }}>{Math.pow(3, iteration)}</span></div>
        </div>
      </div>

      <div style={{
        padding: '1rem', display: 'flex', gap: '1rem',
        borderTop: '2px solid var(--accent-cyan)', background: 'rgba(3,7,18,0.95)',
        alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={handleNext}
          disabled={iteration >= MAX_ITERATIONS}
          className="btn-tech"
          style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
        >
          {iteration >= MAX_ITERATIONS ? 'MAX LIMIT REACHED' : 'NEXT ITERATION'}
        </button>

        <button
          onClick={handleReset}
          disabled={iteration === 0 && !animRef.current}
          style={{
            background: 'transparent', border: '1px solid var(--text-dim)',
            color: 'var(--text-dim)', padding: '0.5rem 1rem',
            fontFamily: 'var(--font-display)', fontSize: '0.8rem',
            cursor: 'pointer', textTransform: 'uppercase'
          }}
        >
          RESET
        </button>
      </div>
    </div>
  );
}
