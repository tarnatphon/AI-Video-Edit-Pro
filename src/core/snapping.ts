/**
 * Magnetic snapping (Final Cut / Premiere style).
 *
 * A candidate frame snaps to the closest "interesting" frame (clip edges, playhead, sequence start)
 * when it is within `threshold` frames. Pure functions; unit-tested.
 */

import { clipEnd } from './timelineOps';
import type { Frames, Project } from './types';

export interface SnapResult {
  frame: Frames;
  snapped: boolean;
  /** The target that was matched, or null. */
  target: Frames | null;
}

/** Sorted, de-duplicated list of snap targets excluding the edges of `excludeClipIds`. */
export function collectSnapTargets(project: Project, excludeClipIds: ReadonlySet<string>, playhead: Frames): Frames[] {
  const targets = new Set<Frames>([0, Math.max(0, Math.round(playhead))]);
  for (const clip of project.clips) {
    if (excludeClipIds.has(clip.id)) continue;
    targets.add(clip.start);
    targets.add(clipEnd(clip));
  }
  return [...targets].sort((a, b) => a - b);
}

/**
 * Snap a single frame to the nearest target within `threshold`. When two targets are equally
 * close the smaller frame wins (deterministic).
 */
export function snapFrame(candidate: Frames, targets: readonly Frames[], threshold: Frames): SnapResult {
  let best: Frames | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const distance = Math.abs(target - candidate);
    if (distance <= threshold && (distance < bestDistance || (distance === bestDistance && best !== null && target < best))) {
      best = target;
      bestDistance = distance;
    }
  }
  if (best === null) return { frame: candidate, snapped: false, target: null };
  return { frame: best, snapped: true, target: best };
}

/**
 * Snap a moving clip: both its start and end edge are candidates, whichever needs the smaller
 * correction wins. Returns the (possibly) adjusted start frame.
 */
export function snapClipMove(
  start: Frames,
  duration: Frames,
  targets: readonly Frames[],
  threshold: Frames,
): SnapResult {
  const startSnap = snapFrame(start, targets, threshold);
  const endSnap = snapFrame(start + duration, targets, threshold);

  const startDelta = startSnap.snapped ? Math.abs(startSnap.frame - start) : Number.POSITIVE_INFINITY;
  const endDelta = endSnap.snapped ? Math.abs(endSnap.frame - (start + duration)) : Number.POSITIVE_INFINITY;

  if (!startSnap.snapped && !endSnap.snapped) return { frame: start, snapped: false, target: null };
  if (startDelta <= endDelta) return startSnap;
  return { frame: endSnap.frame - duration, snapped: true, target: endSnap.target };
}

/** Convert a pixel tolerance into frames for the current zoom level (never below one frame). */
export function snapThresholdFrames(pixelTolerance: number, pxPerFrame: number): Frames {
  if (pxPerFrame <= 0) return 1;
  return Math.max(1, Math.round(pixelTolerance / pxPerFrame));
}
