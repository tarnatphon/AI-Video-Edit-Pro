import { describe, expect, it } from 'vitest';
import {
  addClip,
  addTrack,
  changeFps,
  clipEnd,
  duplicateClip,
  fadeFactor,
  findFreePosition,
  maxClipDuration,
  moveClip,
  projectDuration,
  removeClips,
  removeTrack,
  rippleDelete,
  setClipSpeed,
  sourceTimeAt,
  splitClip,
  trimClip,
  updateClip,
} from '../src/core/timelineOps';
import { A1, assertNoOverlaps, makeAsset, makeClip, makeProject, V1, V2 } from './helpers';

const assets = { asset1: makeAsset({ id: 'asset1', duration: 10 }) }; // 300 frames @ 30fps

describe('findFreePosition', () => {
  it('returns the requested position when it is free', () => {
    expect(findFreePosition([], 42, 10)).toBe(42);
    expect(findFreePosition([makeClip({ id: 'a', start: 0, duration: 30 })], 30, 10)).toBe(30);
  });

  it('never returns a negative position', () => {
    expect(findFreePosition([], -5, 10)).toBe(0);
  });

  it('pushes to the nearest free edge on collision', () => {
    const others = [makeClip({ id: 'a', start: 100, duration: 100 })];
    expect(findFreePosition(others, 150, 20)).toBe(200); // closer to end (200) than to start-20 (80)
    expect(findFreePosition(others, 110, 20)).toBe(80); // closer to 80
  });

  it('skips positions that would collide with a different clip', () => {
    const others = [makeClip({ id: 'a', start: 0, duration: 100 }), makeClip({ id: 'b', start: 110, duration: 100 })];
    // Requested 50 with duration 50: end of `a` (100) collides with `b` (110) → after b (210) or before a (impossible)
    expect(findFreePosition(others, 50, 50)).toBe(210);
  });
});

describe('addClip', () => {
  it('adds a clip and resolves collisions', () => {
    const p1 = addClip(makeProject(), makeClip({ id: 'a', start: 0, duration: 100 }));
    const p2 = addClip(p1, makeClip({ id: 'b', start: 10, duration: 50 }));
    expect(p2.clips).toHaveLength(2);
    expect(p2.clips[1]!.start).toBe(100);
    assertNoOverlaps(p2);
  });

  it('rejects incompatible track kinds and unknown tracks', () => {
    const base = makeProject();
    expect(addClip(base, makeClip({ id: 'a', start: 0, duration: 10, trackId: 'a1' }))).toBe(base);
    expect(addClip(base, makeClip({ id: 'a', start: 0, duration: 10, trackId: 'nope' }))).toBe(base);
    expect(addClip(base, makeClip({ id: 'a', start: 0, duration: 10, kind: 'audio', trackId: 'v1' }))).toBe(base);
  });

  it('accepts audio clips on audio tracks', () => {
    const next = addClip(makeProject(), makeClip({ id: 'a', start: 0, duration: 10, kind: 'audio', trackId: 'a1' }));
    expect(next.clips).toHaveLength(1);
  });

  it('rejects duplicate ids and normalises numbers', () => {
    const p1 = addClip(makeProject(), makeClip({ id: 'a', start: 3.4, duration: 0, offset: -2 }));
    expect(p1.clips[0]).toMatchObject({ start: 3, duration: 1, offset: 0 });
    expect(addClip(p1, makeClip({ id: 'a', start: 50, duration: 10 }))).toBe(p1);
  });
});

