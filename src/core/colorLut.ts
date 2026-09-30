import type { Effect, EffectType } from './types';

export interface ColorLutPreset {
  id: string;
  name: string;
  description: string;
  category: 'Cinematic' | 'Vintage' | 'Creative' | 'Monochrome';
  previewGradient: string;
  effects: { type: EffectType; value: number }[];
}

export const COLOR_LUT_PRESETS: readonly ColorLutPreset[] = [
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    description: 'Hollywood blockbuster look: cool teal shadows with warm amber skin tones',
    category: 'Cinematic',
    previewGradient: 'linear-gradient(135deg, #0ea5e9, #f97316)',
    effects: [
      { type: 'contrast', value: 1.25 },
      { type: 'saturate', value: 1.2 },
      { type: 'brightness', value: 1.05 },
    ],
  },
  {
    id: 'moody-cinematic',
    name: 'Moody Dark Cinema',
    description: 'Deep shadows, desaturated tones, and high micro-contrast',
    category: 'Cinematic',
    previewGradient: 'linear-gradient(135deg, #1e293b, #475569)',
    effects: [
      { type: 'contrast', value: 1.35 },
      { type: 'saturate', value: 0.8 },
      { type: 'brightness', value: 0.92 },
    ],
  },
  {
    id: 'golden-hour',
    name: 'Warm Golden Hour',
    description: 'Romantic sunset glow with boosted warm hues and gentle contrast',
    category: 'Cinematic',
    previewGradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    effects: [
      { type: 'sepia', value: 0.25 },
      { type: 'saturate', value: 1.3 },
      { type: 'brightness', value: 1.08 },
    ],
  },
  {
    id: 'vintage-film-35mm',
    name: 'Vintage 35mm Film',
    description: 'Classic analog film emulsion with raised black levels and nostalgic warmth',
    category: 'Vintage',
    previewGradient: 'linear-gradient(135deg, #78350f, #d97706)',
    effects: [
      { type: 'sepia', value: 0.35 },
      { type: 'contrast', value: 0.95 },
      { type: 'saturate', value: 0.9 },
    ],
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    description: 'Electric blues, vivid magenta highlights, and punchy futuristic saturation',
    category: 'Creative',
    previewGradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
    effects: [
      { type: 'hueRotate', value: 45 },
      { type: 'saturate', value: 1.45 },
      { type: 'contrast', value: 1.2 },
    ],
  },
  {
    id: 'noir-bw',
    name: 'Monochrome Noir',
    description: 'Timeless high-contrast black & white with dramatic shadows',
    category: 'Monochrome',
    previewGradient: 'linear-gradient(135deg, #000000, #ffffff)',
    effects: [
      { type: 'grayscale', value: 1.0 },
      { type: 'contrast', value: 1.4 },
      { type: 'brightness', value: 0.95 },
    ],
  },
];

/**
 * Apply a Color LUT preset to a clip's effects list.
 */
export function applyLutPresetToEffects(
  existingEffects: Effect[],
  preset: ColorLutPreset,
): Effect[] {
  // Filter out any existing basic color adjustments
  const preserved = existingEffects.filter(
    (e) => e.type === 'blur' || e.type === 'invert',
  );

  const newEffects: Effect[] = preset.effects.map((fx, idx) => ({
    id: `lut_${preset.id}_${idx}_${Date.now()}`,
    type: fx.type,
    value: fx.value,
    enabled: true,
  }));

  return [...preserved, ...newEffects];
}
