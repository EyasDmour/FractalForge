import React, { useState } from 'react';
import MandelbrotExplorer from './MandelbrotExplorer';
import JuliaSetGenerator from './JuliaSetGenerator';

export default function MandelbrotJuliaConnection() {
  const [sharedC, setSharedC] = useState({ x: -0.4, y: 0.6 });
  return (
    <div className="grand-connection">
      <div className="grand-connection-panel">
        <div className="grand-connection-label">MANDELBROT — drag the c point</div>
        <MandelbrotExplorer onCChange={setSharedC} />
      </div>
      <div className="grand-connection-panel">
        <div className="grand-connection-label">JULIA — c controlled by Mandelbrot</div>
        <JuliaSetGenerator externalC={sharedC} />
      </div>
    </div>
  );
}
