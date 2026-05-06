# Fractal Forge — Interactive Animation Plan
## Formula-Based Fractal Stages

> **Status:** Living document, built block by block.
> **Scope:** Stages 6–10 — Complex Plane Explorer → Julia Set → Mandelbrot → Mandelbrot↔Julia → Newton Fractal
> **Design principle:** Every interaction should force a *discovery*, not just a demonstration. The user must feel the math, not just see it.

---

## Block 1 — Stage 6: Complex Plane Explorer

### What concept are we teaching?
Complex numbers are just 2D points. `z = a + bi` means: `a` steps right, `b` steps up. That's it. This stage must make that feel *obvious* before the user touches any fractal formula.

### Why this stage is the most critical
If the user arrives at Stage 7 (Julia Set) without genuinely feeling what `z²` does to a point, they're just watching a pretty picture. They won't understand why the fractal looks the way it does, or why changing `c` changes anything. This stage is the entire foundation.

### Core pedagogical arc
Three ideas in sequence:
1. A complex number is a point you can drag.
2. `z²` moves that point somewhere predictable — and you can see where.
3. Repeated `z²` either collapses toward zero or explodes outward. This is the escape intuition.

---

### Interaction Design

#### Interaction A — "Place your point"
**What the user does:** Clicks or drags a glowing dot anywhere on the complex plane grid.

**What they see:**
- The coordinates update live: `z = 0.6 + 0.8i`
- The modulus (distance from origin) is shown as a circle centered at origin, with radius `|z|`
- A subtle label shows `|z| = 1.0` inside the circle

**What this teaches:** The modulus is just the distance from zero. Visual, not abstract.

---

#### Interaction B — "See where z² lands"
**What the user does:** After placing `z`, a second ghost point appears automatically at `z²`. A curved arc (like a compass sweep) connects `z` to `z²`.

**What they see:**
- `z²` computed and displayed in real time: `z² = -0.28 + 0.96i`
- A dashed straight line connects `z` to `z²`
- A small protractor-style wedge arc at the origin compares the angle of `z` vs `z²`, making the angle-doubling visible where it's most natural
- Color coding: `z` is blue, `z²` is orange

