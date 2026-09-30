import { describe, expect, it } from 'vitest';
import {
  calculateEasing,
  interpolateProperty,
  removeKeyframeOnClip,
  resolveClipTransform,
  setKeyframeOnClip,
  type Keyframe,
} from '../src/core/keyframes';
import { DEFAULT_TRANSFORM } from '../src/core/types';

describe('Keyframe Interpolation & Easing', () => {
  it('calculates cubic easing values correctly', () => {
    expect(calculateEasing(0, 'easeInOut')).toBe(0);
    expect(calculateEasing(1, 'easeInOut')).toBe(1);
    expect(calculateEasing(0.5, 'easeInOut')).toBeCloseTo(0.5, 2);
  });

  it('interpolates property between keyframes with easing', () => {
    const keyframes: Keyframe[] = [
      { id: '1', frame: 0, property: 'x', value: 0, easing: 'linear' },
      { id: '2', frame: 100, property: 'x', value: 200, easing: 'linear' },
    ];

    expect(interpolateProperty(0, keyframes, 'x', 0)).toBe(0);
    expect(interpolateProperty(0, keyframes, 'x', 50)).toBe(100);
    expect(interpolateProperty(0, keyframes, 'x', 100)).toBe(200);
    // Clamping outside bounds
    expect(interpolateProperty(0, keyframes, 'x', 150)).toBe(200);
  });

  it('resolves full clip transform from keyframes', () => {
    const base = { ...DEFAULT_TRANSFORM, x: 0, scale: 1 };
    const keyframes: Keyframe[] = [
      { id: '1', frame: 0, property: 'scale', value: 1, easing: 'linear' },
      { id: '2', frame: 60, property: 'scale', value: 2, easing: 'linear' },
    ];

    const midTransform = resolveClipTransform(base, keyframes, 30);
    expect(midTransform.scale).toBeCloseTo(1.5, 2);
    expect(midTransform.x).toBe(0); // non-keyframed property keeps base
  });

  it('adds and removes keyframes', () => {
    let kfs = setKeyframeOnClip([], 15, 'opacity', 0.5);
    expect(kfs).toHaveLength(1);
    expect(kfs[0]!.value).toBe(0.5);

    kfs = removeKeyframeOnClip(kfs, 15, 'opacity');
    expect(kfs).toHaveLength(0);
  });
});
