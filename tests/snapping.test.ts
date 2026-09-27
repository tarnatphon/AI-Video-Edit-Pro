import { describe, expect, it } from 'vitest';
import { collectSnapTargets, snapClipMove, snapFrame, snapThresholdFrames } from '../src/core/snapping';
import { makeClip, makeProject } from './helpers';

describe('snapFrame', () => {
  it('snaps to the nearest target within the threshold', () => {
    expect(snapFrame(103, [0, 100, 200], 5)).toEqual({ frame: 100, snapped: true, target: 100 });
    expect(snapFrame(197, [0, 100, 200], 5)).toEqual({ frame: 200, snapped: true, target: 200 });
  });

  it('does not snap outside the threshold', () => {
    expect(snapFrame(150, [0, 100, 200], 5)).toEqual({ frame: 150, snapped: false, target: null });
  });

  it('prefers the smaller frame on ties', () => {
    expect(snapFrame(150, [100, 200], 50).frame).toBe(100);
  });
});

describe('snapClipMove', () => {
  it('snaps whichever edge is closer to a target', () => {
    // clip [97, 147): start is 3 away from 100, end is 3 away from 150 → tie → start wins (<=)
    expect(snapClipMove(97, 50, [100, 150], 5).frame).toBe(100);
    // clip [90, 140): end 140 is 2 away from 142, start 90 is 10 away from 100 → end wins → start = 92
    expect(snapClipMove(90, 50, [100, 142], 5)).toEqual({ frame: 92, snapped: true, target: 142 });
  });

  it('returns the candidate untouched when nothing is in range', () => {
    expect(snapClipMove(500, 50, [0, 100], 5)).toEqual({ frame: 500, snapped: false, target: null });
  });
});

describe('collectSnapTargets', () => {
  it('collects 0, the playhead and every other clip edge (sorted, unique)', () => {
    const project = makeProject([
      makeClip({ id: 'a', start: 10, duration: 20 }),
      makeClip({ id: 'b', start: 30, duration: 20 }),
      makeClip({ id: 'me', start: 100, duration: 5 }),
    ]);
    expect(collectSnapTargets(project, new Set(['me']), 77)).toEqual([0, 10, 30, 50, 77]);
  });
});

describe('snapThresholdFrames', () => {
  it('converts pixels to frames and never drops below one frame', () => {
    expect(snapThresholdFrames(8, 2)).toBe(4);
    expect(snapThresholdFrames(8, 20)).toBe(1);
    expect(snapThresholdFrames(8, 0)).toBe(1);
  });
});
