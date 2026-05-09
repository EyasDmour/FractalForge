import React from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import ConceptSection from './components/ConceptSection';
import FormulaCard from './components/FormulaCard';
import Placeholder from './components/Placeholder';
import { InlineMath, BlockMath } from 'react-katex';
import { DeepDiveButton } from './components/DeepDive';
import CoastlineMeasurement from './components/visualizations/CoastlineMeasurement';
import ComplexPlaneExplorer from './components/visualizations/ComplexPlaneExplorer';
import FormulaExplorer from './components/visualizations/FormulaExplorer';
import JuliaSetGenerator from './components/visualizations/JuliaSetGenerator';
import KochCurve from './components/visualizations/KochCurve';
import MandelbrotExplorer from './components/visualizations/MandelbrotExplorer';
import MandelbrotJuliaConnection from './components/visualizations/MandelbrotJuliaConnection';
import NewtonFractal from './components/visualizations/NewtonFractal';

function App() {
  return (
    <>
      <Header />

      {/* ═══ HERO ═══ */}
      <section id="intro" className="min-h-screen flex-center container-wide fade-in" style={{ textAlign: 'center' }}>
        <div style={{ padding: '3rem', border: '4px solid var(--accent-neon)', background: 'rgba(3,7,18,0.5)', backdropFilter: 'blur(10px)', boxShadow: '16px 16px 0px rgba(34,211,238,0.2)', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', color: 'var(--text-main)', marginBottom: '0.5rem', textShadow: '4px 4px 0px rgba(34,211,238,0.4)' }}>
            FRACTAL<br/>FORGE_
          </h1>
        </div>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-dim)', maxWidth: '700px', marginBottom: '2rem', lineHeight: '1.8' }}>
          Fractals are structures created by repeating simple rules. They can look complex, but the rules behind them are often surprisingly basic. This website turns those rules into interactive experiences — so you don't just read about fractals, you <strong style={{ color: 'var(--accent-neon)' }}>explore</strong> them.
        </p>
        <a href="#dimension" className="btn-tech">BEGIN_EXPLORATION</a>
      </section>

      {/* ═══ 1. FRACTAL DIMENSION ═══ */}
      <ConceptSection id="dimension" index={1} title="Fractal Dimension" subtitle="// BETWEEN A LINE AND A PLANE"
        content={<>
          <p>
            Normal geometry: a line is 1D, a square is 2D, a cube is 3D. But the Koch curve doesn't fit neatly — it's more complex than a line, yet doesn't fill a plane. Its dimension is <strong>between 1 and 2.</strong>
          </p>
          <p>
            Fractal dimension doesn't mean a strange physical axis. It measures <span className="highlight">how the pattern fills space as you zoom in.</span>
          </p>
          <FormulaCard
            formula="D = \frac{\log(N)}{\log(1/r)}"
            description="N = number of self-similar copies, r = scale factor of each copy."
          />
          <div className="compare-row">
            <div className="compare-card">
              <h4>LINE → D = 1</h4>
              <p>2 copies, r = 1/2<br/><InlineMath math="2 = 2^1" /></p>
            </div>
            <div className="compare-card">
              <h4>SQUARE → D = 2</h4>
              <p>4 copies, r = 1/2<br/><InlineMath math="4 = 2^2" /></p>
            </div>
          </div>
          <p className="mt-4">
            Koch curve: <InlineMath math="N = 4" /> copies, each at scale <InlineMath math="r = 1/3" />. So <InlineMath math="D = \log(4)/\log(3) \approx 1.262" /> — more complex than a line, less than a filled area. The boundary is fractal; the filled region inside remains 2D.
          </p>
        </>}
      />

      {/* ═══ 2. COMPLEX PLANE ═══ */}
      <ConceptSection id="complex" index={2} title="Complex Plane" subtitle="// THE CANVAS FOR FORMULA-BASED FRACTALS"
        content={<>
          <p>
            To understand formula-based fractals, we need the <strong>complex plane</strong>. A complex number has a real part and an imaginary part:
          </p>
          <FormulaCard
            formula="z = a + bi \quad\text{where}\quad i^2 = -1"
            description="a = real part (horizontal axis), b = imaginary part (vertical axis)."
          />
          <p>
            Each complex number becomes a point on a 2D plane. This is powerful for fractals because <span className="highlight">each pixel on screen can represent one complex number.</span> Apply a formula repeatedly to that number, observe the behavior, color the pixel accordingly. The image emerges from invisible numerical behavior.
          </p>
          <div className="callout">
            <strong>Squaring a Complex Number:</strong> Squaring doubles the angle and squares the modulus. <strong>Drag the blue point</strong>: inside the unit circle, <InlineMath math="z^2" /> collapses toward the origin; outside, it shoots away. The unit circle is the boundary between collapse and escape — and the dashed circle at <InlineMath math="r=2" /> is the escape radius every Julia/Mandelbrot calculation uses. Click <strong>"Keep going →"</strong> to iterate <InlineMath math="z \to z^2" /> repeatedly and see whether the orbit stays bounded or escapes.
          </div>
          <div className="callout" style={{ borderLeftColor: 'var(--accent-neon)', marginTop: '1rem' }}>
            <strong>Next stage:</strong> So far you've been squaring <InlineMath math="z" /> repeatedly. In the next stage we add one more thing: <InlineMath math="z \to z^2 + c" />. That small change — adding a fixed complex number <InlineMath math="c" /> — is what creates the <strong>Julia set</strong>. Try it.
          </div>
        </>}
        viz={<ComplexPlaneExplorer />}
      />

      {/* ═══ 3. WHAT MANDELBROT FOUND ═══ */}
      <ConceptSection id="formula-explorer" index={3} title="What Mandelbrot Found" subtitle="// z → z² + c  — TWO POINTS, ONE FORMULA" needsEdit
        content={<>
          <p>
            Benoit Mandelbrot studied what happens when you iterate <InlineMath math="z \to z^2 + c" /> for different starting points <InlineMath math="z_0" /> and constants <InlineMath math="c" />. The key discovery: the behavior depends entirely on <strong>where you start and what constant you add.</strong>
          </p>
          <p>
            Some combinations produce orbits that stay bounded forever — spiraling toward a fixed point or cycling. Others escape to infinity immediately. The line between these two outcomes is infinitely complex.
          </p>
          <div className="callout">
            <strong>Try it below:</strong> Drag the blue <InlineMath math="z_0" /> and green <InlineMath math="c" /> points. Click <strong>Run orbit</strong> to watch the sequence <InlineMath math="z_0, z_0^2+c, (z_0^2+c)^2+c, \ldots" /> step by step. Toggle <strong>paint dots</strong> and move your mouse to color the plane by outcome. Toggle <strong>hover orbit</strong> to preview any point's fate instantly.
          </div>
        </>}
        viz={<FormulaExplorer />}
      />

      {/* ═══ 4. JULIA SET ═══ */}
      <ConceptSection id="julia" index={4} title="Julia Set" subtitle="// ONE FORMULA, INFINITE WORLDS"
        content={<>
          <p>
            The Julia set uses a repeated formula. Pick a fixed constant <InlineMath math="c" />, then test many different starting values of <InlineMath math="z" /> (each pixel = one starting value):
          </p>
          <FormulaCard
            formula="z_{n+1} = z_n^2 + c"
            description="c is fixed. Each pixel = a different starting z. Iterate and observe."
          />
          <p>
            After many iterations: if the values stay bounded, the point belongs to the filled Julia set. If they escape to infinity, the point is outside. Color points by how quickly they escape — this is <strong>escape-time coloring.</strong>
          </p>
          <p>
            The fascinating part: <span className="highlight">a small change in <InlineMath math="c" /> creates a completely different Julia set.</span> One value produces a connected shape. Another produces scattered dust. Another produces spirals or branch-like structures. The constant <InlineMath math="c" /> controls the "personality" of the fractal.
          </p>
          <div className="callout">
            <strong>Try it below:</strong> Drag the green <InlineMath math="c" /> point (or use the sliders) — every move shifts the offset added after squaring. Drag the blue <InlineMath math="z_0" /> to pick a starting point and click <strong>Run orbit</strong> to watch its trajectory step by step. Then click <strong>Generate Julia set</strong> to test every pixel at once: bounded points form the colored set, escaping points are colored by <em>how fast</em> they leave. Hover any pixel to preview that point's orbit.
          </div>
          <div className="callout" style={{ borderLeftColor: 'var(--accent-neon)', marginTop: '1rem' }}>
            <strong>Next stage:</strong> You've seen that different values of <InlineMath math="c" /> create different Julia sets — some are connected blobs, some are scattered dust. Is there a pattern to <em>which</em> <InlineMath math="c" /> values produce which kind of shape? That's the <strong>Mandelbrot set</strong>.
          </div>
        </>}
        viz={<JuliaSetGenerator />}
      />

      {/* ═══ 5. MANDELBROT SET ═══ */}
      <ConceptSection id="mandelbrot" index={5} title="Mandelbrot Set" subtitle="// A MAP OF POSSIBLE BEHAVIORS"
        viz={<MandelbrotExplorer />}
        content={<>
          <p>
            Same formula as Julia — but the roles flip. We always start with <InlineMath math="z_0 = 0" /> and let <InlineMath math="c" /> change. Each pixel represents a different value of <InlineMath math="c" />.
          </p>
          <FormulaCard
            formula="z_{n+1} = z_n^2 + c \quad (z_0 = 0)"
            description="If the sequence stays bounded → c belongs to the Mandelbrot set."
          />
          <p>
            The Mandelbrot set is famous for its boundary: <span className="highlight">no matter how far you zoom, new structures keep appearing.</span> Some parts look like the whole set. Others reveal entirely new patterns.
          </p>
          <p>
            But it's more than a beautiful image. It's a <strong>map of possible behaviors</strong> — each point represents a value of <InlineMath math="c" />, which can generate a unique Julia set. The Mandelbrot set is a map of Julia sets.
          </p>
        </>}
      />

      {/* ═══ 6. THE GRAND CONNECTION ═══ */}
      <ConceptSection id="relationship" index={6} title="The Grand Connection" subtitle="// MANDELBROT = CONTROL MAP. JULIA = RESULT."
        content={<>
          <p>
            Julia and Mandelbrot use the same formula but ask different questions:
          </p>
          <div className="compare-row">
            <div className="compare-card">
              <h4>MANDELBROT SET</h4>
              <p><InlineMath math="z_0 = 0" /> fixed, <InlineMath math="c" /> changes.<br/>Each pixel = a value of <InlineMath math="c" />.<br/>"A map of possible worlds."</p>
            </div>
            <div className="compare-card">
              <h4>JULIA SET</h4>
              <p><InlineMath math="c" /> fixed, <InlineMath math="z" /> changes.<br/>Each pixel = starting <InlineMath math="z" />.<br/>"One world from one <InlineMath math="c" />."</p>
            </div>
          </div>
          <div className="callout">
            <strong>Key insight:</strong> The Mandelbrot set is the control map. The Julia set is the result. Drag the green c point on the Mandelbrot set below → the Julia set updates in real time. Inside the set → connected Julia set. Outside → disconnected dust. One parameter changes an entire mathematical world.
          </div>
        </>}
        viz={<MandelbrotJuliaConnection />}
      />

      {/* ═══ 7. NEWTON FRACTAL ═══ */}
      <ConceptSection id="newton" index={7} title="Newton's Fractal" subtitle="// WHEN EQUATION-SOLVING CREATES ART"
        viz={<NewtonFractal />}
        content={<>
          <p>
            Many equations have no clean algebraic solution. You cannot rearrange <InlineMath math="z^3 - 1 = 0" /> into a simple formula the way you can a quadratic. But you can <em>approximate</em> the answer, using nothing but a starting guess and a repeating rule.
          </p>
          <FormulaCard
            formula="z_{n+1} = z_n - \frac{f(z_n)}{f'(z_n)}"
            description="At each guess zₙ, the slope f′(zₙ) tells you which direction and how far to move. The next guess zₙ₊₁ is where the tangent line crosses zero."
          />
          <p>
            The method converges fast — exponentially fast. A rough initial guess can become fifteen decimal places of accuracy in ten steps. Apply this to <strong>every point on the complex plane</strong> as a starting guess, color each point by which root it converges to, and something completely unexpected appears.
          </p>
          <DeepDiveButton label="Newton's Fractal">
            <p>
              Take <InlineMath math="f(z) = z^3 - 1" />. This polynomial has three roots — the three cube roots of unity, spaced evenly around the unit circle at 120° angles from each other.
            </p>
            <p>
              If you start Newton's method anywhere on the complex plane, the sequence will almost always converge to one of those three roots. Color starting points green, pink, or orange depending on which root they reach. What would you expect to see?
            </p>
            <p>
              Three smooth blobs — a green zone near the green root, a pink zone near the pink root, an orange zone near the orange one. Clean, simple, predictable.
            </p>
            <p>
              <span className="highlight">That is not what you see.</span>
            </p>
            <p>
              The three regions are hopelessly interleaved. Their boundaries are infinitely detailed — zoom into any edge and you find smaller copies of the same complexity, forever. And more strangely: <strong>the boundary between any two colors always contains the third.</strong> There is no edge between green and pink that doesn't also pass through orange. The three basins of attraction are simultaneously adjacent to each other everywhere along their shared boundaries.
            </p>
            <div className="callout">
              <strong>Why it happens:</strong> Newton's method works by following the tangent line — the linear approximation of the function at your current point. Near a root, the function is nearly linear, so the approximation is good and convergence is fast. But near the boundary between basins, the tangent line is nearly flat. A nearly-flat tangent line crosses zero far away — the next iterate jumps unpredictably across the plane. Small differences in starting position get amplified enormously. This is the same <strong>sensitive dependence on initial conditions</strong> that appears in chaos theory.
            </div>
            <p>
              The three roots act like gravitational attractors. Most of the plane is clearly pulled toward one. But along the boundary, the competing pulls nearly cancel — and the geometry of that cancellation is fractal.
            </p>
            <p>
              This was proven rigorously by the mathematicians <strong>Gaston Julia</strong> and <strong>Pierre Fatou</strong> in the 1910s, decades before anyone could draw it. The set of boundary points — where Newton's method fails to converge cleanly — is called the <strong>Julia set</strong> of the iteration. The colored regions themselves are the <strong>Fatou set</strong>: the points where behavior is stable and predictable.
            </p>
            <p>
              Newton's fractal is a portrait of the boundary between order and chaos, drawn by an algorithm that was only meant to find roots.
            </p>
          </DeepDiveButton>
        </>}
      />

      {/* ═══ 8. ITERATION & SIERPINSKI ═══ */}
      <ConceptSection id="module-1" index={8} title="Iteration" subtitle="// REPEATED RULES → COMPLEX STRUCTURES"
        content={<>
          <p>
            A <strong>fractal</strong> is a structure generated by repeatedly applying a simple rule. This process is called <strong>iteration</strong> — repeating the same operation again and again.
          </p>
          <p>
            At first, the rule looks simple. But after many repetitions, the result becomes highly detailed and complex. This is one of the core ideas behind fractals: <span className="highlight">a simple repeated rule creates a complex structure.</span>
          </p>
          <div className="callout">
            <strong>Sierpinski triangle:</strong> Start with one equilateral triangle. Mark the midpoints of each side. Connect them — this divides the triangle into four smaller ones. Remove the center triangle. Repeat on each remaining triangle. The result approaches the famous Sierpinski triangle.
          </div>
          <p>
            The strange thing: the rule is trivial, but the final structure has infinite detail and perfect self-similarity — zoom in and you see the same pattern at every scale.
          </p>
        </>}
      />

      {/* ═══ 9. GEOMETRIC vs FORMULA-BASED ═══ */}
      <ConceptSection id="module-2" index={9} title="Two Types" subtitle="// GEOMETRIC vs FORMULA-BASED FRACTALS"
        content={<>
          <p>
            The Sierpinski triangle is a <strong>geometric fractal</strong> — created by directly modifying a shape using a repeated construction rule (divide, remove, copy, replace).
          </p>
          <p>
            But geometric construction isn't the only path. <strong>Formula-based fractals</strong> start with a number, plug it into a formula, and feed the result back in. After many iterations, we observe behavior: does the value settle? Escape? Spiral? The fractal appears when we color points based on that behavior.
          </p>
          <div className="compare-row">
            <div className="compare-card">
              <h4>GEOMETRIC</h4>
              <p>Rule acts directly on a <strong>shape</strong>. Structure visible immediately.</p>
            </div>
            <div className="compare-card">
              <h4>FORMULA-BASED</h4>
              <p>Rule acts on <strong>numbers</strong>. Shape appears after visualizing behavior.</p>
            </div>
          </div>
          <p>
            Fractal Forge covers both sides: geometric fractals (Sierpinski, Koch) and formula-based fractals (Julia, Mandelbrot, Newton).
          </p>
        </>}
      />

      {/* ═══ 10. KOCH SNOWFLAKE ═══ */}
      <ConceptSection id="geometric" index={10} title="Koch Snowflake" subtitle="// INFINITE PERIMETER, FINITE AREA"
        content={<>
          <p>
            The Koch snowflake starts as an equilateral triangle. For every side: divide into three equal parts, remove the middle third, replace it with two sides of a smaller outward triangle. Every straight segment becomes four smaller segments. Repeat.
          </p>
          <p>
            This creates an unusual mathematical property: <span className="highlight">infinite perimeter enclosing a finite area.</span> The boundary keeps getting longer, but the snowflake still fits inside a limited region.
          </p>
          <FormulaCard
            formula="N_n = 3 \times 4^n"
            description="Number of sides at iteration n. Each old side → 4 new sides."
          />
          <FormulaCard
            formula="l_n = \frac{s}{3^n}"
            description="Length of each side. Divided by 3 at every iteration."
          />
          <FormulaCard
            formula="P_n = 3s\left(\frac{4}{3}\right)^n \;\longrightarrow\; \infty"
            description="Perimeter = sides × length. Since 4/3 > 1, perimeter → infinity as n → ∞."
          />
          <DeepDiveButton label="Coastline Paradox">
            <p>
              The <strong>coastline paradox</strong> reveals that the measured length of a coastline depends on the scale of measurement. Take Jordan's coastline along the <strong>Gulf of Aqaba</strong> — officially listed at about 26 km. But that number depends entirely on how you measure it.
            </p>
            <p>
              Use a 5 km ruler and you get one number — the ruler skips over rocky inlets and small bays. Switch to a 1 km ruler and the measured length increases, because now you trace around features the larger ruler missed. Use a 100 m ruler and it grows again — capturing the jagged edges of every rocky outcrop along Aqaba's shore.
            </p>
            <p>
              Reduce the ruler further — 10 m, 1 m — and the measured length keeps growing. In theory, as the measurement scale approaches zero, the coastline length approaches infinity.
            </p>
            <p>
              Mathematician <strong>Benoit Mandelbrot</strong> showed that this happens because coastlines have fractal-like properties. They are not smooth curves — they have roughness at every scale. The Koch snowflake is the idealized mathematical version: a shape where this process is carried to its logical extreme.
            </p>
            <FormulaCard
              formula="L(\varepsilon) = N(\varepsilon) \times \varepsilon"
              description="Measured length L depends on ruler size ε. Smaller ε → more segments N → longer L."
            />
            <p>
              Below, you can try this yourself: measure Jordan's Aqaba coastline with different ruler sizes and watch the <span className="highlight">measured length change as the ruler shrinks.</span>
            </p>
            <CoastlineMeasurement />
          </DeepDiveButton>
        </>}
        viz={<KochCurve />}
      />

      <Footer />
    </>
  );
}

export default App;
