import { describe, expect, it } from 'vitest';
import type { SceneInterval } from '../src/core/scene';
import { splitClipIntoScenes } from '../src/core/sceneOps';
import { makeClip, makeProject } from './helpers';

describe('splitClipIntoScenes (timeline ops)', () => {
  it('splits a video clip into multiple scene sub-clips', () => {
    // 6-second clip (180 frames @ 30fps)
    const clip = makeClip({ id: 'c1', start: 0, duration: 180, offset: 0 });
    const project = makeProject([clip]);

    const scenes: SceneInterval[] = [
      { id: 's1', startSec: 0, endSec: 2, duration: 2, startFrame: 0, endFrame: 60 },
      { id: 's2', startSec: 2, endSec: 4.5, duration: 2.5, startFrame: 60, endFrame: 135 },
      { id: 's3', startSec: 4.5, endSec: 6, duration: 1.5, startFrame: 135, endFrame: 180 },
    ];

    const next = splitClipIntoScenes(project, 'c1', scenes);
    expect(next.clips.length).toBe(3);

    expect(next.clips[0]!.start).toBe(0);
    expect(next.clips[0]!.duration).toBe(60);
    expect(next.clips[0]!.offset).toBe(0);

    expect(next.clips[1]!.start).toBe(60);
    expect(next.clips[1]!.duration).toBe(75);
    expect(next.clips[1]!.offset).toBe(60);

    expect(next.clips[2]!.start).toBe(135);
    expect(next.clips[2]!.duration).toBe(45);
    expect(next.clips[2]!.offset).toBe(135);
  });

  it('returns same project when only 1 scene exists', () => {
    const clip = makeClip({ id: 'c1', start: 0, duration: 90, offset: 0 });
    const project = makeProject([clip]);
    const scenes: SceneInterval[] = [
      { id: 's1', startSec: 0, endSec: 3, duration: 3, startFrame: 0, endFrame: 90 },
    ];
    expect(splitClipIntoScenes(project, 'c1', scenes)).toBe(project);
  });
});
