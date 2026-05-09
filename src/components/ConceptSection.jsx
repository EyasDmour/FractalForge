import React, { useState } from 'react';

export default function ConceptSection({ id, index, title, subtitle, content, quiz, viz, needsEdit }) {
  const storageKey = `edit-note-${id}`;
  const [editOpen, setEditOpen]   = useState(false);
  const [editText, setEditText]   = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });

  const handleEdit = (text) => {
    setEditText(text);
    try { localStorage.setItem(storageKey, text); } catch {}
  };

  return (
    <section id={id} className="concept-section fade-in">
      <div className="concept-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <span className="sec-index">SEC.{String(index).padStart(2, '0')}</span>
            <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--text-main)', margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem', fontSize: '1.1rem', fontFamily: 'var(--font-display)' }}>{subtitle}</p>}
          </div>
          {needsEdit && (
            <button
              onClick={() => setEditOpen(o => !o)}
              style={{ flexShrink: 0, marginTop: '0.5rem', fontFamily: 'var(--font-display)', fontSize: '0.7rem', padding: '0.3rem 0.7rem', background: editOpen ? 'rgba(251,146,60,0.15)' : 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.5)', color: '#fb923c', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' }}
            >
              {editOpen ? 'CLOSE' : '✎ NEEDS EDIT'}
            </button>
          )}
        </div>
        {editOpen && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.3)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', color: '#fb923c', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>CONTENT NOTES</div>
            <textarea
              value={editText}
              onChange={(e) => handleEdit(e.target.value)}
              placeholder="Draft content notes for this section…"
              rows={6}
              style={{ width: '100%', background: 'rgba(3,7,18,0.8)', border: '1px solid rgba(251,146,60,0.4)', color: 'var(--text-main)', fontFamily: 'var(--font-display)', fontSize: '0.85rem', padding: '0.75rem', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
            />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', color: 'rgba(148,163,184,0.5)', marginTop: '0.3rem' }}>auto-saved to localStorage</div>
          </div>
        )}
      </div>
      <div className="concept-content">{content}</div>
      <div className="concept-viz">{viz}</div>
      {quiz && <div className="concept-quiz">{quiz}</div>}
    </section>
  );
}
