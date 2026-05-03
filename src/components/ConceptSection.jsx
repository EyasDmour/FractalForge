import React from 'react';

export default function ConceptSection({ id, index, title, subtitle, content, quiz, viz }) {
  return (
    <section id={id} className="container-wide py-20 fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ marginBottom: '3rem', borderLeft: '4px solid var(--accent-neon)', paddingLeft: '1.5rem' }}>
        <span className="sec-index">SEC.{String(index).padStart(2, '0')}</span>
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--text-main)', margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem', fontSize: '1.1rem', fontFamily: 'var(--font-display)' }}>{subtitle}</p>}
      </div>
      <div className="section-grid">
        <div className="section-content">{content}</div>
        <div className="section-viz">{viz}</div>
        <div className="section-quiz">{quiz}</div>
      </div>
    </section>
  );
}
