# image-gallery
# Infinity Canvas — Infinite Zoom Image Gallery

A high-performance, infinite panning, and infinitely zooming data quilt canvas component, translated completely into clean, vanilla web standards (HTML5, CSS3, and JavaScript ES6+).

## 🚀 Architectural Overview

Unlike typical matrix transformations that grow pixelated or breakdown due to precision limits at high ranges, this gallery uses an **octave-swap zoom quilt engine**:
* **True Infinite Zoom:** Tracks view parameters using a raw mathematical log scalar ($2^{\text{logZoom}}$).
* **Deterministic Layout Generation:** Dynamically seeds procedural coordinates using an ultra-fast Spatial Hash algorithm (`hash3`) combined with a `mulberry32` pseudo-random generator.
* **Smart Garbage Collection Pools:** Instead of maintaining thousands of hidden elements, the engine maps elements through active octave tracking pools (`Map`) and drops unseen structural nodes to preserve runtime performance.
* **Parallax Mouse Tracker:** Built-in viewport easing handles low-pass filtering interpolation (`lerp`) for continuous drag mechanics and smooth inertia dampening.

## 🛠️ Installation & Setup

No compilation steps, node environments, or dependencies are necessary. 

1. Clone or download this project workspace repository:
   ```bash
   git clone [https://github.com/hadi327/infinity-canvas.git](https://github.com/hadi327/infinity-canvas.git)
