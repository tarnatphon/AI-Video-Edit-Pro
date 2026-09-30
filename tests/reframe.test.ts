import { describe, expect, it } from 'vitest';
import { calculateReframeTransform } from '../src/core/reframe';

describe('calculateReframeTransform', () => {
  it('computes auto-crop scale for 16:9 to 9:16 vertical reframe', () => {
    // 1920x1080 (16:9) to 1080x1920 (9:16)
    const t = calculateReframeTransform(1920, 1080, 1080, 1920, 'auto-crop', 0.5, 0.5);
    // srcAspect = 1.777, targetAspect = 0.5625 -> scale = 1.777 / 0.5625 = 3.16
    expect(t.scale).toBeGreaterThan(3.0);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
  });

  it('computes offset X when focus is shifted', () => {
    const leftFocus = calculateReframeTransform(1920, 1080, 1080, 1920, 'auto-crop', 0.2, 0.5);
    const rightFocus = calculateReframeTransform(1920, 1080, 1080, 1920, 'auto-crop', 0.8, 0.5);
    expect(leftFocus.x).toBeGreaterThan(0);
    expect(rightFocus.x).toBeLessThan(0);
  });

  it('returns identity for fit-letterbox', () => {
    const t = calculateReframeTransform(1920, 1080, 1080, 1920, 'fit-letterbox');
    expect(t.scale).toBe(1);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
  });
});
