'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  generateLineArt,
  compositeWithRevealMask,
  featherRevealMask,
  type LineArtOptions,
} from '@/utils/imageProcessing';

export default function DebugPage() {
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const lineArtCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);

  const originalDataRef = useRef<ImageData | null>(null);

  const [threshold, setThreshold] = useState(40);
  const [thickness, setThickness] = useState(1);
  const [feather, setFeather] = useState(3);
  const [hasImage, setHasImage] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const render = useCallback(() => {
    const orig = originalDataRef.current;
    if (!orig) return;

    const { width: w, height: h } = orig;
    const opts: LineArtOptions = { threshold, thickness };
    const lineArt = generateLineArt(orig, opts);

    // Draw original
    const origCtx = originalCanvasRef.current!.getContext('2d')!;
    origCtx.putImageData(orig, 0, 0);

    // Draw line art
    const laCtx = lineArtCanvasRef.current!.getContext('2d')!;
    laCtx.putImageData(lineArt, 0, 0);

    // Create a demo reveal mask (radial gradient: white=reveal center, black=no reveal edges)
    const maskCanvas = maskCanvasRef.current!;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.fillStyle = '#000';
    maskCtx.fillRect(0, 0, w, h);
    const gradient = maskCtx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 3);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#000');
    maskCtx.fillStyle = gradient;
    maskCtx.fillRect(0, 0, w, h);

    const rawMask = maskCtx.getImageData(0, 0, w, h);
    const featheredMask = feather > 0 ? featherRevealMask(rawMask, feather) : rawMask;

    // Re-draw feathered mask for visualization
    maskCtx.putImageData(featheredMask, 0, 0);

    // Composite
    const composite = compositeWithRevealMask(lineArt, orig, rawMask, feather);
    const compCtx = compositeCanvasRef.current!.getContext('2d')!;
    compCtx.putImageData(composite, 0, 0);
  }, [threshold, thickness, feather]);

  const loadImage = useCallback(
    (file: File) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 512;
        let { width: w, height: h } = img;
        if (w > MAX_DIM || h > MAX_DIM) {
          const scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        setSize({ w, h });

        [originalCanvasRef, lineArtCanvasRef, maskCanvasRef, compositeCanvasRef].forEach((ref) => {
          if (ref.current) {
            ref.current.width = w;
            ref.current.height = h;
          }
        });

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = w;
        tmpCanvas.height = h;
        const ctx = tmpCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        originalDataRef.current = ctx.getImageData(0, 0, w, h);
        setHasImage(true);
        render();
      };
      img.src = URL.createObjectURL(file);
    },
    [render],
  );

  // Also try sessionStorage image
  useEffect(() => {
    const dataUrl = sessionStorage.getItem('uploadedImage');
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 512;
      let { width: w, height: h } = img;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      setSize({ w, h });
      [originalCanvasRef, lineArtCanvasRef, maskCanvasRef, compositeCanvasRef].forEach((ref) => {
        if (ref.current) {
          ref.current.width = w;
          ref.current.height = h;
        }
      });
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = w;
      tmpCanvas.height = h;
      const ctx = tmpCanvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      originalDataRef.current = ctx.getImageData(0, 0, w, h);
      setHasImage(true);
    };
    img.src = dataUrl;
  }, []);

  // Re-render when params or image change
  useEffect(() => {
    if (hasImage) render();
  }, [hasImage, render]);

  return (
    <main className="min-h-[calc(100vh-57px)] p-6">
      <h1 className="text-2xl font-bold mb-4">Debug: Image Processing Pipeline</h1>

      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="text-sm text-zinc-500 block mb-1">Upload test image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadImage(f);
            }}
            className="text-sm"
          />
        </div>

        <div className="w-48">
          <label className="text-sm text-zinc-500 block mb-1">Threshold: {threshold}</label>
          <input
            type="range"
            min={10}
            max={200}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>

        <div className="w-48">
          <label className="text-sm text-zinc-500 block mb-1">Thickness: {thickness}</label>
          <input
            type="range"
            min={1}
            max={3}
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>

        <div className="w-48">
          <label className="text-sm text-zinc-500 block mb-1">Feather: {feather}px</label>
          <input
            type="range"
            min={0}
            max={10}
            value={feather}
            onChange={(e) => setFeather(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>

        {hasImage && (
          <p className="text-xs text-zinc-400">
            {size.w} x {size.h}px
          </p>
        )}
      </div>

      {!hasImage && (
        <p className="text-zinc-400">Upload an image above, or go to / to upload first.</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-500 mb-1">Original</h2>
          <canvas ref={originalCanvasRef} className="border border-border w-full" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-zinc-500 mb-1">Line Art</h2>
          <canvas ref={lineArtCanvasRef} className="border border-border w-full" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-zinc-500 mb-1">Reveal Mask (feathered)</h2>
          <p className="text-xs text-zinc-400 mb-1">white(255)=reveal color / black(0)=line art</p>
          <canvas ref={maskCanvasRef} className="border border-border w-full" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-zinc-500 mb-1">Composite</h2>
          <canvas ref={compositeCanvasRef} className="border border-border w-full" />
        </div>
      </div>
    </main>
  );
}
