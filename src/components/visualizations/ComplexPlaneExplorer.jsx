import React, { useRef, useEffect, useState, useCallback } from 'react';

/*
 * ComplexPlaneExplorer
 * 
 * Interactive 2D canvas showing the complex plane.
 * Hovering shows the vector and coordinate.
 * Clicking animates squaring the complex number: z -> z^2.
 * (Magnitudes square, angles double).
 */

// Math helpers
function toPolar(r_part, i_part) {
  const r = Math.sqrt(r_part * r_part + i_part * i_part);
  const theta = Math.atan2(i_part, r_part);
  return { r, theta };
}

function toCartesian(r, theta) {
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta)
  };
}

export default function ComplexPlaneExplorer() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  
  // Use refs for tracking to avoid restarting the rAF loop constantly
  const mouseRef = useRef({ x: 1, y: 1 });
  const hoverRef = useRef(false);
  
  // Animation state
  // null = idle tracking mouse
  // { start_r, start_theta, target_r, target_theta, startTime }
  const animRef = useRef(null);

  // Coordinate system configuration
  const mathBounds = 2.5; // View from -2.5 to 2.5 on both axes

  // Responsive sizing
  useEffect(() => {
    const observe = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.floor(rect.width);
      // Let it be roughly 16:10 or match height to container width
      const h = Math.max(400, Math.min(600, Math.floor(w * 0.75)));
      setDimensions({ w, h });
    };
    observe();
    const ro = new ResizeObserver(observe);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Handle mouse movement
  const handleMouseMove = useCallback((e) => {
    if (animRef.current) return; // Lock if animating
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // Convert screen to math coordinates
    // Center is (0,0). Screen (w/2, h/2)
    // Scale is min(w, h) / (2 * mathBounds)
    const scale = Math.min(dimensions.w, dimensions.h) / (2 * mathBounds);
    const mathX = (clientX - dimensions.w / 2) / scale;
    const mathY = -(clientY - dimensions.h / 2) / scale; // Screen Y is down
    
    mouseRef.current = { x: mathX, y: mathY };
    hoverRef.current = true;
  }, [dimensions]);

  const handleMouseLeave = () => {
    hoverRef.current = false;
  };

  const handleClick = () => {
    if (animRef.current) return; // Prevent multiple clicks
    
    const polar = toPolar(mouseRef.current.x, mouseRef.current.y);
    const start_r = polar.r;
    const start_theta = polar.theta;
    
    // z^2 math: r^2, 2*theta
    const target_r = start_r * start_r;
    let target_theta = start_theta * 2;
    // Keep angle normalized nicely for animation if needed, but linear interp of angle is fine
    
    animRef.current = {
      start_r,
      start_theta,
      target_r,
      target_theta,
      startTime: performance.now(),
      duration: 1200 // ms
    };
  };

  // Main render loop
  useEffect(() => {
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

      // Utils
      const scale = Math.min(w, h) / (2 * mathBounds);
      const toScreen = (mx, my) => {
        return {
          sx: w / 2 + mx * scale,
          sy: h / 2 - my * scale
        };
      };

      // ── Clear ──
      ctx.fillStyle = 'rgba(3, 7, 18, 0.95)';
      ctx.fillRect(0, 0, w, h);

      // ── Draw Coordinate System ──
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
      ctx.lineWidth = 1;
      
      // Grid lines (integer bounds)
      for (let i = -Math.floor(mathBounds); i <= Math.floor(mathBounds); i++) {
        // Vertical
        let p1 = toScreen(i, -mathBounds);
        let p2 = toScreen(i, mathBounds);
        ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
        
        // Horizontal
        p1 = toScreen(-mathBounds, i);
        p2 = toScreen(mathBounds, i);
        ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
      }
      
      // Axes
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
      ctx.lineWidth = 2;
      const originScreen = toScreen(0, 0);
      
      // Real axis
      ctx.beginPath(); ctx.moveTo(0, originScreen.sy); ctx.lineTo(w, originScreen.sy); ctx.stroke();
      // Imaginary axis
      ctx.beginPath(); ctx.moveTo(originScreen.sx, 0); ctx.lineTo(originScreen.sx, h); ctx.stroke();

      // Unit circle
      ctx.beginPath();
      ctx.arc(originScreen.sx, originScreen.sy, scale, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(192, 255, 0, 0.2)';
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]); // Reset
      
      // Labels
      ctx.fillStyle = 'rgba(34, 211, 238, 0.6)';
      ctx.font = '12px var(--font-display, monospace)';
      ctx.fillText('Re (Real)', w - 70, originScreen.sy - 10);
      ctx.fillText('Im (Imag)', originScreen.sx + 10, 20);
      
      // Draw 1 and i
      const one = toScreen(1, 0);
      const i_pt = toScreen(0, 1);
      ctx.fillText('1', one.sx + 5, one.sy - 5);
      ctx.fillText('i', i_pt.sx + 5, i_pt.sy - 5);

      // ── Handle State Rendering ──
      
      let currentPolar = null;
      let isAnimating = false;
      let animProgress = 0;

      if (animRef.current) {
        // We are animating
        isAnimating = true;
        const elapsed = time - animRef.current.startTime;
        let progress = elapsed / animRef.current.duration;
        
        if (progress > 1.2) {
          // Animation finished + slight pause, reset
          animRef.current = null;
          isAnimating = false;
        } else {
          animProgress = Math.min(progress, 1.0);
          
          // Easing function (easeOutExpo)
          const ease = animProgress === 1 ? 1 : 1 - Math.pow(2, -10 * animProgress);
          
          const current_r = animRef.current.start_r + (animRef.current.target_r - animRef.current.start_r) * ease;
          const current_theta = animRef.current.start_theta + (animRef.current.target_theta - animRef.current.start_theta) * ease;
          
          currentPolar = { r: current_r, theta: current_theta };
        }
      } 
      
      if (!isAnimating && hoverRef.current) {
        // Idle tracking
        currentPolar = toPolar(mouseRef.current.x, mouseRef.current.y);
      }

      // Draw active vector
      if (currentPolar) {
        const cart = toCartesian(currentPolar.r, currentPolar.theta);
        const screenPt = toScreen(cart.x, cart.y);

        // Vector line
        ctx.beginPath();
        ctx.moveTo(originScreen.sx, originScreen.sy);
        ctx.lineTo(screenPt.sx, screenPt.sy);
        ctx.strokeStyle = isAnimating ? 'var(--accent-neon, #c0ff00)' : 'var(--accent-cyan, #22d3ee)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Point head
        ctx.beginPath();
        ctx.arc(screenPt.sx, screenPt.sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = isAnimating ? 'var(--accent-neon, #c0ff00)' : 'var(--accent-cyan, #22d3ee)';
        ctx.fill();

        // If animating, draw the original starting point as a ghost
        if (isAnimating && animRef.current) {
          const startCart = toCartesian(animRef.current.start_r, animRef.current.start_theta);
          const startScreen = toScreen(startCart.x, startCart.y);
          
          ctx.beginPath();
          ctx.moveTo(originScreen.sx, originScreen.sy);
          ctx.lineTo(startScreen.sx, startScreen.sy);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(startScreen.sx, startScreen.sy, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34, 211, 238, 0.4)';
          ctx.fill();

          // Draw arc representing the angle doubling
          ctx.beginPath();
          ctx.arc(originScreen.sx, originScreen.sy, 30, -animRef.current.start_theta, -currentPolar.theta, animRef.current.target_theta > animRef.current.start_theta);
          ctx.strokeStyle = 'rgba(192, 255, 0, 0.5)';
          ctx.stroke();
        }

        // Display coordinate readout box
        const readX = 20;
        const readY = h - 60;
        ctx.fillStyle = 'rgba(3, 7, 18, 0.8)';
        ctx.fillRect(readX, readY, 200, 40);
        ctx.strokeStyle = isAnimating ? 'var(--accent-neon, #c0ff00)' : 'var(--accent-cyan, #22d3ee)';
        ctx.strokeRect(readX, readY, 200, 40);

        ctx.fillStyle = 'var(--text-main, #f0f4f8)';
        ctx.font = '14px var(--font-display, monospace)';
        
        const sign = cart.y >= 0 ? '+' : '-';
        const text = `z = ${cart.x.toFixed(2)} ${sign} ${Math.abs(cart.y).toFixed(2)}i`;
        ctx.fillText(text, readX + 15, readY + 25);
      }

      // Draw instructions
      if (!isAnimating && !hoverRef.current) {
        ctx.fillStyle = 'var(--text-dim, #94a3b8)';
        ctx.font = '14px var(--font-display, monospace)';
        ctx.textAlign = 'center';
        ctx.fillText('HOVER TO EXPLORE', w / 2, h - 30);
        ctx.textAlign = 'left'; // reset
      } else if (!isAnimating && hoverRef.current) {
        ctx.fillStyle = 'var(--accent-neon, #c0ff00)';
        ctx.font = '14px var(--font-display, monospace)';
        ctx.textAlign = 'center';
        ctx.fillText('CLICK TO SQUARE ( z → z² )', w / 2, h - 30);
        ctx.textAlign = 'left';
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, [dimensions]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        border: '2px solid var(--accent-cyan)',
        position: 'relative',
        cursor: animRef.current ? 'wait' : 'crosshair',
        background: 'rgba(3, 7, 18, 0.9)'
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ display: 'block', width: '100%' }}
      />
    </div>
  );
}
