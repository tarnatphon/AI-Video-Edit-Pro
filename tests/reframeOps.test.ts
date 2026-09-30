import { describe, expect, it } from 'vitest';
import { reframeProject } from '../src/core/reframeOps';
import { makeAsset, makeClip, makeProject } from './helpers';

describe('reframeProject (timeline ops)', () => {
  const asset = makeAsset({ id: 'a1', width: 1920, height: 1080, duration: 5 });
  const assets = { a1: asset };

  it('updates project resolution and scales visual clips in auto-crop mode', () => {
    const clip = makeClip({ id: 'c1', assetId: 'a1', start: 0, duration: 60 });
    const project = makeProject([clip]);

    const next = reframeProject(project, assets, 1080, 1920, 'auto-crop', 0.5, 0.5);
    expect(next.width).toBe(1080);
    expect(next.height).toBe(1920);
    expect(next.clips[0]!.transform.scale).toBeGreaterThan(3.0);
  });

  it('creates a blurred background track in blur-background mode', () => {
    const clip = makeClip({ id: 'c1', assetId: 'a1', start: 0, duration: 60 });
    const project = makeProject([clip]);

    const next = reframeProject(project, assets, 1080, 1920, 'blur-background');
    expect(next.width).toBe(1080);
    expect(next.height).toBe(1920);

    // Should have 2 clips: blurred background clip + sharp foreground clip
    expect(next.clips.length).toBe(2);
    const bgClip = next.clips.find((c) => c.name.includes('Blur BG'))!;
    expect(bgClip).toBeDefined();
    expect(bgClip.effects.some((e) => e.type === 'blur')).toBe(true);
    expect(bgClip.volume).toBe(0);
  });
});
