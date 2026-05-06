import React, { useRef, useEffect, useState, useCallback } from 'react';

function sqC(x, y) { return { x: x*x - y*y, y: 2*x*y }; }
function mag(x, y) { return Math.sqrt(x*x + y*y); }
function getScale(w, h) { return Math.min(w, h) / (2 * BOUNDS); }

const BOUNDS = 3.0;
const ESCAPE_R = 2;
const MAX_ORBIT = 8;

export default function ComplexPlaneExplorer() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });

  // Refs used by render loop (no re-render needed)
  const zRef = useRef({ x: 0.6, y: 0.8 });
  const orbitRef = useRef([]);
  const dragging = useRef(false);

  // React state for the info panel below canvas
  const [z, setZ] = useState({ x: 0.6, y: 0.8 });
  const [orbitLen, setOrbitLen] = useState(0);
  const [verdict, setVerdict] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Responsive canvas sizing
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.max(380, Math.min(660, Math.floor(w * 0.55)));
      setDims({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Pointer: start drag if near z dot
  const onPointerDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (dims.w / rect.width);
    const sy = (e.clientY - rect.top)  * (dims.h / rect.height);
    const sc = getScale(dims.w, dims.h);
    const zsx = dims.w/2 + zRef.current.x * sc;
    const zsy = dims.h/2 - zRef.current.y * sc;
    if (Math.hypot(sx - zsx, sy - zsy) < 22) {
      dragging.current = true;
      setIsDragging(true);
      canvasRef.current.setPointerCapture(e.pointerId);
    }
  }, [dims]);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (dims.w / rect.width);
    const sy = (e.clientY - rect.top)  * (dims.h / rect.height);
    const sc = getScale(dims.w, dims.h);
    const clamp = (v) => Math.max(-BOUNDS + 0.05, Math.min(BOUNDS - 0.05, v));
    const mx = clamp((sx - dims.w/2) / sc);
    const my = clamp(-(sy - dims.h/2) / sc);
    zRef.current = { x: mx, y: my };
    orbitRef.current = [];
    setZ({ x: mx, y: my });
    setOrbitLen(0);
    setVerdict(null);
  }, [dims]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
  }, []);

  // "Keep going" adds one more squaring to the orbit
  const onKeepGoing = useCallback(() => {
    const orbit = orbitRef.current;
    if (verdict || orbit.length >= MAX_ORBIT) return;
    const last = orbit.length === 0 ? sqC(zRef.current.x, zRef.current.y) : orbit[orbit.length - 1];
    const next = sqC(last.x, last.y);
    const newOrbit = [...orbit, next];
    orbitRef.current = newOrbit;

    const m = mag(next.x, next.y);
    let v = null;
    if (m > ESCAPE_R) v = 'escaping';
    else if (newOrbit.length >= 5) v = 'bounded';

    setOrbitLen(newOrbit.length);
    setVerdict(v);
  }, [verdict]);

  const onReset = useCallback(() => {
    orbitRef.current = [];
    setOrbitLen(0);
    setVerdict(null);
  }, []);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const draw = () => {
      const { w, h } = dims;
      const dpr = window.devicePixelRatio || 1;

      // Resize canvas (also resets ctx transform)
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      const sc = getScale(w, h);
      const S  = (mx, my) => ({ sx: w/2 + mx*sc, sy: h/2 - my*sc });
      const O  = S(0, 0);

      // ── Background ──
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, w, h);

      // ── Grid ──
      ctx.strokeStyle = 'rgba(34,211,238,0.07)';
      ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        const a = S(i, -BOUNDS), b = S(i, BOUNDS);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        const c = S(-BOUNDS, i), d = S(BOUNDS, i);
        ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke();
      }

      // ── Axes ──
      ctx.strokeStyle = 'rgba(34,211,238,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, O.sy); ctx.lineTo(w, O.sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(O.sx, 0); ctx.lineTo(O.sx, h); ctx.stroke();

      ctx.fillStyle = 'rgba(34,211,238,0.4)';
      ctx.font = '11px monospace';
      ctx.fillText('Re', w - 22, O.sy - 7);
      ctx.fillText('Im', O.sx + 6, 14);
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const rp = S(i, 0), ip = S(0, i);
        ctx.fillText(String(i), rp.sx - 4, O.sy + 13);
        ctx.fillText(`${i}i`, O.sx + 4, ip.sy + 4);
      }

      // ── Escape circle r=2 (Interaction D) ──
      ctx.beginPath();
      ctx.arc(O.sx, O.sy, ESCAPE_R * sc, 0, 2*Math.PI);
      ctx.strokeStyle = 'rgba(251,146,60,0.3)';
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(251,146,60,0.5)';
      ctx.font = '10px monospace';
      const escP = S(ESCAPE_R * 0.70, ESCAPE_R * 0.70);
      ctx.fillText('r = 2', escP.sx, escP.sy - 3);

      // ── Unit circle (Interaction D) ──
      ctx.beginPath();
      ctx.arc(O.sx, O.sy, sc, 0, 2*Math.PI);
      ctx.strokeStyle = 'rgba(192,255,0,0.28)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(192,255,0,0.45)';
      ctx.font = '10px monospace';
      const unitP = S(-0.78, 0.6);
      ctx.fillText('|z|=1', unitP.sx, unitP.sy);

      // ── Current z and z² ──
      const z  = zRef.current;
      const zq = sqC(z.x, z.y);
      const zS  = S(z.x, z.y);
      const zqS = S(zq.x, zq.y);
      const zm  = mag(z.x, z.y);

      // Modulus circle for z (Interaction A)
      if (zm > 0.05) {
        ctx.beginPath();
        ctx.arc(O.sx, O.sy, zm * sc, 0, 2*Math.PI);
        ctx.strokeStyle = 'rgba(56,189,248,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── Orbit trail (Interaction C) ──
      const orbit = orbitRef.current;
      if (orbit.length > 0) {
        const pts = [zq, ...orbit];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = Math.max(0, 0.7 - i * 0.1);
          const p1 = S(pts[i].x, pts[i].y);
          const p2 = S(pts[i+1].x, pts[i+1].y);
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.strokeStyle = `rgba(251,146,60,${a})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        for (let i = 0; i < orbit.length; i++) {
          const a = Math.max(0.1, 0.85 - i * 0.13);
          const r = Math.max(2.5, 5.5 - i * 0.6);
          const ps = S(orbit[i].x, orbit[i].y);
          ctx.beginPath();
          ctx.arc(ps.sx, ps.sy, r, 0, 2*Math.PI);
          ctx.fillStyle = `rgba(251,146,60,${a})`;
          ctx.fill();
        }
      }

      // ── Dashed line z → z² (Interaction B) ──
      ctx.beginPath();
      ctx.moveTo(zS.sx, zS.sy);
      ctx.lineTo(zqS.sx, zqS.sy);
      ctx.strokeStyle = 'rgba(148,163,184,0.4)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Angle wedge at origin (Interaction B) ──
      if (zm > 0.05) {
        const theta  = Math.atan2(z.y, z.x); // math angle (CCW)
        const theta2 = 2 * theta;             // angle doubles — use raw, not atan2(z²)
        const r1 = 28, r2 = 42;

        // z arc (blue): screen angle 0 → -theta, CCW in screen if theta > 0
        ctx.beginPath();
        ctx.arc(O.sx, O.sy, r1, 0, -theta, theta > 0);
        ctx.strokeStyle = 'rgba(56,189,248,0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // z² arc (orange): screen angle 0 → -theta2
        ctx.beginPath();
        ctx.arc(O.sx, O.sy, r2, 0, -theta2, theta2 > 0);
        ctx.strokeStyle = 'rgba(251,146,60,0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Angle labels
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(56,189,248,0.7)';
        const t1mid = theta / 2;
        ctx.fillText('θ', O.sx + (r1+7)*Math.cos(-t1mid) - 3, O.sy + (r1+7)*Math.sin(-t1mid) + 3);

        ctx.fillStyle = 'rgba(251,146,60,0.7)';
        const t2mid = theta2 / 2;
        ctx.fillText('2θ', O.sx + (r2+8)*Math.cos(-t2mid) - 6, O.sy + (r2+8)*Math.sin(-t2mid) + 3);
      }

      // ── z² dot (orange) (Interaction B) ──
      ctx.beginPath();
      ctx.arc(zqS.sx, zqS.sy, 6.5, 0, 2*Math.PI);
      ctx.fillStyle = '#fb923c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('z²', zqS.sx + 9, zqS.sy - 7);

      // ── z dot (blue, draggable) (Interaction A) ──
      ctx.beginPath();
      ctx.arc(zS.sx, zS.sy, 9, 0, 2*Math.PI);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('z', zS.sx + 11, zS.sy - 7);

      // Drag hint
      if (!dragging.current) {
        ctx.fillStyle = 'rgba(148,163,184,0.4)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('drag', zS.sx, zS.sy + 23);
        ctx.textAlign = 'left';
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dims]);

  // Info panel values (from React state z, stays in sync with zRef via setZ)
  const zq   = sqC(z.x, z.y);
  const zm   = mag(z.x, z.y);
  const zqm  = mag(zq.x, zq.y);

  const fmt = (x, y) => {
    const s = y < 0 ? '−' : '+';
    return `${x.toFixed(3)} ${s} ${Math.abs(y).toFixed(3)}i`;
  };

  const canKeepGoing = !verdict && orbitLen < MAX_ORBIT;

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
        style={{
          display: 'block',
          width: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
      />

      {/* ── Info panel ── */}
      <div style={{
        padding: '0.8rem 1.1rem',
        borderTop: '1px solid rgba(34,211,238,0.18)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem 1.5rem',
        alignItems: 'center',
        background: 'rgba(3,7,18,0.7)'
      }}>
        {/* Coordinates */}
        <div style={{ fontFamily: 'monospace', fontSize: '12.5px', lineHeight: 1.75, color: 'var(--text-main)', flexGrow: 1, minWidth: '220px' }}>
          <div>
            <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>z</span>
            {' = '}{fmt(z.x, z.y)}
            <span style={{ color: 'rgba(148,163,184,0.75)', marginLeft: '0.75rem' }}>|z| = {zm.toFixed(3)}</span>
          </div>
          <div>
            <span style={{ color: '#fb923c', fontWeight: 'bold' }}>z²</span>
            {' = '}{fmt(zq.x, zq.y)}
            <span style={{ color: 'rgba(148,163,184,0.75)', marginLeft: '0.75rem' }}>|z²| = {zqm.toFixed(3)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={onKeepGoing}
            disabled={!canKeepGoing}
            style={{
              background: 'transparent',
              border: '2px solid var(--accent-neon, #c0ff00)',
              color: 'var(--accent-neon, #c0ff00)',
              fontFamily: 'monospace',
              fontSize: '12px',
              padding: '0.35rem 0.75rem',
              cursor: canKeepGoing ? 'pointer' : 'default',
              opacity: canKeepGoing ? 1 : 0.3,
              transition: 'opacity 0.2s'
            }}
          >
            Keep going →
          </button>
          <button
            onClick={onReset}
            style={{
              background: 'transparent',
              border: '2px solid rgba(34,211,238,0.35)',
              color: 'rgba(34,211,238,0.6)',
              fontFamily: 'monospace',
              fontSize: '12px',
              padding: '0.35rem 0.75rem',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        </div>

        {/* Verdict */}
        {verdict && (
          <div style={{
            fontFamily: 'monospace',
            fontSize: '13px',
            fontWeight: 'bold',
            color: verdict === 'bounded' ? '#4ade80' : '#f87171',
            padding: '0.2rem 0.6rem',
            border: `1px solid ${verdict === 'bounded' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          }}>
            {verdict === 'bounded' ? '✓ This point stays bounded' : '⚠ This point escapes to infinity'}
          </div>
        )}
      </div>
    </div>
  );
}
