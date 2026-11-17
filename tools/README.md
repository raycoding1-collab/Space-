# Render tools (headless)

These scripts render stills of the scene in headless Chromium, using the pre-installed Playwright and the
SwiftShader software renderer. They're for development and screenshots and aren't part of the app.

```bash
python3 -m http.server 8765 --bind 127.0.0.1 &
```

```bash
node tools/render-views.js <outdir> <width> <height> "<query>" <views.json>
```

- `<query>` is appended to `index.html?still&` (for example `q=test`, `q=ultra`, or `ship=city&q=test`).
- `views.json` is an array of views. Each one is `{ "name", "pos": [x,y,z], "target": [x,y,z], "fov", "t" }`
  or `{ "name", "id": "<poi id>", "t" }`.
- Use `q=test` for fast iteration (about 1–2 s per 960×540 frame) and `q=ultra` with 3840 2160 for
  final 4K stills (about 10 s per frame after a roughly 40 s load).
- In the page, `window.VESPERA` exposes `setTime`, `setView`, `renderStill(w, h)` (returns a PNG data URL),
  `renderer`, `scene` and `camera`.
