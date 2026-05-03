import React from 'react';

export default function Header() {
  return (
    <header style={{
      position: 'fixed', top: 0, width: '100%', padding: '1.5rem 2rem',
      background: 'rgba(3, 7, 18, 0.9)', backdropFilter: 'blur(12px)',
      zIndex: 100, borderBottom: '2px solid var(--accent-cyan)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
        FRACTAL_FORGE_
      </div>
      <nav style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}>
        <a href="#intro">[ INTRO ]</a>
        <a href="#geometric">[ GEOMETRIC ]</a>
        <a href="#complex">[ COMPLEX ]</a>
        <a href="#mandelbrot">[ MANDELBROT ]</a>
        <a href="#challenge" style={{ color: 'var(--accent-neon)' }}>[ CHALLENGE ]</a>
      </nav>
    </header>
  );
}
