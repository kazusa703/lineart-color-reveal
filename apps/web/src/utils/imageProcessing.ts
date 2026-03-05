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
//   output = lineArt * (1 - mask/255) + original * (mask/255)
//
// This mask format is intentionally simple so that a future AI-based line art
// API can accept/return the same mask without conversion.
// =============================================================================

// --- Line art generation options ---
export interface LineArtOptions {
  threshold: number; // 0-255, higher = fewer lines (default: 40)
  thickness: number; // 1-3, dilation passes (default: 1)
}

const DEFAULT_LINE_ART_OPTIONS: LineArtOptions = { threshold: 40, thickness: 1 };

// --- Export options ---
export interface ExportOptions {
  targetWidth: number;
  watermark: boolean;
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
  // Copy border pixels
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
      // Check 4-connected neighbors
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

  // Step 1: Grayscale
  const grayRaw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grayRaw[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Step 2: Noise reduction (box blur)
  const gray = boxBlur(grayRaw, w, h);

  // Step 3: Sobel edge detection
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

  // Step 4: Normalize + binary threshold
  const thresholdNorm = opts.threshold / 255;
  let lineMask: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const norm = maxEdge > 0 ? edges[i] / maxEdge : 0;
    lineMask[i] = norm > thresholdNorm ? 1 : 0;
  }

  // Step 5: Dilation (line thickness)
  for (let d = 1; d < opts.thickness; d++) {
    lineMask = dilate(lineMask, w, h);
  }

  // Step 6: Output — white background, black lines
  for (let i = 0; i < w * h; i++) {
    const v = lineMask[i] ? 0 : 255;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }

  return output;
}

// Feathers a reveal mask by applying box blur.
// Reveal mask convention: white(255)=reveal, black(0)=no reveal.
// The UI `radius` (0..10) controls blur strength. Internally capped to
// max 2 box-blur passes for performance at high resolutions (2048+).
// Higher radius values increase the per-pass spread via scaling instead.
export function featherRevealMask(revealMask: ImageData, radius: number): ImageData {
  if (radius <= 0) return revealMask;
  const { width: w, height: h } = revealMask;

  // Cap passes at 2 for performance; scale input to compensate
  const passes = Math.min(2, Math.max(1, Math.round(radius / 5)));

  let buf: Float32Array = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) buf[i] = revealMask.data[i * 4];

  // Apply multiple blur rounds per pass to approximate larger radius
  const roundsPerPass = Math.max(1, Math.round(radius / 2));
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < roundsPerPass; r++) {
      buf = boxBlur(buf, w, h);
    }
  }

  const result = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(Math.min(255, Math.max(0, buf[i])));
    result.data[i * 4] = v;
    result.data[i * 4 + 1] = v;
    result.data[i * 4 + 2] = v;
    result.data[i * 4 + 3] = 255;
  }
  return result;
}

// Composites line art with original colors based on the reveal mask.
// revealMask: white(255)=show original color, black(0)=show line art.
// Optionally feathers the mask before blending.
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
    const alpha = m[i * 4] / 255; // 255=fully reveal original
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
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const fontSize = Math.max(14, Math.round(w / 30));
  const padding = Math.round(fontSize * 0.8);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('LineArt Color Reveal', w - padding, h - padding);
  ctx.restore();
}

// Exports a composite image as a PNG blob.
//
// Currently renders at the working resolution (up to 1024px) by scaling the
// display canvas. In a future version this function will accept the raw
// layers (original, lineArt, revealMask) and re-composite at the requested
// targetWidth — enabling true high-resolution export for 2048/4096.
export function exportComposite(
  displayCanvas: HTMLCanvasElement,
  opts: ExportOptions,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { targetWidth, watermark } = opts;
    const expCanvas = document.createElement('canvas');
    const scale = targetWidth / displayCanvas.width;
    expCanvas.width = targetWidth;
    expCanvas.height = Math.round(displayCanvas.height * scale);
    const ctx = expCanvas.getContext('2d')!;
    ctx.drawImage(displayCanvas, 0, 0, expCanvas.width, expCanvas.height);

    if (watermark) {
      drawWatermark(ctx, expCanvas.width, expCanvas.height);
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
