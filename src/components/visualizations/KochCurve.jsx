import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVisible } from '../../hooks/useVisible';

// Math helpers
function getLineSegment(w, h) {
  const width = w * 0.9;
  const cx = w / 2;
  const cy = h / 2 + 40; // slightly lower so spike has room to grow up
  
  const left = { x: cx - width / 2, y: cy };
  const right = { x: cx + width / 2, y: cy };
  
  return [
    { a: left, b: right }
  ];
}

function getKochSpike(A, B) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  
  const p1 = { x: A.x + dx / 3, y: A.y + dy / 3 };
  const p3 = { x: A.x + 2 * dx / 3, y: A.y + 2 * dy / 3 };
  
  // Rotate p1->p3 by 60 degrees (-PI/3) to form the spike peak
  const px = p3.x - p1.x;
  const py = p3.y - p1.y;
  const angle = -Math.PI / 3;
  
  const rx = px * Math.cos(angle) - py * Math.sin(angle);
  const ry = px * Math.sin(angle) + py * Math.cos(angle);
  
  const p2 = { x: p1.x + rx, y: p1.y + ry };
  
  return { p1, p2, p3 };
}

function nextIteration(segments) {
  const next = [];
  for (let i = 0; i < segments.length; i++) {
    const { a, b } = segments[i];
    const { p1, p2, p3 } = getKochSpike(a, b);
    
    next.push({ a: a, b: p1 });
    next.push({ a: p1, b: p2 });
    next.push({ a: p2, b: p3 });
    next.push({ a: p3, b: b });
  }
  return next;
}

// Distance helper
function dist(A, B) {
  return Math.sqrt((A.x - B.x) ** 2 + (A.y - B.y) ** 2);
}

// Interpolate point along a line
function lerpPoint(A, B, t) {
  return {
    x: A.x + (B.x - A.x) * t,
    y: A.y + (B.y - A.y) * t
  };
}