describe('moveClip', () => {
  const project = makeProject([
    makeClip({ id: 'a', start: 0, duration: 100 }),
    makeClip({ id: 'b', start: 100, duration: 100 }),
  ]);

  it('moves freely into empty space', () => {
    const next = moveClip(project, 'b', 300);
    expect(next.clips.find((c) => c.id === 'b')!.start).toBe(300);
    assertNoOverlaps(next);
  });

  it('returns the same reference when nothing changes', () => {
    expect(moveClip(project, 'b', 100)).toBe(project);
    expect(moveClip(project, 'missing', 100)).toBe(project);
  });

  it('resolves collisions with the nearest free slot', () => {
    const next = moveClip(project, 'b', 20);
    // Requested 20 collides with a [0,100): candidates end(a)=100 (dist 80) vs 0-100=-100 (invalid)
    expect(next.clips.find((c) => c.id === 'b')!.start).toBe(100);
  });

  it('moves between compatible tracks only', () => {
    const toV2 = moveClip(project, 'b', 0, 'v2');
    expect(toV2.clips.find((c) => c.id === 'b')).toMatchObject({ trackId: 'v2', start: 0 });
    expect(moveClip(project, 'b', 0, 'a1')).toBe(project);
  });

  it('ignores locked tracks', () => {
    const locked = { ...project, tracks: [V2, { ...V1, locked: true }, A1] };
    expect(moveClip(locked, 'b', 500)).toBe(locked);
    expect(moveClip(project, 'b', 0, 'v2') !== project).toBe(true);
    const lockedTarget = { ...project, tracks: [{ ...V2, locked: true }, V1, A1] };
    expect(moveClip(lockedTarget, 'b', 0, 'v2')).toBe(lockedTarget);
  });
});

describe('trimClip', () => {
  const project = makeProject([
    makeClip({ id: 'a', start: 0, duration: 60 }),
    makeClip({ id: 'b', start: 100, duration: 100, offset: 30 }),
    makeClip({ id: 'c', start: 250, duration: 20 }),
  ]);

  it('trims the start edge and keeps the end fixed', () => {
    const next = trimClip(project, assets, 'b', 'start', 120);
    const b = next.clips.find((c) => c.id === 'b')!;
    expect(b).toMatchObject({ start: 120, duration: 80, offset: 50 });
    expect(clipEnd(b)).toBe(200);
  });

  it('cannot extend the start edge before the source in-point or the previous clip', () => {
    // offset 30 → may extend left by at most 30 frames (to 70). Previous clip ends at 60.
    const next = trimClip(project, assets, 'b', 'start', 0);
    expect(next.clips.find((c) => c.id === 'b')).toMatchObject({ start: 70, duration: 130, offset: 0 });

    const tight = makeProject([makeClip({ id: 'a', start: 0, duration: 90 }), makeClip({ id: 'b', start: 100, duration: 100, offset: 30 })]);
    const clamped = trimClip(tight, assets, 'b', 'start', 0);
    expect(clamped.clips.find((c) => c.id === 'b')).toMatchObject({ start: 90, offset: 20 });
  });

  it('keeps at least one frame', () => {
    const next = trimClip(project, assets, 'b', 'start', 999);
    expect(next.clips.find((c) => c.id === 'b')).toMatchObject({ start: 199, duration: 1 });
    const next2 = trimClip(project, assets, 'b', 'end', -50);
    expect(next2.clips.find((c) => c.id === 'b')).toMatchObject({ start: 100, duration: 1 });
  });

  it('cannot extend the end edge past the next clip or the source length', () => {
    const next = trimClip(project, assets, 'b', 'end', 400);
    // next clip starts at 250 → max end 250 (source allows 100+270=370)
    expect(clipEnd(next.clips.find((c) => c.id === 'b')!)).toBe(250);

    const alone = makeProject([makeClip({ id: 'b', start: 100, duration: 100, offset: 30 })]);
    const bySource = trimClip(alone, assets, 'b', 'end', 999);
    // source 300 frames, offset 30 → max duration 270
    expect(bySource.clips[0]!.duration).toBe(270);
  });

  it('respects speed when bounding by the source', () => {
    const fast = makeProject([makeClip({ id: 'b', start: 0, duration: 10, offset: 0, speed: 2 })]);
    const next = trimClip(fast, assets, 'b', 'end', 999);
    expect(next.clips[0]!.duration).toBe(150); // 300 source frames / 2
  });

  it('images and text are unbounded by source length', () => {
    const img = makeProject([makeClip({ id: 'i', start: 0, duration: 10, kind: 'image', assetId: 'img' })]);
    const next = trimClip(img, assets, 'i', 'end', 5000);
    expect(next.clips[0]!.duration).toBe(5000);
  });

  it('returns the same reference when nothing changes', () => {
    expect(trimClip(project, assets, 'b', 'start', 100)).toBe(project);
    expect(trimClip(project, assets, 'b', 'end', 200)).toBe(project);
  });
});

