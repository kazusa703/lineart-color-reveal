'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  compositeWithRevealMask,
  exportCompositePNG,
  LINE_ART_STYLE_LABELS,
  type LineArtOptions,
  type LineArtStyle,
} from '@/utils/imageProcessing';
import { getLineArtProvider, isReplicateProvider } from '@/utils/lineArtProvider';
import { MaskHistory } from '@/utils/maskHistory';

type Tool = 'brush' | 'eraser';

export default function EditorPage() {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);

  const originalDataRef = useRef<ImageData | null>(null);
  const lineArtDataRef = useRef<ImageData | null>(null);
  const historyRef = useRef(new MaskHistory());

  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const [lineStyle, setLineStyle] = useState<LineArtStyle>('rough');
  const [lineThreshold, setLineThreshold] = useState(40);
  const [lineThickness, setLineThickness] = useState(1);
  const [feather, setFeather] = useState(3);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const isAiMode = isReplicateProvider();

  const isPaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isSpaceDownRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);

  // Debounce + latest-only for line art regeneration
  const regenerateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenerateIdRef = useRef(0);

  const renderComposite = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!displayCanvas || !maskCanvas || !originalDataRef.current || !lineArtDataRef.current)
      return;

    const maskCtx = maskCanvas.getContext('2d')!;
    const revealMask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const composite = compositeWithRevealMask(
      lineArtDataRef.current,
      originalDataRef.current,
      revealMask,
      feather,
    );

    const displayCtx = displayCanvas.getContext('2d')!;
    displayCtx.putImageData(composite, 0, 0);
  }, [feather]);

  // Regenerate line art via provider with debounce + request ID
  const scheduleRegenerate = useCallback(
    (threshold: number, thickness: number, style: LineArtStyle) => {
      if (regenerateTimerRef.current) clearTimeout(regenerateTimerRef.current);

      regenerateTimerRef.current = setTimeout(async () => {
        if (!originalDataRef.current) return;
        const requestId = ++regenerateIdRef.current;
        const opts: LineArtOptions = { threshold, thickness, style };
        try {
          setGenerationError(null);
          const result = await getLineArtProvider()(originalDataRef.current, opts);
          // Only apply if this is still the latest request
          if (requestId !== regenerateIdRef.current) return;
          lineArtDataRef.current = result;
          renderComposite();
        } catch (err) {
          if (requestId !== regenerateIdRef.current) return;
          const msg = err instanceof Error ? err.message : 'Line art generation failed';
          setGenerationError(msg);
          console.error('[lineart]', err);
        }
      }, 150);
    },
    [renderComposite],
  );

  // Load image from sessionStorage
  useEffect(() => {
    const dataUrl = sessionStorage.getItem('uploadedImage');
    if (!dataUrl) {
      window.location.href = '/';
      return;
    }

    const img = new Image();
    img.onerror = () => {
      console.error('[editor] Failed to load image from sessionStorage');
      sessionStorage.removeItem('uploadedImage');
      window.location.href = '/';
    };
    img.onload = async () => {
      const MAX_DIM = 1024;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      setImageSize({ width, height });

      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = width;
      tmpCanvas.height = height;
      const tmpCtx = tmpCanvas.getContext('2d')!;
      tmpCtx.drawImage(img, 0, 0, width, height);
      originalDataRef.current = tmpCtx.getImageData(0, 0, width, height);

      // Generate initial line art (no debounce for first load)
      const opts: LineArtOptions = { threshold: lineThreshold, thickness: lineThickness, style: lineStyle };
      try {
        lineArtDataRef.current = await getLineArtProvider()(originalDataRef.current, opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Line art generation failed';
        setGenerationError(msg);
        console.error('[lineart]', err);
        // Fall back to local provider so the editor is still usable
        lineArtDataRef.current = (await import('@/utils/imageProcessing')).generateLineArt(
          originalDataRef.current,
          opts,
        );
      }

      // Setup canvases
      const displayCanvas = displayCanvasRef.current!;
      displayCanvas.width = width;
      displayCanvas.height = height;

      const cursorCanvas = cursorCanvasRef.current!;
      cursorCanvas.width = width;
      cursorCanvas.height = height;

      // Reveal mask: black(0)=no reveal (start with full line art)
      const maskCanvas = maskCanvasRef.current!;
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.fillStyle = '#000';
      maskCtx.fillRect(0, 0, width, height);

      const initialMask = maskCtx.getImageData(0, 0, width, height);
      historyRef.current.save(initialMask);

      renderComposite();
      setIsLoading(false);
    };
    img.src = dataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render when feather changes
  useEffect(() => {
    if (!isLoading) renderComposite();
  }, [feather, isLoading, renderComposite]);

  // Debounced re-generation when threshold/thickness/style change
  useEffect(() => {
    if (isLoading) return;
    scheduleRegenerate(lineThreshold, lineThickness, lineStyle);
  }, [lineThreshold, lineThickness, lineStyle, isLoading, scheduleRegenerate]);

  const getCanvasPos = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const canvas = displayCanvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
      };
    },
    [zoom],
  );

  // Paint with interpolation between points for smooth strokes.
  // Brush paints white(255)=reveal, eraser paints black(0)=no reveal.
  const paintAt = useCallback(
    (x: number, y: number) => {
      const maskCanvas = maskCanvasRef.current;
      if (!maskCanvas) return;
      const ctx = maskCanvas.getContext('2d')!;
      ctx.fillStyle = tool === 'brush' ? '#fff' : '#000';

      const last = lastPaintPosRef.current;
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = Math.max(1, brushSize / 4);
        const steps = Math.ceil(dist / step);
        for (let i = 0; i <= steps; i++) {
          const t = steps === 0 ? 0 : i / steps;
          const px = last.x + dx * t;
          const py = last.y + dy * t;
          ctx.beginPath();
          ctx.arc(px, py, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      lastPaintPosRef.current = { x, y };
      renderComposite();
    },
    [tool, brushSize, renderComposite],
  );

  const drawCursor = useCallback(
    (x: number, y: number) => {
      const cursorCanvas = cursorCanvasRef.current;
      if (!cursorCanvas) return;
      const ctx = cursorCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = tool === 'brush' ? 'rgba(100,99,255,0.7)' : 'rgba(255,80,80,0.7)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();
    },
    [brushSize, tool, zoom],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1 || isSpaceDownRef.current) {
        isPanningRef.current = true;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      isPaintingRef.current = true;
      lastPaintPosRef.current = null;
      const pos = getCanvasPos(e);
      paintAt(pos.x, pos.y);
    },
    [getCanvasPos, paintAt],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const pos = getCanvasPos(e);
      drawCursor(pos.x, pos.y);

      if (isPanningRef.current) {
        const dx = e.clientX - lastPanPosRef.current.x;
        const dy = e.clientY - lastPanPosRef.current.y;
        setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!isPaintingRef.current) return;
      paintAt(pos.x, pos.y);
    },
    [getCanvasPos, paintAt, drawCursor],
  );

  const onMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;
    lastPaintPosRef.current = null;
    const maskCanvas = maskCanvasRef.current!;
    const maskCtx = maskCanvas.getContext('2d')!;
    const revealMask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    historyRef.current.save(revealMask);
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, []);

  const onMouseLeave = useCallback(() => {
    const cursorCanvas = cursorCanvasRef.current;
    if (cursorCanvas) {
      const ctx = cursorCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    }
    onMouseUp();
  }, [onMouseUp]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.undo();
    if (!prev) return;
    maskCanvasRef.current!.getContext('2d')!.putImageData(prev, 0, 0);
    renderComposite();
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, [renderComposite]);

  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo();
    if (!next) return;
    maskCanvasRef.current!.getContext('2d')!.putImageData(next, 0, 0);
    renderComposite();
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, [renderComposite]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => {
      const next = prev * (e.deltaY < 0 ? 1.1 : 0.9);
      return Math.min(Math.max(next, 0.25), 4);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (e.key === 'b') setTool('brush');
      if (e.key === 'e') setTool('eraser');
      if (e.key === '[') setBrushSize((s) => Math.max(5, s - 5));
      if (e.key === ']') setBrushSize((s) => Math.min(100, s + 5));
      // Arrow keys: pan (or zoom with +/-)
      const PAN_STEP = 40;
      if (e.key === 'ArrowUp') { e.preventDefault(); setPanOffset((p) => ({ ...p, y: p.y + PAN_STEP })); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setPanOffset((p) => ({ ...p, y: p.y - PAN_STEP })); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPanOffset((p) => ({ ...p, x: p.x + PAN_STEP })); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPanOffset((p) => ({ ...p, x: p.x - PAN_STEP })); }
      if (e.key === '+' || e.key === '=') { setZoom((z) => Math.min(4, z * 1.15)); }
      if (e.key === '-') { setZoom((z) => Math.max(0.25, z / 1.15)); }
      if (e.key === ' ') {
        e.preventDefault();
        isSpaceDownRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') isSpaceDownRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleUndo, handleRedo]);

  // Convert ImageData to PNG Blob via offscreen canvas
  const imageDataToBlob = useCallback((data: ImageData): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const c = document.createElement('canvas');
      c.width = data.width;
      c.height = data.height;
      c.getContext('2d')!.putImageData(data, 0, 0);
      c.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode layer'))),
        'image/png',
      );
    });
  }, []);

  const handleExport = useCallback(
    async (targetWidth: number) => {
      if (!originalDataRef.current || !lineArtDataRef.current) return;
      setIsExporting(true);
      setGenerationError(null);

      try {
        if (targetWidth <= 1024) {
          // Client-side export with watermark
          const maskCanvas = maskCanvasRef.current!;
          const revealMask = maskCanvas
            .getContext('2d')!
            .getImageData(0, 0, maskCanvas.width, maskCanvas.height);
          const blob = await exportCompositePNG({
            lineArt: lineArtDataRef.current!,
            original: originalDataRef.current!,
            revealMask,
            feather,
            targetWidth,
            watermarkText: 'LineArt Color Reveal',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `lineart-color-reveal-${targetWidth}px.png`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // Server-side high-res export (beta watermark)
          const maskCanvas = maskCanvasRef.current!;
          const revealMask = maskCanvas
            .getContext('2d')!
            .getImageData(0, 0, maskCanvas.width, maskCanvas.height);

          const [origBlob, laBlob, maskBlob] = await Promise.all([
            imageDataToBlob(originalDataRef.current!),
            imageDataToBlob(lineArtDataRef.current!),
            imageDataToBlob(revealMask),
          ]);

          const form = new FormData();
          form.append('originalPng', origBlob, 'original.png');
          form.append('lineArtPng', laBlob, 'lineart.png');
          form.append('revealMaskPng', maskBlob, 'mask.png');
          form.append('targetWidth', String(targetWidth));
          form.append('feather', String(feather));

          // Attach redeem code if available
          const redeemCode = localStorage.getItem('redeemCode') ?? '';
          if (redeemCode) {
            form.append('redeemCode', redeemCode);
          }

          const res = await fetch('/api/export', { method: 'POST', body: form });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            if (res.status === 429) {
              throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
            if (res.status === 402) {
              throw new Error(
                `Insufficient credits (need ${data.required ?? '?'}). Purchase more on the Pricing page.`,
              );
            }
            if (res.status === 403) {
              throw new Error(data.error || 'Invalid redeem code. Check the Pricing page.');
            }
            throw new Error(data.error || `Export failed: ${res.status}`);
          }

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `lineart-color-reveal-${targetWidth}px.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Export failed';
        setGenerationError(msg);
        console.error('[export]', err);
      } finally {
        setIsExporting(false);
      }
    },
    [feather, imageDataToBlob],
  );

  return (
    <main className="flex h-[calc(100vh-57px)] overflow-hidden relative">
      {/* Loading overlay — canvases stay in DOM so refs are valid */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-zinc-500">Generating line art...</p>
          </div>
        </div>
      )}

      {/* Left: Tools */}
      <aside className="w-60 border-r border-border bg-surface p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
        <h2 className="font-bold text-sm text-zinc-400 uppercase tracking-wider">Tools</h2>

        <div className="flex gap-2">
          <button
            onClick={() => setTool('brush')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tool === 'brush' ? 'bg-accent text-white' : 'bg-zinc-100 hover:bg-zinc-200'
            }`}
          >
            Brush (B)
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tool === 'eraser' ? 'bg-accent text-white' : 'bg-zinc-100 hover:bg-zinc-200'
            }`}
          >
            Eraser (E)
          </button>
        </div>

        <div>
          <label className="text-sm text-zinc-500 block mb-1">Brush Size: {brushSize}px</label>
          <input
            type="range"
            min={5}
            max={100}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>

        <div>
          <label className="text-sm text-zinc-500 block mb-1">
            Zoom: {Math.round(zoom * 100)}%
          </label>
          <input
            type="range"
            min={25}
            max={400}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="w-full accent-accent"
          />
        </div>

        <hr className="border-border" />

        <h2 className="font-bold text-sm text-zinc-400 uppercase tracking-wider">
          Line Art {isAiMode && <span className="text-accent font-normal normal-case">(AI)</span>}
        </h2>

        {isAiMode && (
          <p className="text-xs text-zinc-400">AI mode — threshold/thickness are ignored.</p>
        )}

        {!isAiMode && (
          <div>
            <label className="text-sm text-zinc-500 block mb-1">Style</label>
            <div className="flex gap-1">
              {(Object.keys(LINE_ART_STYLE_LABELS) as LineArtStyle[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setLineStyle(s)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                    lineStyle === s ? 'bg-accent text-white' : 'bg-zinc-100 hover:bg-zinc-200'
                  }`}
                >
                  {LINE_ART_STYLE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={`text-sm block mb-1 ${isAiMode ? 'text-zinc-300' : 'text-zinc-500'}`}>
            Line Threshold: {lineThreshold}
          </label>
          <input
            type="range"
            min={10}
            max={200}
            value={lineThreshold}
            onChange={(e) => setLineThreshold(Number(e.target.value))}
            disabled={isAiMode}
            className="w-full accent-accent disabled:opacity-30"
          />
        </div>

        <div>
          <label className={`text-sm block mb-1 ${isAiMode || lineStyle === 'fine' ? 'text-zinc-300' : 'text-zinc-500'}`}>
            Line Thickness: {lineThickness}
          </label>
          <input
            type="range"
            min={1}
            max={3}
            value={lineThickness}
            onChange={(e) => setLineThickness(Number(e.target.value))}
            disabled={isAiMode || lineStyle === 'fine'}
            className="w-full accent-accent disabled:opacity-30"
          />
        </div>

        <div>
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

        <hr className="border-border" />

        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="flex-1 py-2 px-3 rounded-lg text-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="flex-1 py-2 px-3 rounded-lg text-sm bg-zinc-100 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Redo
          </button>
        </div>

        <p className="text-xs text-zinc-400 mt-auto leading-relaxed">
          B=Brush E=Eraser [/]=Size
          <br />
          Cmd+Z=Undo Cmd+Shift+Z=Redo
          <br />
          Scroll=Zoom +/-=Zoom
          <br />
          Arrows=Pan Space+Drag=Pan
        </p>
      </aside>

      {/* Center: Canvas */}
      <div
        className="flex-1 overflow-hidden bg-zinc-100 flex items-center justify-center relative"
        style={{ cursor: isSpaceDownRef.current ? 'grab' : 'none' }}
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          className="relative"
        >
          <canvas
            ref={displayCanvasRef}
            className="shadow-lg"
            style={{ imageRendering: zoom > 2 ? 'pixelated' : 'auto' }}
          />
          <canvas
            ref={cursorCanvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ imageRendering: zoom > 2 ? 'pixelated' : 'auto' }}
          />
        </div>
        {/* Hidden reveal mask canvas: white(255)=reveal, black(0)=no reveal */}
        <canvas ref={maskCanvasRef} className="hidden" />

        {/* Error banner */}
        {generationError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg shadow max-w-md text-center">
            {generationError}
            <button
              onClick={() => setGenerationError(null)}
              className="ml-2 text-red-400 hover:text-red-600"
            >
              x
            </button>
          </div>
        )}
      </div>

      {/* Right: Export */}
      <aside className="w-56 border-l border-border bg-surface p-4 flex flex-col gap-4 shrink-0">
        <h2 className="font-bold text-sm text-zinc-400 uppercase tracking-wider">Export</h2>

        <div className="space-y-2">
          <button
            onClick={() => handleExport(1024)}
            disabled={isExporting}
            className="w-full py-2 px-4 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : '1024px (Free)'}
          </button>
          <button
            onClick={() => handleExport(2048)}
            disabled={isExporting}
            className="w-full py-2 px-4 rounded-lg bg-zinc-100 text-zinc-600 font-medium text-sm hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : '2048px (1 credit)'}
          </button>
          <button
            onClick={() => handleExport(4096)}
            disabled={isExporting}
            className="w-full py-2 px-4 rounded-lg bg-zinc-100 text-zinc-600 font-medium text-sm hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : '4096px (3 credits)'}
          </button>
        </div>

        <div className="text-xs text-zinc-400 space-y-1">
          <p>1024px: free with watermark.</p>
          <p>2048px: 1 credit, no watermark.</p>
          <p>4096px: 3 credits, no watermark.</p>
          <p className="text-zinc-300">No code? Exports have BETA watermark.</p>
          <p>
            Image: {imageSize.width} x {imageSize.height}px
          </p>
        </div>
      </aside>

    </main>
  );
}
