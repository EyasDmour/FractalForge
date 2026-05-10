import React, { useRef, useEffect, useState } from 'react';
import { useVisible } from '../../hooks/useVisible';

function midpoint(A, B) { return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }; }
function lerpPoint(A, B, t) { return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }; }

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
    const mab = midpoint(a, b), mbc = midpoint(b, c), mac = midpoint(a, c);
    return [
      { a, b: mab, c: mac },
      { a: mab, b, c: mbc },
      { a: mac, b: mbc, c },
    ];
  });
}

function drawFilled(ctx, triangles) {
  ctx.fillStyle = '#22d3ee';
  for (const { a, b, c } of triangles) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHoles(ctx, parentTris, holeEase) {
  ctx.fillStyle = 'rgb(3, 7, 18)';
  for (const { a, b, c } of parentTris) {
    const mab = midpoint(a, b), mbc = midpoint(b, c), mac = midpoint(a, c);
    const cg = { x: (mab.x + mbc.x + mac.x) / 3, y: (mab.y + mbc.y + mac.y) / 3 };
    const ha = lerpPoint(cg, mab, holeEase);
    const hb = lerpPoint(cg, mbc, holeEase);
    const hc = lerpPoint(cg, mac, holeEase);
    ctx.beginPath();
    ctx.moveTo(ha.x, ha.y); ctx.lineTo(hb.x, hb.y); ctx.lineTo(hc.x, hc.y);
    ctx.closePath();
    ctx.fill();
  }
}

const MAX_ITER = 6;
const ANIM_MS  = 350;
const HOLD_MS  = 0;

export default function SierpinskiLoop() {
  const [containerRef, visible] = useVisible();
  const canvasRef       = useRef(null);
  const [dims, setDims] = useState({ w: 400, h: 400 });

  const allItersRef   = useRef([]);
  const iterRef       = useRef(0);
  const dirRef        = useRef(1);
  const phaseRef      = useRef('hold');
  const phaseStartRef = useRef(null);

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

  useEffect(() => {
    const iters = [getInitialTriangle(dims.w, dims.h)];
    for (let i = 1; i <= MAX_ITER; i++) iters.push(nextIteration(iters[i - 1]));
    allItersRef.current = iters;
    iterRef.current = 0;
    dirRef.current  = 1;
    phaseRef.current = 'hold';
    phaseStartRef.current = null;
  }, [dims]);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const render = (time) => {
      const { w, h } = dims;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw; canvas.height = ph;
        ctx.scale(dpr, dpr);
      }
      if (phaseStartRef.current === null) phaseStartRef.current = time;

      const allIters = allItersRef.current;
      if (!allIters.length) { raf = requestAnimationFrame(render); return; }

      const elapsed = time - phaseStartRef.current;
      const iter    = iterRef.current;

      ctx.fillStyle = 'rgb(3, 7, 18)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      if (phaseRef.current === 'hold') {
        drawFilled(ctx, allIters[iter]);
        if (elapsed >= HOLD_MS) {
          const nextIter = iter + dirRef.current;
          if (nextIter < 0 || nextIter > MAX_ITER) dirRef.current = -dirRef.current;
          phaseRef.current = 'anim';
          phaseStartRef.current = time;
        }
      } else {
        const t    = Math.min(elapsed / ANIM_MS, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        if (dirRef.current > 0) {
          // Forward: punch holes growing into current iteration
          drawFilled(ctx, allIters[iter]);
          drawHoles(ctx, allIters[iter], ease);
        } else {
          // Backward: holes shrink back — fill from lower iteration
          drawFilled(ctx, allIters[iter - 1]);
          drawHoles(ctx, allIters[iter - 1], 1 - ease);
        }

        if (elapsed >= ANIM_MS) {
          iterRef.current = iter + dirRef.current;
          phaseRef.current = 'hold';
          phaseStartRef.current = time;
        }
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [dims, visible]);

  return (
    <div ref={containerRef} style={{ width: '100%', border: '2px solid var(--accent-cyan)', background: 'rgb(3,7,18)' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: dims.w, height: dims.h }} />
    </div>
  );
}
