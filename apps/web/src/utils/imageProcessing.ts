// =============================================================================
// Reveal Mask Specification
// =============================================================================
// The "reveal mask" is a single-channel image (stored as RGBA ImageData where
// R=G=B hold the mask value, A=255).
//
//   - white (255) = fully reveal original color
//   - black (0)   = no reveal (show line art base)
//   - intermediate values = proportional blend
//
// The mask is painted by the user via brush (white) / eraser (black) on a
// hidden canvas. It is then optionally feathered (blurred) before compositing.
//
// Compositing formula per pixel:
//   output = lineArt * (1 - revealMask/255) + original * (revealMask/255)
//
// This mask format is intentionally simple so that a future AI-based line art
// API can accept/return the same mask without conversion.
// =============================================================================

// --- Line art generation options ---
export interface LineArtOptions {
  threshold: number; // 0-255, higher = fewer lines (default: 40)
  thickness: number; // 1-3, dilation passes (default: 1)
}

export const DEFAULT_LINE_ART_OPTIONS: LineArtOptions = { threshold: 40, thickness: 1 };

// --- Export options ---
export interface ExportCompositeOptions {
  lineArt: ImageData;
  original: ImageData;
  revealMask: ImageData;
  feather: number;
  targetWidth: number;
  watermarkText?: string;
}

// 3x3 box blur on a single-channel Float32Array
function boxBlur(src: Float32Array, w: number, h: number): Float32Array {
  const dst = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += src[(y + dy) * w + (x + dx)];
        }
      }
      dst[y * w + x] = sum / 9;
    }
  }
  for (let x = 0; x < w; x++) {
    dst[x] = src[x];
    dst[(h - 1) * w + x] = src[(h - 1) * w + x];
  }
  for (let y = 0; y < h; y++) {
    dst[y * w] = src[y * w];
    dst[y * w + (w - 1)] = src[y * w + (w - 1)];
  }
  return dst;
}

// Binary dilation on a boolean mask (true = line pixel)
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        dst[y * w + x] = 1;
        continue;
      }
      let found = false;
      if (y > 0 && mask[(y - 1) * w + x]) found = true;
      if (y < h - 1 && mask[(y + 1) * w + x]) found = true;
      if (x > 0 && mask[y * w + (x - 1)]) found = true;
      if (x < w - 1 && mask[y * w + (x + 1)]) found = true;
      dst[y * w + x] = found ? 1 : 0;
    }
  }
  return dst;
}

// Converts an image to a minimal line-art representation.
// Pipeline: grayscale -> blur -> Sobel -> threshold -> dilate -> invert
export function generateLineArt(
  imageData: ImageData,
  opts: LineArtOptions = DEFAULT_LINE_ART_OPTIONS,
): ImageData {
  const { width: w, height: h, data } = imageData;
  const output = new ImageData(w, h);
  const out = output.data;

  const grayRaw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grayRaw[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const gray = boxBlur(grayRaw, w, h);

  const edges = new Float32Array(w * h);
  let maxEdge = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)];
      const tc = gray[(y - 1) * w + x];
      const tr = gray[(y - 1) * w + (x + 1)];
      const ml = gray[y * w + (x - 1)];
      const mr = gray[y * w + (x + 1)];
      const bl = gray[(y + 1) * w + (x - 1)];
      const bc = gray[(y + 1) * w + x];
      const br = gray[(y + 1) * w + (x + 1)];
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      edges[y * w + x] = mag;
      if (mag > maxEdge) maxEdge = mag;
    }
  }

  const thresholdNorm = opts.threshold / 255;
  let lineMask: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const norm = maxEdge > 0 ? edges[i] / maxEdge : 0;
    lineMask[i] = norm > thresholdNorm ? 1 : 0;
  }

  for (let d = 1; d < opts.thickness; d++) {
    lineMask = dilate(lineMask, w, h);
  }

  for (let i = 0; i < w * h; i++) {
    const v = lineMask[i] ? 0 : 255;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }

  return output;
}

