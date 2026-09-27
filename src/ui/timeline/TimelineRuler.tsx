import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { formatRulerLabel } from '../../core/time';
import { RULER_H } from './timelineContext';

interface RulerProps {
  /** Visible lane range in px (content coordinates, excluding the header column). */
  scrollLeft: number;
  viewportWidth: number;
  pxPerSecond: number;
  fps: number;
  playheadFrame: number;
  durationFrames: number;
  onScrub(frame: number): void;
}

const MAJOR_STEPS_SECONDS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

function pickMajorStep(pxPerSecond: number): number {
  for (const step of MAJOR_STEPS_SECONDS) {
    if (step * pxPerSecond >= 84) return step;
  }
  return MAJOR_STEPS_SECONDS[MAJOR_STEPS_SECONDS.length - 1]!;
}

export function TimelineRuler(props: RulerProps) {
  const { scrollLeft, viewportWidth, pxPerSecond, fps, playheadFrame, durationFrames, onScrub } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingPointer = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewportWidth <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.ceil(viewportWidth);
    const h = RULER_H;
    if (canvas.width !== w * dpr) canvas.width = w * dpr;
    if (canvas.height !== h * dpr) canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, w, h);

    // Shade the area after the sequence end.
    const durationX = (durationFrames / fps) * pxPerSecond - scrollLeft;
    if (durationX < w) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(Math.max(0, durationX), 0, w - Math.max(0, durationX), h);
    }

    const major = pickMajorStep(pxPerSecond);
    const pxPerFrame = pxPerSecond / fps;
    const minorCount = pxPerFrame >= 6 && major <= 1 ? Math.round(major * fps) : major >= 1 ? 5 : 2;
    const minor = major / minorCount;

    const startSec = scrollLeft / pxPerSecond;
    const endSec = (scrollLeft + w) / pxPerSecond;
    const firstMajor = Math.floor(startSec / major) * major;

    ctx.strokeStyle = '#3f3f46';
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let t = firstMajor; t <= endSec + major; t += major) {
      const x = Math.round(t * pxPerSecond - scrollLeft) + 0.5;
      if (t >= 0) {
        ctx.moveTo(x, h - 12);
        ctx.lineTo(x, h);
      }
      for (let i = 1; i < minorCount; i++) {
        const mt = t + i * minor;
        if (mt < 0) continue;
        const mx = Math.round(mt * pxPerSecond - scrollLeft) + 0.5;
        if (mx < -1 || mx > w + 1) continue;
        ctx.moveTo(mx, h - (i % 5 === 0 && minorCount > 5 ? 8 : 5));
        ctx.lineTo(mx, h);
      }
    }
    ctx.stroke();

    for (let t = firstMajor; t <= endSec + major; t += major) {
      if (t < 0) continue;
      const x = Math.round(t * pxPerSecond - scrollLeft);
      ctx.fillText(formatRulerLabel(t), x + 4, 3);
    }

    ctx.strokeStyle = '#27272a';
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
    ctx.stroke();

    // Playhead marker
    const px = (playheadFrame / fps) * pxPerSecond - scrollLeft;
    if (px >= -8 && px <= w + 8) {
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(px - 6, 0);
      ctx.lineTo(px + 6, 0);
      ctx.lineTo(px + 6, 8);
      ctx.lineTo(px, h);
      ctx.lineTo(px - 6, 8);
      ctx.closePath();
      ctx.fill();
    }
  }, [scrollLeft, viewportWidth, pxPerSecond, fps, playheadFrame, durationFrames]);

  const frameFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + scrollLeft;
    return Math.max(0, Math.round((x / pxPerSecond) * fps));
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 h-full cursor-ew-resize"
      style={{ left: scrollLeft, width: viewportWidth, height: RULER_H, touchAction: 'none' }}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.stopPropagation();
        draggingPointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        onScrub(frameFromEvent(event));
      }}
      onPointerMove={(event) => {
        if (draggingPointer.current !== event.pointerId) return;
        onScrub(frameFromEvent(event));
      }}
      onPointerUp={(event) => {
        if (draggingPointer.current !== event.pointerId) return;
        draggingPointer.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        draggingPointer.current = null;
      }}
    />
  );
}
