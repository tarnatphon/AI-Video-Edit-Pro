import { describe, expect, it } from 'vitest';
import { TRANSITION_DEFINITIONS, TRANSITION_TYPES } from '../src/core/transitions';

describe('transitions definitions', () => {
  it('contains all supported transition types with labels', () => {
    expect(TRANSITION_TYPES).toContain('crossfade');
    expect(TRANSITION_TYPES).toContain('fadeToBlack');
    expect(TRANSITION_TYPES).toContain('wipeLeft');
    expect(TRANSITION_TYPES).toContain('slideLeft');
    expect(TRANSITION_TYPES).toContain('zoomIn');

    for (const type of TRANSITION_TYPES) {
      expect(TRANSITION_DEFINITIONS[type]).toBeDefined();
      expect(TRANSITION_DEFINITIONS[type].label.length).toBeGreaterThan(0);
    }
  });
});