describe('splitClip', () => {
  const project = makeProject([makeClip({ id: 'a', start: 100, duration: 100, offset: 20, speed: 2, fadeIn: 10, fadeOut: 10 })]);

  it('creates two contiguous clips with correct offsets and fades', () => {
    const next = splitClip(project, 'a', 130, 'a2');
    expect(next.clips).toHaveLength(2);
    const [left, right] = next.clips;
    expect(left).toMatchObject({ id: 'a', start: 100, duration: 30, offset: 20, fadeIn: 10, fadeOut: 0 });
    expect(right).toMatchObject({ id: 'a2', start: 130, duration: 70, offset: 20 + 30 * 2, fadeIn: 0, fadeOut: 10 });
    expect(right!.effects).not.toBe(left!.effects);
    assertNoOverlaps(next);
  });

  it('ignores splits on the clip boundaries or outside', () => {
    expect(splitClip(project, 'a', 100, 'x')).toBe(project);
    expect(splitClip(project, 'a', 200, 'x')).toBe(project);
    expect(splitClip(project, 'a', 500, 'x')).toBe(project);
    expect(splitClip(project, 'a', 150, 'a')).toBe(project); // duplicate id
  });
});

describe('remove / ripple / duplicate', () => {
  const project = makeProject([
    makeClip({ id: 'a', start: 0, duration: 100 }),
    makeClip({ id: 'b', start: 100, duration: 50 }),
    makeClip({ id: 'c', start: 200, duration: 50 }),
    makeClip({ id: 'x', start: 0, duration: 30, trackId: 'v2' }),
  ]);

  it('removeClips keeps other clips in place', () => {
    const next = removeClips(project, ['b']);
    expect(next.clips.map((c) => c.id)).toEqual(['a', 'c', 'x']);
    expect(next.clips.find((c) => c.id === 'c')!.start).toBe(200);
    expect(removeClips(project, ['nope'])).toBe(project);
  });

  it('rippleDelete closes the gap on the same track only', () => {
    const next = rippleDelete(project, ['b']);
    expect(next.clips.find((c) => c.id === 'c')!.start).toBe(150);
    expect(next.clips.find((c) => c.id === 'x')!.start).toBe(0);
    assertNoOverlaps(next);
  });

  it('rippleDelete handles multiple removals on one track', () => {
    const next = rippleDelete(project, ['a', 'b']);
    expect(next.clips.find((c) => c.id === 'c')!.start).toBe(50); // 200 - 100 - 50
    assertNoOverlaps(next);
  });

  it('duplicateClip places the copy right after the original or in the next free slot', () => {
    const next = duplicateClip(project, 'a', 'a-copy');
    // Requested 100 (end of a) collides with b; 150 (end of b) would collide with c; first free slot is 250.
    const copy = next.clips.find((c) => c.id === 'a-copy')!;
    expect(copy.start).toBe(250);
    assertNoOverlaps(next);
  });
});

