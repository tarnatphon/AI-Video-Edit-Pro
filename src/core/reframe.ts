/**
 * AI Smart Reframe and Aspect Ratio transformation math.
 */

import type { Transform } from './types';

export type ReframeMode = 'auto-crop' | 'blur-background' | 'fit-letterbox';

export interface AspectRatioTarget {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const ASPECT_RATIOS: readonly AspectRatioTarget[] = [
  { id: '9:16', label: 'Vertical · 9:16 (TikTok / Reels)', width: 1080, height: 1920 },
  { id: '16:9', label: 'Widescreen · 16:9 (YouTube)', width: 1920, height: 1080 },
  { id: '1:1', label: 'Square · 1:1 (Instagram)', width: 1080, height: 1080 },
  { id: '4:5', label: 'Portrait · 4:5 (Instagram Feed)', width: 1080, height: 1350 },
];

/**
 * Calculate optimal transform scale and position for reframing.
 */
export function calculateReframeTransform(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: ReframeMode,
  focusX = 0.5, // 0 = left, 0.5 = center, 1 = right
  focusY = 0.5,
): Transform {
  const srcW = sourceWidth || 1920;
  const srcH = sourceHeight || 1080;
  const srcAspect = srcW / srcH;
  const targetAspect = targetWidth / targetHeight;

  if (mode === 'fit-letterbox') {
    return {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    };
  }

  // Auto-crop to fill target aspect ratio
  if (srcAspect > targetAspect) {
    // Source is wider than target: zoom so height fits, crop horizontal sides
    const scale = srcAspect / targetAspect;
    // Offset X based on focus point
    const maxOffset = ((scale - 1) * targetWidth) / 2;
    const x = (0.5 - focusX) * (maxOffset * 2);

    return {
      x: Math.round(x),
      y: 0,
      scale: Number(scale.toFixed(3)),
      rotation: 0,
      opacity: 1,
    };
  }

  // Source is taller than target: zoom so width fits, crop top/bottom
  const scale = targetAspect / srcAspect;
  const maxOffset = ((scale - 1) * targetHeight) / 2;
  const y = (0.5 - focusY) * (maxOffset * 2);

  return {
    x: 0,
    y: Math.round(y),
    scale: Number(scale.toFixed(3)),
    rotation: 0,
    opacity: 1,
  };
}
