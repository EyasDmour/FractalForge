import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVisible } from '../../hooks/useVisible';

function sqC(x, y)   { return { x: x*x - y*y, y: 2*x*y }; }
function cubeC(x, y) { const q = sqC(x, y); return { x: q.x*x - q.y*y, y: q.x*y + q.y*x }; }
function divC(ax, ay, bx, by) {
  const d = bx*bx + by*by;
  if (d < 1e-10) return { x: 1e9, y: 1e9 };
  return { x: (ax*bx + ay*by)/d, y: (ay*bx - ax*by)/d };
}
function newtonZ3(x, y) {
  // N(z) = (2z³+1)/(3z²)
  const cu = cubeC(x, y);
  const sq = sqC(x, y);
  return divC(2*cu.x + 1, 2*cu.y, 3*sq.x, 3*sq.y);
}
function mag(x, y) { return Math.sqrt(x*x + y*y); }
function getScale(w, h) { return Math.min(w, h) / (2 * BOUNDS); }

const BOUNDS = 3.0;

const NEWTON_ROOTS = [
  { x: 1,    y: 0,               color: '#4ade80', label: 'Root 1' },
  { x: -0.5, y:  Math.sqrt(3)/2, color: '#f472b6', label: 'Root 2' },
  { x: -0.5, y: -Math.sqrt(3)/2, color: '#fb923c', label: 'Root 3' },
];

const FORMULAS = {
  sq:     { id: 'sq',     name: 'z²',           nextLabel: 'z²',   maxOrbit: 100, angleMult: 2,    escapeR: 2 },
  cube:   { id: 'cube',   name: 'z³',           nextLabel: 'z³',   maxOrbit: 100, angleMult: 3,    escapeR: 2 },
  newton: { id: 'newton', name: 'Newton (z³−1)', nextLabel: 'N(z)', maxOrbit: 50,  angleMult: null, escapeR: null },
};

function applyFormula(id, x, y) {
  if (id === 'sq')     return sqC(x, y);
  if (id === 'cube')   return cubeC(x, y);
  if (id === 'newton') return newtonZ3(x, y);
}

function computeVerdict(id, orbit, zn) {
  if (id === 'sq' || id === 'cube') {
    if (mag(zn.x, zn.y) > 2) return { type: 'escaped' };
    if (orbit.length >= 5) return { type: 'bounded' };
    return null;
  }
  if (id === 'newton') {
    for (let i = 0; i < NEWTON_ROOTS.length; i++) {
      const r = NEWTON_ROOTS[i];
      if (mag(zn.x - r.x, zn.y - r.y) < 0.005) return { type: 'root', rootIdx: i };
    }
    if (mag(zn.x, zn.y) > 1e6) return { type: 'escaped' };
    if (orbit.length >= 30) return { type: 'stuck' };
    return null;
  }
}

