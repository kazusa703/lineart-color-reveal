# LineArt Color Reveal

Transform photos into minimal line art, then selectively reveal original colors by painting with a brush.

## Overview

1. **Upload** a photo (JPEG, PNG, WebP)
2. **Line art** is generated automatically (currently client-side edge detection; AI API integration planned)
3. **Paint** with a brush to reveal original colors on the line art base
4. **Export** at 1024px (client-side, watermark) or 2048/4096px (server-side, BETA watermark until credits launch)

## Getting Started

```bash
cd apps/web
cp .env.example .env.local   # optional: configure env vars
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_LINEART_PROVIDER` | `local` | `local` (client-side Sobel) or `replicate` (server-side AI) |
| `REPLICATE_API_TOKEN` | — | Replicate API token (required when provider=replicate) |
| `REPLICATE_LINEART_MODEL` | `jagvar/dexined` | Replicate model for line art (DexiNed) |
| `REPLICATE_LINEART_MODEL_HED` | `cjwbw/hed` | Alternative HED model (set `REPLICATE_LINEART_MODEL` to this value to use) |
| `REPLICATE_POLL_INTERVAL_MS` | `500` | Polling interval for Replicate prediction status |
| `REPLICATE_TIMEOUT_MS` | `60000` | Timeout for Replicate prediction (504 on exceed) |
| `KV_REST_API_URL` | — | Upstash Redis URL for persistent cache (optional) |
| `KV_REST_API_TOKEN` | — | Upstash Redis token (optional) |
| `LINEART_CACHE_TTL_SEC` | `86400` | Cache TTL for line art results (seconds, default 24h) |
| `LINEART_MAX_DIM` | `1536` | Max input dimension for server-side line art (px) |
| `RATE_LIMIT_PER_MINUTE` | `10` | Max API requests per minute per client fingerprint (line art) |
| `EXPORT_RATE_LIMIT_PER_MINUTE` | `20` | Max API requests per minute per client fingerprint (export) |

### Line Art Cache

Two-tier cache: in-memory (per-instance, fast) + Upstash Redis (persistent across deploys, shared). Lookup order: memory → KV → Replicate. Concurrent requests for the same input are deduplicated — only one Replicate prediction runs and all waiters share the result. If KV is not configured or unavailable, the API continues with memory-only cache. Cache key: `lineart:{model}:{maxDim}:{sha256 of input bytes}`. Response `provider` field distinguishes `cache-mem`, `cache-kv`, or `replicate`.

## Project Structure

```
apps/web/              # Next.js (App Router) + TypeScript + Tailwind CSS
  src/
    app/
      page.tsx         # Upload page (/)
      editor/page.tsx  # Canvas editor (/editor)
      pricing/page.tsx # Pricing page (/pricing)
      debug/page.tsx   # Debug page (/debug) - pipeline visualization
      api/
        lineart/route.ts  # POST /api/lineart - AI line art generation
        export/route.ts   # POST /api/export  - high-res export (2048/4096)
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

- [x] ~~Integrate AI line art generation API (Replicate: DexiNed / HED)~~
- [x] ~~Server-side high-resolution export (2048px / 4096px via sharp, will require credits)~~
- [ ] Credit system with Stripe payment
- [x] ~~Anti-abuse: rate limiting (IP+UA fingerprint, in-memory)~~
- [x] ~~Feather/blur slider for mask edges~~
- [ ] Touch/mobile support for brush painting
- [ ] Image persistence (object storage instead of sessionStorage)
- [ ] PWA / offline support
