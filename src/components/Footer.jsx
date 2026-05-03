import React from 'react';

export default function Footer() {
  return (
    <footer style={{
      textAlign: 'center', padding: '4rem 0',
      borderTop: '2px solid var(--accent-cyan)',
      marginTop: '6rem', color: 'var(--text-dim)',
      background: 'rgba(3, 7, 18, 0.9)',
      fontFamily: 'var(--font-display)',
      textTransform: 'uppercase',
      fontSize: '0.9rem'
    }}>
      <div style={{ color: 'var(--text-main)', fontWeight: 'bold', marginBottom: '1rem', fontSize: '1.2rem' }}>
        FRACTAL_FORGE_ // END_OF_FILE
      </div>
      <p>SYS.EDU.ACTIVE_LEARNING // BUILD.V1</p>
    </footer>
  );
}
