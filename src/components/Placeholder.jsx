import React from 'react';
import { Shapes, BrainCircuit } from 'lucide-react';

export default function Placeholder({ title, type = 'viz' }) {
  const isQuiz = type === 'quiz';
  const Icon = isQuiz ? BrainCircuit : Shapes;
  
  return (
    <div className="schematic-box fade-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: '100%', height: '100%',
      minHeight: isQuiz ? '180px' : '350px'
    }}>
      <div style={{ position: 'absolute', top: '1rem', left: '1rem', fontSize: '0.8rem', fontFamily: 'var(--font-display)', color: 'var(--accent-cyan)' }}>
        X: {Math.floor(Math.random() * 200 - 100).toFixed(1)} <br/> 
        Y: {Math.floor(Math.random() * 200 - 100).toFixed(1)}
      </div>
      <Icon size={48} style={{ color: isQuiz ? 'var(--accent-neon)' : 'var(--text-main)', marginBottom: '1.5rem' }} />
      <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', textAlign: 'center', color: isQuiz ? 'var(--accent-neon)' : 'var(--text-main)' }}>{title}</h3>
      <p style={{ color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '0.9rem', textTransform: 'uppercase' }}>
        [{isQuiz ? 'SYS_QUIZ_MODULE_PENDING' : 'SYS_VIZ_MODULE_PENDING'}]
      </p>
    </div>
  );
}
