import React, { useRef, useEffect } from 'react';

/* ─── Sierpinski canvas mark ─────────────────────────────────────────────── */

function SierpinskiMark({ size = 42 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Build 3 iterations inside the canvas bounds
    const pad = 3, w = size - pad * 2;
    const h   = w * Math.sqrt(3) / 2;
    const cx  = size / 2, cy = size / 2 + h / 6;
    const t0  = [{ a: { x: cx, y: cy - h*2/3 }, b: { x: cx + w/2, y: cy + h/3 }, c: { x: cx - w/2, y: cy + h/3 } }];

    function mid(A, B)       { return { x: (A.x+B.x)/2, y: (A.y+B.y)/2 }; }
    function lerpPt(A, B, t) { return { x: A.x+(B.x-A.x)*t, y: A.y+(B.y-A.y)*t }; }
    function subdivide(tris) {
      return tris.flatMap(({ a, b, c }) => {
        const mab = mid(a,b), mbc = mid(b,c), mac = mid(a,c);
        return [{ a, b: mab, c: mac }, { a: mab, b, c: mbc }, { a: mac, b: mbc, c }];
      });
    }

    const iters = [t0, subdivide(t0), subdivide(subdivide(t0))];

    function drawFilled(tris) {
      ctx.fillStyle = '#22d3ee';
      for (const { a, b, c } of tris) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
        ctx.closePath(); ctx.fill();
      }
    }

    function drawHoles(parentTris, ease) {
      ctx.fillStyle = 'rgb(3,7,18)';
      for (const { a, b, c } of parentTris) {
        const mab = mid(a,b), mbc = mid(b,c), mac = mid(a,c);
        const cg  = { x: (mab.x+mbc.x+mac.x)/3, y: (mab.y+mbc.y+mac.y)/3 };
        const ha  = lerpPt(cg, mab, ease), hb = lerpPt(cg, mbc, ease), hc = lerpPt(cg, mac, ease);
        ctx.beginPath();
        ctx.moveTo(ha.x, ha.y); ctx.lineTo(hb.x, hb.y); ctx.lineTo(hc.x, hc.y);
        ctx.closePath(); ctx.fill();
      }
    }

    // Same hole-punch state machine as SierpinskiLoop, max 2 iterations, slower
    const ANIM_MS = 900, HOLD_MS = 700, MAX_ITER = 2;
    let iter = 0, dir = 1, phase = 'hold', phaseStart = null, raf;

    const render = (time) => {
      if (phaseStart === null) phaseStart = time;
      const elapsed = time - phaseStart;

      ctx.fillStyle = 'rgb(3,7,18)';
      ctx.fillRect(0, 0, size, size);

      if (phase === 'hold') {
        drawFilled(iters[iter]);
        if (elapsed >= HOLD_MS) {
          const next = iter + dir;
          if (next < 0 || next > MAX_ITER) dir = -dir;
          phase = 'anim';
          phaseStart = time;
        }
      } else {
        const raw  = Math.min(elapsed / ANIM_MS, 1);
        const ease = raw * raw * (3 - 2 * raw); // smoothstep
        if (dir > 0) {
          drawFilled(iters[iter]);
          drawHoles(iters[iter], ease);
        } else {
          drawFilled(iters[iter - 1]);
          drawHoles(iters[iter - 1], 1 - ease);
        }
        if (elapsed >= ANIM_MS) {
          iter += dir;
          phase = 'hold';
          phaseStart = time;
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: size, height: size, flexShrink: 0 }}
    />
  );
}

/* ─── Nav link helper ────────────────────────────────────────────────────── */

function NavLink({ href, full, short, accent }) {
  return (
    <a href={href} className={`site-header-link${accent ? ' site-header-link--accent' : ''}`}>
      <span className="site-header-bracket">[</span>
      <span className="nav-full">{full}</span>
      <span className="nav-short">{short}</span>
      <span className="site-header-bracket">]</span>
    </a>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────────── */

export default function Header() {
  return (
    <header className="site-header">
      <a href="#intro" className="site-header-logo">
        <SierpinskiMark size={42} />
        <span className="site-header-wordmark">FRACTAL_FORGE_</span>
      </a>

      <div className="site-header-sep" />

      <nav className="site-header-nav">
        <NavLink href="#module-1"         full="FRACTALS"  short="FR"   />
        <NavLink href="#formula-explorer" full="FORMULAIC" short="FML"  />
        <NavLink href="#relationship"    full="MB-JULIA"   short="MB-J" />
        <NavLink href="#geometric"       full="GEOMETRIC"  short="GEO"  />
        <NavLink href="#challenge"       full="CHALLENGE"  short="QUIZ" accent />
      </nav>
    </header>
  );
}
