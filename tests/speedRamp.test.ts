import { describe, expect, it } from 'vitest';
import {
  applySpeedRampToClip,
  calculateAverageSpeed,
  SPEED_RAMP_PRESETS,
} from '../src/core/speedRamp';
import { makeClip, makeProject } from './helpers';

describe('SPEED_RAMP_PRESETS & calculateAverageSpeed', () => {
  it('includes standard cinematic curve presets', () => {
    expect(SPEED_RAMP_PRESETS.length).toBeGreaterThanOrEqual(4);
    const bulletTime = SPEED_RAMP_PRESETS.find((p) => p.id === 'bullet-time');
    expect(bulletTime).toBeDefined();
    expect(bulletTime!.curve.length).toBeGreaterThan(2);
  });

  it('calculates weighted average speed', () => {
    const constantCurve = [
      { position: 0, speed: 2 },
      { position: 1, speed: 2 },
    ];
    expect(calculateAverageSpeed(constantCurve)).toBe(2);
  });

  it('applies speed ramp preset by segmenting timeline clip proportionally', () => {
    // 1 video clip 120 frames at speed 1 (4 seconds)
    const videoClip = makeClip({ id: 'action_clip', trackId: 'v1', start: 0, duration: 120, speed: 1 });
    const project = makeProject([videoClip]);

    const bulletTime = SPEED_RAMP_PRESETS.find((p) => p.id === 'bullet-time')!;
    const updated = applySpeedRampToClip(project, 'action_clip', bulletTime);

    // Should create multiple segments corresponding to the curve points
    expect(updated.clips.length).toBe(bulletTime.curve.length - 1);
    expect(updated.clips[0]!.start).toBe(0);
    expect(updated.clips[0]!.speed).toBeGreaterThan(1); // fast intro
  });
});
