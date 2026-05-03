import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight } from 'lucide-react';

/*
 * DeepDiveButton
 * Renders an inline trigger. On click, mounts a full-height
 * reference panel via React Portal (body-level, no nesting issues).
 * 
 * Three animation states: unmounted → entering → open → exiting → unmounted
 */
export function DeepDiveButton({ label, children }) {
  const [phase, setPhase] = useState('closed'); // closed | entering | open | exiting

  const open = useCallback(() => {
    setPhase('entering');
    document.body.style.overflow = 'hidden';
    // Let the DOM paint the initial state, then trigger transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'));
    });
  }, []);

  const close = useCallback(() => {
    setPhase('exiting');
    document.body.style.overflow = '';
    setTimeout(() => setPhase('closed'), 450);
  }, []);

  // ESC key
  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, close]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isVisible = phase !== 'closed';
  const isActive = phase === 'open';

  return (
    <>
      <button className="dd-trigger" onClick={open} type="button">
        <ArrowRight size={14} strokeWidth={2.5} />
        <span>DEEP_DIVE: {label}</span>
      </button>

      {isVisible && createPortal(
        <div className="dd-root" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <div
            className={`dd-backdrop ${isActive ? 'dd-backdrop--active' : ''}`}
            onClick={close}
          />

          {/* Panel */}
          <aside className={`dd-panel ${isActive ? 'dd-panel--active' : ''}`}>
            {/* Scanline sweep on open */}
            <div className={`dd-scanline ${isActive ? 'dd-scanline--run' : ''}`} />

            {/* Header — file-tab style */}
            <header className="dd-header">
              <div className="dd-header-label">
                <span className="dd-header-prefix">REF://</span>
                <span className="dd-header-title">{label}</span>
              </div>
              <button className="dd-close" onClick={close} type="button" aria-label="Close panel">
                <X size={18} strokeWidth={2.5} />
              </button>
            </header>

            {/* Scrollable body */}
            <div className="dd-body">
              {children}
            </div>

            {/* Bottom status bar */}
            <footer className="dd-footer">
              <span>ESC to close</span>
              <span>FRACTAL_FORGE // REFERENCE</span>
            </footer>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
