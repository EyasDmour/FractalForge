import { useEffect } from 'react';

const SIZE   = 64;
const FPS    = 15;
const PERIOD = 80; // frames per full 0→2→0 cycle (5.3s at 15fps)

function mid(A, B)       { return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }; }
function lerpPt(A, B, t) { return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }; }

function subdivide(tris) {
  return tris.flatMap(({ a, b, c }) => {
    const mab = mid(a, b), mbc = mid(b, c), mac = mid(a, c);
    return [
      { a,   b: mab, c: mac },
      { a: mab, b,   c: mbc },
      { a: mac, b: mbc, c   },
    ];
  });
}

// Precompute 3 iterations (0, 1, 2) at module load
const ITERS = (() => {
  const pad = 4, w = SIZE - pad * 2;
  const h  = w * Math.sqrt(3) / 2;
  const cx = SIZE / 2, cy = SIZE / 2 + h / 6;
  const t0 = [{ a: { x: cx, y: cy - h*2/3 }, b: { x: cx + w/2, y: cy + h/3 }, c: { x: cx - w/2, y: cy + h/3 } }];
  const t1 = subdivide(t0);
  const t2 = subdivide(t1);
  return [t0, t1, t2];
})();

function drawFilled(ctx, tris) {
  ctx.fillStyle = '#22d3ee';
  for (const { a, b, c } of tris) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.closePath(); ctx.fill();
  }
}

function drawHoles(ctx, parentTris, ease) {
  ctx.fillStyle = '#030712';
  for (const { a, b, c } of parentTris) {
    const mab = mid(a, b), mbc = mid(b, c), mac = mid(a, c);
    const cg  = { x: (mab.x + mbc.x + mac.x) / 3, y: (mab.y + mbc.y + mac.y) / 3 };
    const ha  = lerpPt(cg, mab, ease);
    const hb  = lerpPt(cg, mbc, ease);
    const hc  = lerpPt(cg, mac, ease);
    ctx.beginPath();
    ctx.moveTo(ha.x, ha.y); ctx.lineTo(hb.x, hb.y); ctx.lineTo(hc.x, hc.y);
    ctx.closePath(); ctx.fill();
  }
}

export default function useFaviconAnimation() {
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    let f = 0;

    const tick = () => {
      // Pingpong t: 0 → 2 → 0 over PERIOD frames
      const half  = PERIOD / 2;
      const phase = f % PERIOD;
      const t     = phase < half
        ? (phase / half) * 2
        : ((PERIOD - phase) / half) * 2;

      const fl   = Math.min(Math.floor(t), 1); // 0 or 1 (iters 0→1, 1→2)
      const frac = t - Math.floor(t);           // 0.0..1.0 within that step
      // smoothstep — zero velocity at 0 and 1, so motion reads the same forward/backward
      const ease = frac * frac * (3 - 2 * frac);

      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, SIZE, SIZE);

      drawFilled(ctx, ITERS[fl]);
      if (frac > 0.001) drawHoles(ctx, ITERS[fl], ease);

      link.type = 'image/png';
      link.href = canvas.toDataURL();
      f = (f + 1) % PERIOD;
    };

    tick();
    const id = setInterval(tick, 1000 / FPS);
    return () => clearInterval(id);
  }, []);
}