// Feathers (softens edges of) a reveal mask by applying box blur.
//
// Reveal mask convention:
//   white(255) = reveal original color
//   black(0)   = no reveal (show line art)
//
// Performance: box blur passes are capped at 2 regardless of radius.
// The UI radius (0..10) maps to 1 or 2 passes. To preserve perceived
// feather strength at low pass counts, the blurred result is blended
// with the original mask using a strength factor derived from radius.
export function featherRevealMask(revealMask: ImageData, radius: number): ImageData {
  if (radius <= 0) return revealMask;
  const { width: w, height: h } = revealMask;
  const n = w * h;

  // Max 2 blur passes for performance (safe at 2048+)
  const passes = radius < 6 ? 1 : 2;

  // Blur strength: how much of the blurred result to use (0..1)
  // radius 1 → 0.3, radius 5 → 0.7, radius 10 → 1.0
  const strength = Math.min(1, radius / 10);

  const orig = new Float32Array(n);
  for (let i = 0; i < n; i++) orig[i] = revealMask.data[i * 4];

  let blurred: Float32Array = orig;
  for (let p = 0; p < passes; p++) {
    blurred = boxBlur(blurred, w, h);
  }

  // Blend: mix(original, blurred, strength)
  const result = new ImageData(w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.round(orig[i] * (1 - strength) + blurred[i] * strength);
    result.data[i * 4] = v;
    result.data[i * 4 + 1] = v;
    result.data[i * 4 + 2] = v;
    result.data[i * 4 + 3] = 255;
  }
  return result;
}

// Composites line art with original colors based on the reveal mask.
//
// revealMask: white(255)=show original color, black(0)=show line art.
// feather: UI radius value (0..10) passed to featherRevealMask.
export function compositeWithRevealMask(
  lineArt: ImageData,
  original: ImageData,
  revealMask: ImageData,
  feather: number = 0,
): ImageData {
  const { width, height } = lineArt;
  const feathered = feather > 0 ? featherRevealMask(revealMask, feather) : revealMask;
  const output = new ImageData(width, height);
  const out = output.data;
  const la = lineArt.data;
  const orig = original.data;
  const m = feathered.data;

  for (let i = 0; i < width * height; i++) {
    const alpha = m[i * 4] / 255; // 255 = fully reveal original
    const idx = i * 4;
    out[idx] = Math.round(la[idx] * (1 - alpha) + orig[idx] * alpha);
    out[idx + 1] = Math.round(la[idx + 1] * (1 - alpha) + orig[idx + 1] * alpha);
    out[idx + 2] = Math.round(la[idx + 2] * (1 - alpha) + orig[idx + 2] * alpha);
    out[idx + 3] = 255;
  }

  return output;
}

// Loads an image file into an ImageData object at the given max dimension.
export function loadImageFromFile(
  file: File,
  maxDim?: number,
): Promise<{ imageData: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (maxDim && (width > maxDim || height > maxDim)) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      resolve({ imageData, width, height });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// Draws a watermark on the bottom-right of a canvas context.
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const fontSize = Math.max(14, Math.round(w / 30));
  const padding = Math.round(fontSize * 0.8);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, w - padding, h - padding);
  ctx.restore();
}

// Composites layers and exports as a PNG blob.
//
// Takes the raw layers (lineArt, original, revealMask) and re-composites
// at the requested targetWidth. This design allows future high-resolution
// export (2048/4096) by passing full-res layers instead of scaling a
// pre-rendered canvas.
//
// Current MVP: all layers are at working resolution (<=1024px), so the
// composite is scaled up via canvas drawImage. When high-res layers become
// available, this function will composite at native resolution.
export function exportCompositePNG(opts: ExportCompositeOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { lineArt, original, revealMask, feather, targetWidth, watermarkText } = opts;
    const { width: srcW, height: srcH } = lineArt;

    // Composite at source resolution
    const composite = compositeWithRevealMask(lineArt, original, revealMask, feather);

    // Render to a temp canvas at source size
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    srcCanvas.getContext('2d')!.putImageData(composite, 0, 0);

    // Scale to target
    const scale = targetWidth / srcW;
    const expCanvas = document.createElement('canvas');
    expCanvas.width = targetWidth;
    expCanvas.height = Math.round(srcH * scale);
    const ctx = expCanvas.getContext('2d')!;
    ctx.drawImage(srcCanvas, 0, 0, expCanvas.width, expCanvas.height);

    if (watermarkText) {
      drawWatermark(ctx, expCanvas.width, expCanvas.height, watermarkText);
    }

    expCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to export'));
      },
      'image/png',
    );
  });
}
