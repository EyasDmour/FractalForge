import React from 'react';

export default function ConceptSection({ id, index, title, subtitle, content, quiz, viz }) {
  return (
    <section id={id} className="concept-section fade-in">
      <div className="concept-header">
        <span className="sec-index">SEC.{String(index).padStart(2, '0')}</span>
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--text-main)', margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem', fontSize: '1.1rem', fontFamily: 'var(--font-display)' }}>{subtitle}</p>}
      </div>
      <div className="concept-content">{content}</div>
      <div className="concept-viz">{viz}</div>
      {quiz && <div className="concept-quiz">{quiz}</div>}
    </section>
  );
}
