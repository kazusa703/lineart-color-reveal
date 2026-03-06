import { generateLineArt, type LineArtOptions } from './imageProcessing';

// A LineArtProvider takes an original image and options, and returns line art.
// This abstraction allows swapping implementations:
//   - localLineArtProvider: client-side Sobel edge detection (current MVP)
//   - replicateLineArtProvider: server-side AI generation via /api/lineart
export type LineArtProvider = (
  original: ImageData,
  opts: LineArtOptions,
) => Promise<ImageData>;

// Client-side line art generation using Sobel edge detection.
// No network call — runs entirely in the browser.
export const localLineArtProvider: LineArtProvider = async (original, opts) => {
  return generateLineArt(original, opts);
};

// Server-side AI line art generation via /api/lineart.
// Sends image as PNG blob, receives base64 PNG back.
// Note: threshold/thickness options are ignored — the AI model controls line style.
// Client-side timeout for the Replicate provider fetch (90s).
// The server has its own timeout (default 60s), but this ensures
// the client doesn't hang indefinitely if the connection stalls.
const CLIENT_FETCH_TIMEOUT_MS = 90_000;

export const replicateLineArtProvider: LineArtProvider = async (original) => {
  // Convert ImageData to PNG blob
  const canvas = document.createElement('canvas');
  canvas.width = original.width;
  canvas.height = original.height;
  canvas.getContext('2d')!.putImageData(original, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      'image/png',
    );
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('/api/lineart', {
      method: 'POST',
      body: blob,
      headers: { 'Content-Type': 'image/png' },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Line art generation timed out. Please try again.');
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Server error: ${response.status}`);
  }

  const data = await response.json();
  const base64 = data.lineArtPngBase64;
  if (!base64) {
    throw new Error('No image data in server response');
  }

  // Decode base64 PNG to ImageData
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to decode line art response'));
    img.src = `data:image/png;base64,${base64}`;
  });

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = img.width;
  resultCanvas.height = img.height;
  const ctx = resultCanvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
};

// Select provider based on env var.
// NEXT_PUBLIC_LINEART_PROVIDER is exposed to the client via Next.js.
export function getLineArtProvider(): LineArtProvider {
  const provider = process.env.NEXT_PUBLIC_LINEART_PROVIDER || 'local';
  if (provider === 'replicate') return replicateLineArtProvider;
  return localLineArtProvider;
}

export function isReplicateProvider(): boolean {
  return (process.env.NEXT_PUBLIC_LINEART_PROVIDER || 'local') === 'replicate';
}
