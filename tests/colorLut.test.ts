import { describe, expect, it } from 'vitest';
import { applyLutPresetToEffects, COLOR_LUT_PRESETS } from '../src/core/colorLut';
import type { Effect } from '../src/core/types';

describe('COLOR_LUT_PRESETS', () => {
  it('provides film and cinema LUT presets', () => {
    expect(COLOR_LUT_PRESETS.length).toBeGreaterThanOrEqual(5);
    const tealOrange = COLOR_LUT_PRESETS.find((p) => p.id === 'teal-orange');
    expect(tealOrange).toBeDefined();
    expect(tealOrange?.effects.length).toBeGreaterThan(0);
  });

  it('applies LUT preset while preserving non-color effects like blur', () => {
    const existing: Effect[] = [
      { id: 'fx1', type: 'blur', value: 5, enabled: true },
      { id: 'fx2', type: 'brightness', value: 1.2, enabled: true },
    ];

    const vintage = COLOR_LUT_PRESETS.find((p) => p.id === 'vintage-film-35mm')!;
    const result = applyLutPresetToEffects(existing, vintage);

    // blur should be kept
    expect(result.some((e) => e.type === 'blur')).toBe(true);
    // vintage effects should be added
    expect(result.some((e) => e.type === 'sepia')).toBe(true);
  });
});
