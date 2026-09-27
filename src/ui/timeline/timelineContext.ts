import { createContext, useContext } from 'react';
import type { TrackKind } from '../../core/types';

export const HEADER_W = 112;
export const RULER_H = 28;
export const TRACK_HEIGHT: Record<TrackKind, number> = { video: 64, audio: 52 };
/** Pixel tolerance for magnetic snapping. */
export const SNAP_PX = 8;
/** Movement (px) before a pointer-down turns into a drag instead of a tap/click. */
export const DRAG_THRESHOLD_PX = 4;

export interface TimelineContextValue {
  pxPerFrame: number;
  fps: number;
  /** Track id whose lane contains `clientY`, or null. */
  trackAt(clientY: number): string | null;
  /** Show/hide the magnetic snap guide (frame or null). */
  setSnapGuide(frame: number | null): void;
  isCoarsePointer: boolean;
}

export const TimelineContext = createContext<TimelineContextValue | null>(null);

export function useTimelineContext(): TimelineContextValue {
  const value = useContext(TimelineContext);
  if (!value) throw new Error('useTimelineContext must be used inside <Timeline>');
  return value;
}