export default function KochCurve() {
  const [containerRef, visible] = useVisible();
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const [iteration, setIteration] = useState(0);
  const [thickness, setThickness] = useState(2.5);
  const [isSequential, setIsSequential] = useState(false);
  
  // Animation refs
  const segmentsRef = useRef([]); // current segments (final state of current iteration)
  const oldSegmentsRef = useRef([]); // segments from previous iteration
  const animRef = useRef(null); // { startTime }
  
  const MAX_ITERATIONS = 7;
  const MAX_ANIMATED_ITERATIONS = 6;

  // Responsive sizing
  useEffect(() => {
    const observe = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.max(400, Math.min(600, Math.floor(w * 0.75)));
      setDimensions({ w, h });
    };
    observe();
    const ro = new ResizeObserver(observe);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Initialize iteration 0 when canvas mounts/resizes
  useEffect(() => {
    if (iteration === 0 && !animRef.current) {
      segmentsRef.current = getLineSegment(dimensions.w, dimensions.h);
    }
  }, [dimensions, iteration]);

  const handleNext = () => {
    if (animRef.current || iteration >= MAX_ITERATIONS) return;
    
    const nextIter = iteration + 1;
    
    if (nextIter > MAX_ANIMATED_ITERATIONS) {
      // Instant transition
      segmentsRef.current = nextIteration(segmentsRef.current);
      setIteration(nextIter);
    } else {
      // Start animation sequence
      oldSegmentsRef.current = [...segmentsRef.current];
      segmentsRef.current = nextIteration(segmentsRef.current);
      setIteration(nextIter);
      
      animRef.current = {
        startTime: performance.now()
      };
    }
  };

  const handleReset = () => {
    if (animRef.current) animRef.current = null;
    segmentsRef.current = getLineSegment(dimensions.w, dimensions.h);
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

      // Clear
      ctx.fillStyle = 'rgba(3, 7, 18, 0.95)';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (animRef.current) {
        // ANIMATING STATE
        const elapsed = time - animRef.current.startTime;

        if (isSequential) {
          // Mode 1: Sequential Animation
          const N = oldSegmentsRef.current.length;
          const maxTotalDuration = 3000; // cap time for many segments
          const seqDuration = Math.min(150, maxTotalDuration / N);
          const singleGrowDuration = 300;
          const totalDuration = N * seqDuration + singleGrowDuration;

          if (elapsed >= totalDuration) {
            animRef.current = null; // Done
          }
          
          oldSegmentsRef.current.forEach((seg, i) => {
            const { p1, p2, p3 } = getKochSpike(seg.a, seg.b);
            const startDelay = i * seqDuration;
            
            ctx.beginPath(); 
            ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(p1.x, p1.y);
            ctx.moveTo(p3.x, p3.y); ctx.lineTo(seg.b.x, seg.b.y);
            
            if (elapsed < startDelay) {
              // Not started yet
              ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y);
              ctx.strokeStyle = '#22d3ee';
              ctx.stroke();
            } else if (elapsed > startDelay + singleGrowDuration) {
              // Done
              ctx.strokeStyle = '#22d3ee';
              ctx.stroke();
              
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
              ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = '#22d3ee';
              ctx.stroke();
            } else {
              // Growing
              ctx.strokeStyle = '#22d3ee';
              ctx.stroke();
              
              let t = (elapsed - startDelay) / singleGrowDuration;
              const ease = 1 - Math.pow(1 - t, 4);
              
              const spikePt1 = lerpPoint(p1, p2, ease);
              const spikePt2 = lerpPoint(p3, p2, ease);
              
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y); ctx.lineTo(spikePt1.x, spikePt1.y);
              ctx.moveTo(p3.x, p3.y); ctx.lineTo(spikePt2.x, spikePt2.y);
              
              const r = Math.round(192 + (34 - 192) * ease);
              const g = Math.round(255 + (211 - 255) * ease);
              const b = Math.round(0 + (238 - 0) * ease);
              ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.stroke();
            }
          });
        } else {
          // Mode 2: Simultaneous (Pulse then Grow)
          const pulseDuration = 800;
          const growDuration = 1800;
          const totalDuration = pulseDuration + growDuration;

          if (elapsed >= totalDuration) {
            animRef.current = null; // Done
          }

          oldSegmentsRef.current.forEach(seg => {
            const { p1, p2, p3 } = getKochSpike(seg.a, seg.b);
            
            // Draw static left/right base
            ctx.beginPath(); 
            ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(p1.x, p1.y);
            ctx.moveTo(p3.x, p3.y); ctx.lineTo(seg.b.x, seg.b.y);
            ctx.strokeStyle = '#22d3ee';
            ctx.stroke();

            if (elapsed < pulseDuration) {
              // Pulse the middle segment
              let t = elapsed / pulseDuration;
              let pulse = Math.sin(t * Math.PI); // 0 -> 1 -> 0
              
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y);
              
              const r = Math.round(34 + (192 - 34) * pulse);
              const g = Math.round(211 + (255 - 211) * pulse);
              const b = Math.round(238 + (0 - 238) * pulse);
              
              ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;
              ctx.shadowBlur = 12 * pulse;
              ctx.stroke();
              ctx.shadowBlur = 0; // reset
            } else {
              // Grow the spike
              let t = (elapsed - pulseDuration) / growDuration;
              if (t > 1) t = 1;
              const ease = 1 - Math.pow(1 - t, 4);

              const spikePt1 = lerpPoint(p1, p2, ease);
              const spikePt2 = lerpPoint(p3, p2, ease);
              
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y); ctx.lineTo(spikePt1.x, spikePt1.y);
              ctx.moveTo(p3.x, p3.y); ctx.lineTo(spikePt2.x, spikePt2.y);
              
              const r = Math.round(192 + (34 - 192) * ease);
              const g = Math.round(255 + (211 - 255) * ease);
              const b = Math.round(0 + (238 - 0) * ease);
              ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.stroke();
            }
          });
        }
      } else {
        // STATIC STATE
        ctx.beginPath();
        const segments = segmentsRef.current;
        if (segments.length > 0) {
          ctx.moveTo(segments[0].a.x, segments[0].a.y);
          for (let i = 0; i < segments.length; i++) {
            ctx.lineTo(segments[i].b.x, segments[i].b.y);
          }
          ctx.strokeStyle = '#22d3ee'; // Explicit cyan
          // Add stronger glow for static idle state
          ctx.shadowColor = '#22d3ee';
          ctx.shadowBlur = 8;
          ctx.stroke();
          // Stroke again without shadow to make core solid
          ctx.shadowBlur = 0;
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, [dimensions, thickness, isSequential, visible]);

  return (
    <div 
      ref={containerRef} 
      className="koch-viz schematic-box" 
      style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <div className="koch-canvas-container" style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: dimensions.w, height: dimensions.h }}
        />
        
        {/* On-canvas stats overlay */}
        <div style={{
          position: 'absolute', top: '1rem', left: '1rem',
          fontFamily: 'var(--font-display)', fontSize: '0.75rem',
          color: 'var(--text-dim)', background: 'rgba(3,7,18,0.8)',
          padding: '0.5rem', border: '1px solid var(--accent-cyan)'
        }}>
          <div>ITERATION: <span style={{color: 'var(--accent-neon)'}}>{iteration}</span></div>
          <div>SEGMENTS: <span style={{color: 'var(--text-main)'}}>{Math.pow(4, iteration)}</span></div>
          <div>TOTAL LENGTH: <span style={{color: 'var(--text-main)'}}>{Math.pow(4/3, iteration).toFixed(2)}s</span></div>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        padding: '1rem', display: 'flex', gap: '1rem',
        borderTop: '2px solid var(--accent-cyan)', background: 'rgba(3,7,18,0.95)',
        alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap'
      }}>
        {/* Left: Next Iteration */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={handleNext}
            disabled={iteration >= MAX_ITERATIONS}
            className="btn-tech"
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            {iteration >= MAX_ITERATIONS ? 'MAX LIMIT REACHED' : 'NEXT ITERATION'}
          </button>
          {iteration > MAX_ANIMATED_ITERATIONS && iteration < MAX_ITERATIONS && (
            <span style={{ marginLeft: '1rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
              [ FAST MODE ]
            </span>
          )}
        </div>

        {/* Middle: Sliders & Toggles */}
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flex: 1, justifyContent: 'center', minWidth: '300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>THICKNESS</label>
            <input 
              type="range" min="0.5" max="5" step="0.5" 
              value={thickness} 
              onChange={e => setThickness(Number(e.target.value))} 
              style={{ width: '80px', accentColor: 'var(--accent-neon)', cursor: 'pointer' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-display)', letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <input 
                type="checkbox" 
                checked={isSequential} 
                onChange={e => setIsSequential(e.target.checked)} 
                style={{ marginRight: '0.5rem', accentColor: 'var(--accent-neon)', cursor: 'pointer', width: '1.1rem', height: '1.1rem' }}
              />
              SEQ. MODE
            </label>
          </div>
        </div>

        {/* Right: Reset */}
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
