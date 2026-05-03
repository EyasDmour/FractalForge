# Fractal Forge ◼️

Fractal Forge is an interactive, brutalist-styled educational platform built to demonstrate the underlying mathematical mechanics of fractals. Instead of just reading about recursive patterns, this platform allows you to interact with the underlying rules, parameters, and algorithms to generate complex visual structures.

![Fractal Forge](./src/assets/react.svg) *(Visual placeholders / Add screenshots here)*

## 🚀 Features

Currently, the platform includes interactive visualization modules for:
- **The Koch Curve:** Watch a simple straight line explode into an infinitely detailed geometric snowflake, featuring both sequential drawing algorithms and simultaneous growth pulses.
- **The Coastline Paradox:** Experiment with different sized rulers measuring Jordan's Aqaba coastline, visually proving that as your ruler gets smaller, the coastline's length approaches infinity.
- **The Complex Plane Explorer:** A full canvas mapping of the complex plane, demonstrating how mathematical scaling and rotational behavior maps to 2D space (specifically the $z \rightarrow z^2$ operation).
- **Formula & Math Cards:** LaTeX-powered brutalist information cards explaining the core mechanics (using `react-katex`).

## 🛠 Tech Stack

- **Framework:** React + Vite
- **Styling:** Custom Vanilla CSS (Brutalist aesthetic, neon accents, heavy shadows, hardware-accelerated animations)
- **Visual Rendering:** HTML5 `<canvas>` API (High-performance JS requestAnimationFrame loops)
- **Math Typsetting:** KaTeX (`react-katex`)

---

## 💻 Installation & Local Development

This project uses standard Node.js tooling and can be easily run on both Windows and Linux environments.

### Prerequisites
Before you begin, ensure you have the following installed on your machine:
- **[Git](https://git-scm.com/downloads)**
- **[Node.js](https://nodejs.org/)** (v18.0.0 or higher is recommended, which includes `npm`)

### 1. Clone the Repository

Open your terminal or command prompt and run:
```bash
git clone https://github.com/your-username/FractalForge.git
cd FractalForge
```

### 2. Install Dependencies

You'll need to install the required Node modules. You can do this by running:

**On Linux (Bash) / Windows (PowerShell / Command Prompt):**
```bash
npm install
```

### 3. Run the Development Server

Start the Vite development server to view the project locally.

**On Linux (Bash) / Windows (PowerShell / Command Prompt):**
```bash
npm run dev
```

The terminal will output a local URL (usually `http://localhost:5173/` or similar). Open this link in your web browser.

---

## 🏗 Building for Production

If you want to compile the project for deployment (compresses and optimizes files):

```bash
npm run build
```
The optimized files will be outputted to the `dist/` directory, ready to be hosted on any static file server (Vercel, Netlify, GitHub Pages, etc.). To preview the production build locally:

```bash
npm run preview
```

## 🎨 Design Philosophy

Fractal Forge completely abandons "clean, corporate" design patterns. It embraces a **Terminal/Brutalist** aesthetic:
- **Dark Modes & High Contrast:** Pure blacks (`#030712`) offset by glowing neon cyan (`#22d3ee`) and electric lime (`#c0ff00`).
- **Raw Elements:** Exposed grid lines, unfiltered borders, monospaced fonts (`JetBrains Mono`), and hard drop shadows (`box-shadow: 8px 8px 0px`).
- **Tactile Interactivity:** Modules lift physically off the page on hover (`transform: translate`) rather than smoothly fading, mimicking hardware interactions. 
