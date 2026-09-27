/**
 * Visual effect definitions + two interchangeable implementations:
 *  1. `buildCanvasFilter` — a CSS filter string for `CanvasRenderingContext2D.filter` (GPU path).
 *  2. `applyPixelEffects` — a pixel-exact software fallback that follows the CSS Filter Effects
 *     colour matrices, for browsers without canvas `filter` support (older Safari).
 */

import { clamp } from './time';
import type { Effect, EffectType } from './types';

export interface EffectDefinition {
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
}

export const EFFECT_DEFINITIONS: Readonly<Record<EffectType, EffectDefinition>> = {
  brightness: { label: 'Brightness', min: 0, max: 2, step: 0.01, defaultValue: 1.2, unit: '×' },
  contrast: { label: 'Contrast', min: 0, max: 2, step: 0.01, defaultValue: 1.2, unit: '×' },
  saturate: { label: 'Saturation', min: 0, max: 3, step: 0.01, defaultValue: 1.4, unit: '×' },
  grayscale: { label: 'Black & White', min: 0, max: 1, step: 0.01, defaultValue: 1, unit: '' },
  sepia: { label: 'Sepia', min: 0, max: 1, step: 0.01, defaultValue: 0.8, unit: '' },
  hueRotate: { label: 'Hue Rotate', min: 0, max: 360, step: 1, defaultValue: 30, unit: '°' },
  blur: { label: 'Blur', min: 0, max: 40, step: 0.5, defaultValue: 4, unit: 'px' },
  invert: { label: 'Invert', min: 0, max: 1, step: 0.01, defaultValue: 1, unit: '' },
};

export function clampEffectValue(type: EffectType, value: number): number {
  const def = EFFECT_DEFINITIONS[type];
  if (!Number.isFinite(value)) return def.defaultValue;
  return clamp(value, def.min, def.max);
}

/** Effects that the software fallback can reproduce. */
const PIXEL_CAPABLE: ReadonlySet<EffectType> = new Set<EffectType>([
  'brightness',
  'contrast',
  'saturate',
  'grayscale',
  'sepia',
  'invert',
]);

function enabledEffects(effects: readonly Effect[]): Effect[] {
  return effects.filter((e) => e.enabled);
}

/** Builds the `ctx.filter` string. Returns `'none'` when no effect is active. */
export function buildCanvasFilter(effects: readonly Effect[]): string {
  const parts: string[] = [];
  for (const effect of enabledEffects(effects)) {
    const value = clampEffectValue(effect.type, effect.value);
    switch (effect.type) {
      case 'brightness':
        parts.push(`brightness(${value})`);
        break;
      case 'contrast':
        parts.push(`contrast(${value})`);
        break;
      case 'saturate':
        parts.push(`saturate(${value})`);
        break;
      case 'grayscale':
        parts.push(`grayscale(${value})`);
        break;
      case 'sepia':
        parts.push(`sepia(${value})`);
        break;
      case 'hueRotate':
        parts.push(`hue-rotate(${value}deg)`);
        break;
      case 'blur':
        parts.push(`blur(${value}px)`);
        break;
      case 'invert':
        parts.push(`invert(${value})`);
        break;
    }
  }
  return parts.length === 0 ? 'none' : parts.join(' ');
}

/** True when at least one enabled effect can be applied by the software path. */
export function needsPixelFallback(effects: readonly Effect[]): boolean {
  return enabledEffects(effects).some((e) => PIXEL_CAPABLE.has(e.type));
}

type Matrix3 = [number, number, number, number, number, number, number, number, number];

function saturateMatrix(s: number): Matrix3 {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

function grayscaleMatrix(amount: number): Matrix3 {
  const k = 1 - amount;
  return [
    0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
  ];
}

function sepiaMatrix(amount: number): Matrix3 {
  const k = 1 - amount;
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
  ];
}

/**
 * Apply colour effects in-place on RGBA pixel data (software fallback).
 * `hueRotate` and `blur` are intentionally skipped (not representable per-pixel cheaply).
 */
export function applyPixelEffects(data: Uint8ClampedArray, effects: readonly Effect[]): void {
  const active = enabledEffects(effects).filter((e) => PIXEL_CAPABLE.has(e.type));
  if (active.length === 0) return;

  for (const effect of active) {
    const value = clampEffectValue(effect.type, effect.value);
    switch (effect.type) {
      case 'brightness': {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i]! * value;
          data[i + 1] = data[i + 1]! * value;
          data[i + 2] = data[i + 2]! * value;
        }
        break;
      }
      case 'contrast': {
        const intercept = 128 * (1 - value);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i]! * value + intercept;
          data[i + 1] = data[i + 1]! * value + intercept;
          data[i + 2] = data[i + 2]! * value + intercept;
        }
        break;
      }
      case 'invert': {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i]! * (1 - value) + (255 - data[i]!) * value;
          data[i + 1] = data[i + 1]! * (1 - value) + (255 - data[i + 1]!) * value;
          data[i + 2] = data[i + 2]! * (1 - value) + (255 - data[i + 2]!) * value;
        }
        break;
      }
      case 'saturate':
      case 'grayscale':
      case 'sepia': {
        const m =
          effect.type === 'saturate'
            ? saturateMatrix(value)
            : effect.type === 'grayscale'
              ? grayscaleMatrix(value)
              : sepiaMatrix(value);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          data[i] = m[0] * r + m[1] * g + m[2] * b;
          data[i + 1] = m[3] * r + m[4] * g + m[5] * b;
          data[i + 2] = m[6] * r + m[7] * g + m[8] * b;
        }
        break;
      }
      case 'hueRotate':
      case 'blur':
        break;
    }
  }
}