**The aha moment:**
- Drag `z` *inside* the unit circle (`|z| < 1`) → `z²` moves *closer* to the origin than `z` (squaring makes small numbers smaller)
- Drag `z` *outside* the unit circle (`|z| > 1`) → `z²` shoots *farther* from the origin (squaring makes big numbers bigger)
- Drag `z` exactly on the unit circle → `z²` stays on the circle (rotates, doesn't escape)

**What this teaches:** The unit circle is a *boundary*. Points inside collapse; points outside explode. This is exactly what determines whether a fractal orbit escapes.

---

#### Interaction C — "What happens if we keep squaring?"
**What the user does:** Clicks a "Keep going →" button after seeing `z²`.

**What they see:**
- Each click computes one more iteration: `z → z² → z⁴ → z⁸ → ...`
- Each new point is drawn as a fading dot, connected by a trail
- After ~5 steps, a clear verdict appears:
  - If points converged toward origin: **"This point stays bounded"** (shown in green)
  - If points flew outside the grid: **"This point escapes to infinity"** (shown in red)

**What this teaches:** The behavior of one point under repeated squaring is already the core logic of every formula-based fractal. No `c` yet — just the raw machine.

---

#### Interaction D — "The escape radius"
**What the user does:** No action needed — the unit circle is always visible as a dashed boundary ring.

**Enhancement:** A second dashed ring at radius 2 appears (labeled "escape radius = 2"). A tooltip explains: *"Once a point gets farther than 2 from the origin, it will always escape. We stop counting here."*

**What this teaches:** The escape threshold of 2 (used in all Julia/Mandelbrot calculations) has a visual, geometric meaning. It's not arbitrary.

---

### Visual Layout

```
┌─────────────────────────────────────────────────┐
│  [Complex Plane — full width canvas]             │
│                                                  │
│    ···· unit circle (dashed)                    │
│    ···· escape circle radius=2 (dashed)         │
│                                                  │
│    • z  (draggable blue dot)                    │
│    ◦ z² (auto-placed orange dot)               │
│    · · · orbit trail (fading dots)              │
│                                                  │
├─────────────────────────────────────────────────┤
│  z = 0.60 + 0.80i    |z| = 1.00                │
│  z² = -0.28 + 0.96i  |z²| = 1.00               │
│                                                  │
│  [Keep going →]   [Reset]                       │
└─────────────────────────────────────────────────┘
```

---

### What NOT to include in this stage
- No `c` parameter yet — that's Stage 7's reveal
- No coloring of regions — that would skip ahead to the fractal before building intuition
- No formula sliders — keep the focus on the single draggable point

---

### Bridge to Stage 7
At the end of this stage, add one short callout:

> *"So far you've been squaring z repeatedly. In the next stage, we add something: z → z² + c. That small change — adding a fixed complex number c — is what creates the Julia set. Try it."*

This makes the transition feel like a natural next step, not a new topic.

---

---

## Block 2 — Stage 7: Julia Set Generator

### What concept are we teaching?
The Julia set is generated by `z(n+1) = z(n)² + c`. For a **fixed** complex number `c`, every point on the plane is tested as a starting `z₀`. Points whose orbits stay bounded form the Julia set; points whose orbits escape do not. The **shape** of the set depends entirely on `c`.

### Why this stage matters
Stage 6 made `z²` feel mechanical. This stage adds *one small thing* — adding `c` — and shows that this single change generates infinite visual variety. The user must feel that the fractal isn't drawn; it's *measured*, pixel by pixel, by running the formula.

### Core pedagogical arc
1. The formula gets one new ingredient: `+ c`.
2. A single point still has an orbit — but now the orbit can spiral, loop, or escape depending on `c`.
3. The "Julia set" is just the result of doing this for every pixel at once.
4. Different values of `c` produce dramatically different shapes.

---

### Interaction Design

#### Interaction A — "Meet c"
**What the user does:** Arrives at a familiar-looking complex plane. The blue draggable `z` is still there. A new **green draggable point `c`** is now on the plane.

**What they see:**
- The formula at the top updates from `z → z²` to `z → z² + c`
- The orange point now shows `z² + c` instead of just `z²`
- Both `z` and `c` are independently draggable
- A live readout: `z = 0.5 + 0.3i`, `c = -0.4 + 0.6i`, `z² + c = -0.24 + 0.90i`

**What this teaches:** `c` is just a fixed offset added after squaring. Drag `c` around — the orange point shifts by the same amount.

---

#### Interaction B — "Trace one orbit"
**What the user does:** Clicks a "Run orbit" button. The orange point becomes the new `z`, then the calculation runs again, and again.

**What they see:**
- Animated step-by-step iteration: `z₀ → z₁ → z₂ → ...` with arrows or a connecting trail
- A counter shows the iteration number
- After ~30 steps or once `|z| > 2`, a verdict appears:
  - **Bounded** (green badge) — orbit stayed inside escape radius
  - **Escaped at step N** (red badge) — orbit crossed `|z| = 2`
- Speed slider: slow / normal / instant

**The aha moment:**
- Move `z₀` to different starting points with the *same* `c` → some orbits escape, some don't. The boundary between them is invisible at this point — but it exists.
- Drag `c` slightly → orbits behave completely differently.

---

#### Interaction C — "Now test every point at once"
**What the user does:** Clicks "Generate Julia set" (or it auto-fills as they explore).

**What they see:**
- The full Julia set renders for the current `c`
- Bounded points are colored (in the set); escaping points are colored by *how fast* they escaped (the standard escape-time gradient)
- The user's previous `z₀` from Interaction B is still visible as a marker, sitting inside or outside the colored region — confirming visually what the orbit told them

**What this teaches:** The fractal image IS the result of running Interaction B for every pixel simultaneously. Color = escape behavior. Black/colored region = bounded. There's no magic — it's a giant batch of orbit tests.

---

#### Interaction D — "Change c, watch the world transform"
**What the user does:** Drags the `c` point (or uses Re(c) / Im(c) sliders). The Julia set redraws live.

**What they see:**
- Real-time recomputation as `c` moves
- Optional: a "preset tour" with named c values
  - `c = -0.4 + 0.6i` → classic swirl
  - `c = -0.7269 + 0.1889i` → dendrite
  - `c = 0.285 + 0.01i` → spiraling islands
  - `c = -0.8 + 0.156i` → connected blob
- Each preset shows a small label naming the shape's character

**What this teaches:** One parameter (`c`) controls the entire visual identity of the fractal. The math is fixed; the result is wildly variable.

---

#### Interaction E — "Why is this pixel that color?"
**What the user does:** Hovers any pixel on the rendered Julia set.

**What they see:**
- The orbit for that exact starting point is overlaid live
- A side panel shows: starting `z₀`, escape step (or "bounded"), and the orbit's path
- The pixel's color in the gradient is highlighted in a legend so the user sees *which step count* maps to *which color*

**What this teaches:** Every pixel has a story. The color isn't decoration — it encodes how many steps it took for that orbit to escape.

---

### Visual Layout

```
┌──────────────────────────────────────────────┐
│  Formula:  z → z² + c                         │
├──────────────────────────────────────────────┤
│                                               │
│        [Julia set canvas, full width]         │
│                                               │
│        • z₀ (draggable)                       │
│        • c  (draggable, green)                │
│        ··· orbit trail (when running)         │
│                                               │
├──────────────────────────────────────────────┤
│  c = -0.40 + 0.60i    [Re slider] [Im slider]│
│  z₀ = 0.20 + 0.10i                            │
│  Verdict: Escaped at step 17                  │
│                                               │
│  [Run orbit] [Generate set] [Presets ▾]      │
└──────────────────────────────────────────────┘
```

---

### What NOT to include in this stage
- No Mandelbrot set yet — that's Stage 8's reveal
- No mention that "Mandelbrot maps Julia sets" — saving that for Stage 9
- No deep zoom — keep the focus on parameter exploration, not visual sightseeing

---

### Bridge to Stage 8
End with a question, not a statement:

> *"You've seen that different values of c create different Julia sets — some are connected blobs, some are scattered dust. Is there a pattern to which c values produce which kind of shape? That's the Mandelbrot set."*

---

*Next: Block 3 — Stage 8: Mandelbrot Explorer*