export default function ComplexPlaneExplorer() {
  const [containerRef, visible] = useVisible();
  const canvasRef    = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });

  const zRef       = useRef({ x: 0.6, y: 0.8 });
  const orbitRef   = useRef([]);
  const dragging   = useRef(false);
  const formulaRef = useRef('sq');

  const [z, setZ]           = useState({ x: 0.6, y: 0.8 });
  const [formula, _setFormula] = useState('sq');
  const [orbitLen, setOrbitLen] = useState(0);
  const [verdict, setVerdict]   = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const setFormula = useCallback((id) => {
    formulaRef.current = id;
    _setFormula(id);
    orbitRef.current = [];
    setOrbitLen(0);
    setVerdict(null);
  }, []);

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

  const onKeepGoing = useCallback(() => {
    const fid = formulaRef.current;
    const fDef = FORMULAS[fid];
    let orbit = [...orbitRef.current];
    let v = null;
    if (verdict || orbit.length >= fDef.maxOrbit) return;
    while (!v && orbit.length < fDef.maxOrbit) {
      const prev = orbit.length === 0
        ? applyFormula(fid, zRef.current.x, zRef.current.y)
        : orbit[orbit.length - 1];
      const next = applyFormula(fid, prev.x, prev.y);
      orbit.push(next);
      v = computeVerdict(fid, orbit, next);
    }
    orbitRef.current = orbit;
    setOrbitLen(orbit.length);
    setVerdict(v);
  }, [verdict]);

  const onReset = useCallback(() => {
    orbitRef.current = [];
    setOrbitLen(0);
    setVerdict(null);
  }, []);

  // Canvas render loop
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

      const sc = getScale(w, h);
      const S  = (mx, my) => ({ sx: w/2 + mx*sc, sy: h/2 - my*sc });
      const O  = S(0, 0);
      const fid = formulaRef.current;
      const fDef = FORMULAS[fid];

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

      // ── Escape circle (sq/cube only) ──
      if (fDef.escapeR) {
        ctx.beginPath();
        ctx.arc(O.sx, O.sy, fDef.escapeR * sc, 0, 2*Math.PI);
        ctx.strokeStyle = 'rgba(251,146,60,0.3)';
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(251,146,60,0.5)';
        ctx.font = '10px monospace';
        const escP = S(fDef.escapeR * 0.70, fDef.escapeR * 0.70);
        ctx.fillText('r = 2', escP.sx, escP.sy - 3);
      }

      // ── Unit circle ──
      ctx.beginPath();
      ctx.arc(O.sx, O.sy, sc, 0, 2*Math.PI);
      ctx.strokeStyle = 'rgba(192,255,0,0.28)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(192,255,0,0.45)';
      ctx.font = '10px monospace';
      ctx.fillText('|z|=1', S(-0.78, 0.6).sx, S(-0.78, 0.6).sy);

      // ── Newton roots (newton only) ──
      if (fid === 'newton') {
        for (const r of NEWTON_ROOTS) {
          const rs = S(r.x, r.y);
          ctx.beginPath();
          ctx.arc(rs.sx, rs.sy, 7, 0, 2*Math.PI);
          ctx.fillStyle = r.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = r.color;
          ctx.font = '10px monospace';
          ctx.fillText(r.label, rs.sx + 10, rs.sy + 4);
        }
      }

      // ── Current z and f(z) ──
      const zv  = zRef.current;
      const fz  = applyFormula(fid, zv.x, zv.y);
      const zS  = S(zv.x, zv.y);
      const fzS = S(fz.x, fz.y);
      const zm  = mag(zv.x, zv.y);

      // Modulus circle for z
      if (zm > 0.05) {
        ctx.beginPath();
        ctx.arc(O.sx, O.sy, zm * sc, 0, 2*Math.PI);
        ctx.strokeStyle = 'rgba(56,189,248,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── Orbit trail ──
      const orbit = orbitRef.current;
      if (orbit.length > 0) {
        const pts = [fz, ...orbit];
        ctx.strokeStyle = 'rgba(251,146,60,0.55)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = S(pts[i].x, pts[i].y);
          const p2 = S(pts[i+1].x, pts[i+1].y);
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(251,146,60,0.8)';
        for (let i = 0; i < orbit.length; i++) {
          const ps = S(orbit[i].x, orbit[i].y);
          ctx.beginPath();
          ctx.arc(ps.sx, ps.sy, 4, 0, 2*Math.PI);
          ctx.fill();
        }
      }

      // ── Dashed line z → f(z) ──
      ctx.beginPath();
      ctx.moveTo(zS.sx, zS.sy);
      ctx.lineTo(fzS.sx, fzS.sy);
      ctx.strokeStyle = 'rgba(148,163,184,0.4)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Angle arcs (sq / cube only) ──
      if (fDef.angleMult && zm > 0.05) {
        const theta  = Math.atan2(zv.y, zv.x);
        const thetaN = fDef.angleMult * theta;
        const r1 = 28, r2 = 42;

        ctx.beginPath();
        ctx.arc(O.sx, O.sy, r1, 0, -theta, theta > 0);
        ctx.strokeStyle = 'rgba(56,189,248,0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(O.sx, O.sy, r2, 0, -thetaN, thetaN > 0);
        ctx.strokeStyle = 'rgba(251,146,60,0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(56,189,248,0.7)';
        const t1mid = theta / 2;
        ctx.fillText('θ', O.sx + (r1+7)*Math.cos(-t1mid) - 3, O.sy + (r1+7)*Math.sin(-t1mid) + 3);

        ctx.fillStyle = 'rgba(251,146,60,0.7)';
        const t2mid = thetaN / 2;
        const arcLabel = fDef.angleMult === 2 ? '2θ' : '3θ';
        ctx.fillText(arcLabel, O.sx + (r2+8)*Math.cos(-t2mid) - 6, O.sy + (r2+8)*Math.sin(-t2mid) + 3);
      }

      // ── f(z) dot (orange) ──
      ctx.beginPath();
      ctx.arc(fzS.sx, fzS.sy, 6.5, 0, 2*Math.PI);
      ctx.fillStyle = '#fb923c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(fDef.nextLabel, fzS.sx + 9, fzS.sy - 7);

      // ── z dot (blue, draggable) ──
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
  }, [dims, visible]);

  const fDef = FORMULAS[formula];
  const fz   = applyFormula(formula, z.x, z.y);
  const zm   = mag(z.x, z.y);
  const fzm  = mag(fz.x, fz.y);

  const fmt = (x, y) => {
    const s = y < 0 ? '−' : '+';
    return `${x.toFixed(3)} ${s} ${Math.abs(y).toFixed(3)}i`;
  };

  const canKeepGoing = !verdict && orbitLen < fDef.maxOrbit;

  const btnStyle = (active) => ({
    background: 'transparent',
    border: `2px solid ${active ? 'var(--accent-cyan)' : 'rgba(34,211,238,0.25)'}`,
    color: active ? 'var(--accent-cyan)' : 'rgba(34,211,238,0.5)',
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '0.25rem 0.6rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  const verdictEl = verdict && (() => {
    if (verdict.type === 'bounded') return (
      <div style={verdictStyle('#4ade80')}>✓ Stays bounded</div>
    );
    if (verdict.type === 'escaped') return (
      <div style={verdictStyle('#f87171')}>⚠ Escapes to ∞</div>
    );
    if (verdict.type === 'root') {
      const r = NEWTON_ROOTS[verdict.rootIdx];
      return <div style={verdictStyle(r.color)}>→ Converged to {r.label}</div>;
    }
    if (verdict.type === 'stuck') return (
      <div style={verdictStyle('#94a3b8')}>? Did not converge</div>
    );
  })();

  function verdictStyle(color) {
    return {
      fontFamily: 'monospace',
      fontSize: '13px',
      fontWeight: 'bold',
      color,
      padding: '0.2rem 0.6rem',
      border: `1px solid ${color}55`,
    };
  }

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
        padding: '0.6rem 1.1rem',
        borderTop: '1px solid rgba(34,211,238,0.18)',
        background: 'rgba(3,7,18,0.7)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem 1rem',
        alignItems: 'center',
      }}>
        {/* Left: coordinates */}
        <div style={{ fontFamily: 'monospace', fontSize: '12.5px', lineHeight: 1.75, color: 'var(--text-main)', flexGrow: 1, minWidth: '220px' }}>
          <div>
            <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>z</span>
            {' = '}{fmt(z.x, z.y)}
            <span style={{ color: 'rgba(148,163,184,0.75)', marginLeft: '0.75rem' }}>|z| = {zm.toFixed(3)}</span>
          </div>
          <div>
            <span style={{ color: '#fb923c', fontWeight: 'bold' }}>{fDef.nextLabel}</span>
            {' = '}{fmt(fz.x, fz.y)}
            <span style={{ color: 'rgba(148,163,184,0.75)', marginLeft: '0.75rem' }}>|{fDef.nextLabel}| = {fzm.toFixed(3)}</span>
          </div>
        </div>

        {/* Center: formula switcher */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(148,163,184,0.5)' }}>f:</span>
          {Object.values(FORMULAS).map(f => (
            <button key={f.id} onClick={() => setFormula(f.id)} style={btnStyle(formula === f.id)}>
              {f.name}
            </button>
          ))}
        </div>

        {/* Right: action buttons + verdict */}
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
            Iterate →
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
          {verdictEl}
        </div>
      </div>
    </div>
  );
}
