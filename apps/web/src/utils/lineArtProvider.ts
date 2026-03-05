import { generateLineArt, type LineArtOptions } from './imageProcessing';

// A LineArtProvider takes an original image and options, and returns line art.
// This abstraction allows swapping implementations:
//   - localLineArtProvider: client-side Sobel edge detection (current MVP)
//   - apiLineArtProvider:   server-side AI generation (future)
export type LineArtProvider = (
  original: ImageData,
  opts: LineArtOptions,
) => Promise<ImageData>;

// Client-side line art generation using Sobel edge detection.
// No network call — runs entirely in the browser.
export const localLineArtProvider: LineArtProvider = async (original, opts) => {
  return generateLineArt(original, opts);
};

// TODO: AI-based line art provider (future)
// export const apiLineArtProvider: LineArtProvider = async (original, opts) => {
//   const blob = imageDataToBlob(original);
//   const response = await fetch('/api/lineart', {
//     method: 'POST',
//     body: blob,
//     headers: { 'X-Threshold': String(opts.threshold) },
//   });
//   return blobToImageData(await response.blob());
// };