describe('updateClip / setClipSpeed', () => {
  const project = makeProject([
    makeClip({ id: 'a', start: 0, duration: 100 }),
    makeClip({ id: 'b', start: 150, duration: 100 }),
  ]);

  it('clamps fades and transform values', () => {
    const next = updateClip(project, 'a', {
      fadeIn: 500,
      fadeOut: -3,
      volume: 9,
      transform: { x: 0, y: 0, scale: 0, rotation: 0, opacity: 4 },
    });
    expect(next.clips[0]).toMatchObject({ fadeIn: 100, fadeOut: 0, volume: 2 });
    expect(next.clips[0]!.transform).toMatchObject({ scale: 0.01, opacity: 1 });
  });

  it('halving the speed doubles the duration up to the next clip', () => {
    const next = setClipSpeed(project, assets, 'a', 0.5);
    expect(next.clips[0]).toMatchObject({ speed: 0.5, duration: 150 }); // wanted 200, capped by b at 150
  });

  it('doubling the speed halves the duration', () => {
    const next = setClipSpeed(project, assets, 'b', 2);
    expect(next.clips[1]).toMatchObject({ speed: 2, duration: 50 });
    expect(maxClipDuration(next.clips[1]!, assets, 30)).toBe(150);
  });

  it('clamps speed and ignores no-ops', () => {
    expect(setClipSpeed(project, assets, 'a', 1)).toBe(project);
    expect(setClipSpeed(project, assets, 'a', 100).clips[0]!.speed).toBe(8);
  });
});

describe('tracks', () => {
  it('adds video tracks on top and audio tracks at the bottom with sequential names', () => {
    const p1 = addTrack(makeProject(), 'video', 'v3');
    expect(p1.tracks.map((t) => t.name)).toEqual(['V3', 'V2', 'V1', 'A1']);
    const p2 = addTrack(p1, 'audio', 'a2');
    expect(p2.tracks.map((t) => t.name)).toEqual(['V3', 'V2', 'V1', 'A1', 'A2']);
  });

  it('removing a track removes its clips but keeps the last track of each kind', () => {
    const project = makeProject([makeClip({ id: 'a', start: 0, duration: 10, trackId: 'v2' })]);
    const next = removeTrack(project, 'v2');
    expect(next.tracks.map((t) => t.id)).toEqual(['v1', 'a1']);
    expect(next.clips).toHaveLength(0);
    expect(removeTrack(next, 'a1')).toBe(next);
    expect(removeTrack(next, 'v1')).toBe(next);
  });
});

describe('changeFps', () => {
  it('rescales all frame values and keeps clips from overlapping', () => {
    const project = makeProject([
      makeClip({ id: 'a', start: 0, duration: 31 }),
      makeClip({ id: 'b', start: 31, duration: 31, offset: 15 }),
    ]);
    const next = changeFps(project, 25);
    expect(next.fps).toBe(25);
    expect(next.clips[0]).toMatchObject({ start: 0, duration: 26 });
    expect(next.clips[1]!.start).toBeGreaterThanOrEqual(26);
    expect(next.clips[1]!.offset).toBe(13);
    assertNoOverlaps(next);
    expect(changeFps(project, 30)).toBe(project);
  });
});

describe('queries', () => {
  it('projectDuration, sourceTimeAt and fadeFactor', () => {
    const clip = makeClip({ id: 'a', start: 60, duration: 60, offset: 30, speed: 2, fadeIn: 30, fadeOut: 30 });
    const project = makeProject([clip]);
    expect(projectDuration(project)).toBe(120);
    expect(projectDuration(makeProject())).toBe(0);
    expect(sourceTimeAt(clip, 60, 30)).toBeCloseTo(1); // offset 30 frames = 1s
    expect(sourceTimeAt(clip, 90, 30)).toBeCloseTo((30 + 30 * 2) / 30);
    expect(fadeFactor(clip, 60)).toBe(0);
    expect(fadeFactor(clip, 75)).toBeCloseTo(0.5);
    expect(fadeFactor(clip, 90)).toBe(1);
    expect(fadeFactor(clip, 105)).toBeCloseTo(0.5);
  });
});
