# LineArt Color Reveal

Transform photos into minimal line art, then selectively reveal original colors by painting with a brush.

## Overview

1. **Upload** a photo (JPEG, PNG, WebP)
2. **Line art** is generated automatically (currently client-side edge detection; AI API integration planned)
3. **Paint** with a brush to reveal original colors on the line art base
4. **Export** at 1024px (free with watermark) or higher resolutions (credits, coming soon)

## Getting Started

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
apps/web/              # Next.js (App Router) + TypeScript + Tailwind CSS
  src/
    app/
      page.tsx         # Upload page (/)
      editor/page.tsx  # Canvas editor (/editor)
      pricing/page.tsx # Pricing page (/pricing)
      debug/page.tsx   # Debug page (/debug) - pipeline visualization
    utils/
      imageProcessing.ts  # Line art generation, compositing, export, feather
      maskHistory.ts      # Undo/Redo history for mask
```

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **Canvas API** for image processing

## Adjustment Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| **Line Threshold** | 10-200 | 40 | Higher = fewer lines (removes weak edges for minimal look) |
| **Line Thickness** | 1-3 | 1 | Number of dilation passes applied to edges |
| **Feather** | 0-10px | 3 | Box-blur passes on mask edges for natural color blending |
| **Brush Size** | 5-100px | 30 | Radius of the paint/erase brush |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `B` | Switch to Brush |
| `E` | Switch to Eraser |
| `[` / `]` | Decrease / Increase brush size |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Scroll` | Zoom in/out |
| `Space+Drag` | Pan canvas |
| `Middle Click+Drag` | Pan canvas |

## TODO

- [ ] Integrate AI line art generation API (replace client-side Sobel filter)
- [ ] Server-side high-resolution export (2048px / 4096px)
- [ ] Credit system with Stripe payment
- [ ] Anti-abuse: rate limiting, browser token tracking
- [x] ~~Feather/blur slider for mask edges~~
- [ ] Touch/mobile support for brush painting
- [ ] Image persistence (object storage instead of sessionStorage)
- [ ] PWA / offline support
