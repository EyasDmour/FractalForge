import React from 'react';
import { BlockMath } from 'react-katex';

export default function FormulaCard({ formula, description }) {
  return (
    <div className="math-block fade-in">
      <div style={{ fontSize: '1.5rem', textAlign: 'center', margin: '1rem 0' }}>
        <BlockMath math={formula} />
      </div>
      {description && (
        <div style={{ borderTop: '2px solid rgba(3,7,18,0.2)', paddingTop: '1rem', marginTop: '1rem', fontSize: '1rem', fontFamily: 'var(--font-body)', color: 'rgba(3,7,18,0.8)' }}>
          {description}
        </div>
      )}
    </div>
  );
}
