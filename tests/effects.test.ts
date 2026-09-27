import { describe, expect, it } from 'vitest';
import { applyPixelEffects, buildCanvasFilter, clampEffectValue, needsPixelFallback } from '../src/core/effects';
import type { Effect } from '../src/core/types';

const fx = (type: Effect['type'], value: number, enabled = true): Effect => ({ id: type, type, value, enabled });

describe('buildCanvasFilter', () => {
  it('returns none when nothing is enabled', () => {
    expect(buildCanvasFilter([])).toBe('none');
    expect(buildCanvasFilter([fx('blur', 4, false)])).toBe('none');
  });

  it('serialises enabled effects in order with correct units', () => {
    expect(buildCanvasFilter([fx('brightness', 1.2), fx('hueRotate', 30), fx('blur', 4), fx('grayscale', 1)])).toBe(
      'brightness(1.2) hue-rotate(30deg) blur(4px) grayscale(1)',
    );
  });

  it('clamps values to the effect range', () => {
    expect(buildCanvasFilter([fx('brightness', 99)])).toBe('brightness(2)');
    expect(clampEffectValue('blur', Number.NaN)).toBe(4);
  });
});

describe('applyPixelEffects', () => {
  const pixel = (r: number, g: number, b: number): Uint8ClampedArray => new Uint8ClampedArray([r, g, b, 255]);

  it('brightness 0 yields black, alpha untouched', () => {
    const data = pixel(200, 100, 50);
    applyPixelEffects(data, [fx('brightness', 0)]);
    expect([...data]).toEqual([0, 0, 0, 255]);
  });

  it('invert flips channels', () => {
    const data = pixel(200, 100, 50);
    applyPixelEffects(data, [fx('invert', 1)]);
    expect([...data]).toEqual([55, 155, 205, 255]);
  });

  it('grayscale 1 uses Rec.709 luma', () => {
    const data = pixel(255, 0, 0);
    applyPixelEffects(data, [fx('grayscale', 1)]);
    expect(data[0]).toBe(54);
    expect(data[1]).toBe(54);
    expect(data[2]).toBe(54);
  });

  it('contrast 1 and saturate 1 are identities', () => {
    const data = pixel(200, 100, 50);
    applyPixelEffects(data, [fx('contrast', 1), fx('saturate', 1)]);
    expect([...data]).toEqual([200, 100, 50, 255]);
  });

  it('contrast 0 collapses to mid grey', () => {
    const data = pixel(200, 100, 50);
    applyPixelEffects(data, [fx('contrast', 0)]);
    expect([...data]).toEqual([128, 128, 128, 255]);
  });

  it('skips disabled and non-pixel effects', () => {
    const data = pixel(200, 100, 50);
    applyPixelEffects(data, [fx('invert', 1, false), fx('blur', 10), fx('hueRotate', 90)]);
    expect([...data]).toEqual([200, 100, 50, 255]);
  });
});

describe('needsPixelFallback', () => {
  it('is true only for enabled colour effects', () => {
    expect(needsPixelFallback([])).toBe(false);
    expect(needsPixelFallback([fx('blur', 3)])).toBe(false);
    expect(needsPixelFallback([fx('sepia', 1, false)])).toBe(false);
    expect(needsPixelFallback([fx('sepia', 1)])).toBe(true);
  });
});
