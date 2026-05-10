import { useRef, useEffect } from 'react';

const SIZE     = 240;
const MAX_ITER = 40;
const BOUNDS   = 2.0;

const ROOTS4  = [[1,0],[0,1],[-1,0],[0,-1]];
const COLORS4 = [[34,211,238],[192,255,0],[148,163,184],[251,146,60]];
const BG      = [4, 8, 24];

function newton4Step(zr, zi) {
  const z2r = zr*zr - zi*zi, z2i = 2*zr*zi;
  const z3r = z2r*zr - z2i*zi, z3i = z2r*zi + z2i*zr;
  const z4r = z2r*z2r - z2i*z2i, z4i = 2*z2r*z2i;
  const nr = 3*z4r + 1, ni = 3*z4i;
  const dr = 4*z3r, di = 4*z3i;
  const d2 = dr*dr + di*di;
  if (d2 < 1e-14) return null;
  return [(nr*dr + ni*di)/d2, (ni*dr - nr*di)/d2];
}

function findRoot4(zr, zi) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < 4; i++) {
    const dx = zr - ROOTS4[i][0], dy = zi - ROOTS4[i][1];
    const d = dx*dx + dy*dy;
    if (d < bd) { bd = d; best = i; }
  }
  return { root: best, dist: bd };
}

export default function NewtonReveal() {
  const canvasRef = useRef(null);
  const rendered  = useRef(false);

  useEffect(() => {
    if (rendered.current) return;
    rendered.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const d   = img.data;

    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        let zr = (px / SIZE) * 2*BOUNDS - BOUNDS;
        let zi = -((py / SIZE) * 2*BOUNDS - BOUNDS);
        let iter = 0, pole = false;

        while (iter < MAX_ITER) {
          const next = newton4Step(zr, zi);
          if (!next) { pole = true; break; }
          [zr, zi] = next;
          iter++;
          if (findRoot4(zr, zi).dist < 1e-10) break;
        }

        const idx = (py * SIZE + px) * 4;
        if (pole) {
          d[idx] = BG[0]; d[idx+1] = BG[1]; d[idx+2] = BG[2]; d[idx+3] = 255;
        } else {
          const { root } = findRoot4(zr, zi);
          const t = 1 - iter / MAX_ITER;
          const [r, g, b] = COLORS4[root];
          d[idx]   = r * (0.2 + 0.8*t) | 0;
          d[idx+1] = g * (0.2 + 0.8*t) | 0;
          d[idx+2] = b * (0.2 + 0.8*t) | 0;
          d[idx+3] = 255;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
  }, []);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', color: 'var(--accent-neon)', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
        RESULT: f(z) = z⁴ − 1 · FOUR BASINS
      </div>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{ width: '100%', maxWidth: `${SIZE}px`, display: 'block', margin: '0 auto', imageRendering: 'pixelated' }}
      />
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
        {[['#22d3ee','z=1'],['#c0ff00','z=i'],['#94a3b8','z=−1'],['#fb923c','z=−i']].map(([col, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-display)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, background: col, display: 'inline-block', flexShrink: 0 }}/>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
