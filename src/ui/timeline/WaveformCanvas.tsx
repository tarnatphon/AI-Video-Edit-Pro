import { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks: readonly number[];
  /** Total asset duration (seconds) the peaks span. */
  assetDuration: number;
  /** Source window shown by the clip (seconds). */
  sourceStart: number;
  sourceEnd: number;
  width: number;
  height: number;
  color: string;
}

const MAX_CANVAS_WIDTH = 4096;

/** Draws the portion of an asset's waveform that a clip covers. */
export function WaveformCanvas({ peaks, assetDuration, sourceStart, sourceEnd, width, height, color }: WaveformCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0 || height <= 0 || peaks.length === 0 || assetDuration <= 0) return;
    const w = Math.max(1, Math.min(Math.round(width), MAX_CANVAS_WIDTH));
    const h = Math.max(1, Math.round(height));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    const mid = h / 2;
    const span = Math.max(1e-6, sourceEnd - sourceStart);
    const peaksPerSecond = peaks.length / assetDuration;

    for (let x = 0; x < w; x++) {
      const t0 = sourceStart + (x / w) * span;
      const t1 = sourceStart + ((x + 1) / w) * span;
      const i0 = Math.max(0, Math.floor(t0 * peaksPerSecond));
      const i1 = Math.min(peaks.length, Math.max(i0 + 1, Math.ceil(t1 * peaksPerSecond)));
      let peak = 0;
      for (let i = i0; i < i1; i++) peak = Math.max(peak, peaks[i] ?? 0);
      const amp = Math.max(0.5, peak * mid * 0.95);
      ctx.fillRect(x, mid - amp, 1, amp * 2);
    }
  }, [peaks, assetDuration, sourceStart, sourceEnd, width, height, color]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
