import { ChevronFirst, ChevronLast, Pause, Play, StepBack, StepForward } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { selectDuration, useEditorStore } from '../../core/store';
import { formatTimecode } from '../../core/time';
import { getEngine } from '../../engine/playback';
import { IconButton } from '../shared/controls';

/** Backing store is capped so 4K projects preview smoothly on tablets. */
const MAX_PREVIEW_PIXELS = 1920 * 1080;

export function PreviewPlayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useEditorStore((s) => s.project.width);
  const height = useEditorStore((s) => s.project.height);
  const fps = useEditorStore((s) => s.project.fps);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const duration = useEditorStore(selectDuration);
  const isEmpty = useEditorStore((s) => s.project.clips.length === 0);

  // Attach the canvas to the engine (idempotent → safe with StrictMode double effects).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = getEngine();
    engine.attachCanvas(canvas);
    return () => engine.detachCanvas(canvas);
  }, []);

  // Fit the canvas to the container while preserving the project aspect ratio.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = (): void => {
      const rect = container.getBoundingClientRect();
      const availW = Math.max(1, rect.width - 16);
      const availH = Math.max(1, rect.height - 16);
      const scale = Math.min(availW / width, availH / height);
      const cssW = Math.max(1, Math.floor(width * scale));
      const cssH = Math.max(1, Math.floor(height * scale));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let backingW = Math.round(cssW * dpr);
      let backingH = Math.round(cssH * dpr);
      const pixels = backingW * backingH;
      if (pixels > MAX_PREVIEW_PIXELS) {
        const shrink = Math.sqrt(MAX_PREVIEW_PIXELS / pixels);
        backingW = Math.round(backingW * shrink);
        backingH = Math.round(backingH * shrink);
      }
      backingW = Math.min(backingW, width);
      backingH = Math.min(backingH, height);
      if (canvas.width !== backingW) canvas.width = backingW;
      if (canvas.height !== backingH) canvas.height = backingH;
      getEngine().markDirty();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [width, height]);

  const engine = getEngine();

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} className="rounded-sm shadow-2xl shadow-black" />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="max-w-xs text-sm text-neutral-400">
              Import media, then tap <span className="text-neutral-200">+</span> (or drag it) to place it on the timeline.
            </p>
          </div>
        )}
      </div>

      <div className="flex h-14 shrink-0 items-center gap-1 border-t border-line bg-panel px-2">
        <span className="hidden min-w-28 font-mono text-sm tabular-nums text-neutral-200 sm:inline">
          {formatTimecode(playhead, fps)}
        </span>
        <div className="flex flex-1 items-center justify-center gap-1">
          <IconButton
            label="Go to start (Home)"
            onClick={() => {
              engine.pause();
              engine.seek(0);
            }}
          >
            <ChevronFirst size={20} />
          </IconButton>
          <IconButton label="Previous frame (←)" onClick={() => engine.stepFrames(-1)}>
            <StepBack size={20} />
          </IconButton>
          <IconButton
            label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            variant="accent"
            className="h-12 min-w-12 rounded-full"
            onClick={() => engine.toggle()}
            disabled={duration === 0}
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} className="translate-x-px" />}
          </IconButton>
          <IconButton label="Next frame (→)" onClick={() => engine.stepFrames(1)}>
            <StepForward size={20} />
          </IconButton>
          <IconButton
            label="Go to end (End)"
            onClick={() => {
              engine.pause();
              engine.seek(duration);
            }}
          >
            <ChevronLast size={20} />
          </IconButton>
        </div>
        <span className="min-w-28 text-right font-mono text-xs tabular-nums text-neutral-500">
          <span className="sm:hidden text-neutral-200">{formatTimecode(playhead, fps)} · </span>
          {formatTimecode(duration, fps)}
        </span>
      </div>
    </div>
  );
}
