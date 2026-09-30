import type { Keyframe, KeyframeEasing, KeyframeProperty, Transform } from './types';

export type { Keyframe, KeyframeEasing, KeyframeProperty };

/**
 * Standard easing calculation between 0 and 1.
 */
export function calculateEasing(t: number, easing?: KeyframeEasing | undefined): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'easeIn':
      return clamped * clamped * clamped;
    case 'easeOut':
      return 1 - Math.pow(1 - clamped, 3);
    case 'easeInOut':
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    case 'linear':
    default:
      return clamped;
  }
}

/**
 * Interpolate a single property value at a given clip frame.
 */
export function interpolateProperty(
  defaultValue: number,
  keyframes: Keyframe[] | undefined,
  property: KeyframeProperty,
  clipFrame: number,
): number {
  if (!keyframes || keyframes.length === 0) return defaultValue;

  const propKeyframes = keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.frame - b.frame);

  if (propKeyframes.length === 0) return defaultValue;
  if (propKeyframes.length === 1) return propKeyframes[0]!.value;

  // Before first keyframe
  const first = propKeyframes[0]!;
  if (clipFrame <= first.frame) return first.value;

  // After last keyframe
  const last = propKeyframes[propKeyframes.length - 1]!;
  if (clipFrame >= last.frame) return last.value;

  // Between two keyframes
  for (let i = 0; i < propKeyframes.length - 1; i++) {
    const k1 = propKeyframes[i]!;
    const k2 = propKeyframes[i + 1]!;

    if (clipFrame >= k1.frame && clipFrame <= k2.frame) {
      const span = k2.frame - k1.frame;
      if (span <= 0) return k2.value;

      const rawProgress = (clipFrame - k1.frame) / span;
      const easedProgress = calculateEasing(rawProgress, k2.easing ?? 'linear');
      return k1.value + (k2.value - k1.value) * easedProgress;
    }
  }

  return defaultValue;
}

/**
 * Computes the full active Transform for a clip at `clipFrame` considering any active keyframes.
 */
export function resolveClipTransform(
  baseTransform: Transform,
  keyframes: Keyframe[] | undefined,
  clipFrame: number,
): Transform {
  if (!keyframes || keyframes.length === 0) return baseTransform;

  return {
    x: interpolateProperty(baseTransform.x, keyframes, 'x', clipFrame),
    y: interpolateProperty(baseTransform.y, keyframes, 'y', clipFrame),
    scale: interpolateProperty(baseTransform.scale, keyframes, 'scale', clipFrame),
    rotation: interpolateProperty(baseTransform.rotation, keyframes, 'rotation', clipFrame),
    opacity: interpolateProperty(baseTransform.opacity, keyframes, 'opacity', clipFrame),
  };
}

/**
 * Add or update a keyframe for a clip.
 */
export function setKeyframeOnClip(
  existingKeyframes: Keyframe[] | undefined,
  frame: number,
  property: KeyframeProperty,
  value: number,
  easing: KeyframeEasing = 'easeInOut',
): Keyframe[] {
  const current = existingKeyframes ?? [];
  const existingIdx = current.findIndex((k) => k.frame === frame && k.property === property);

  if (existingIdx >= 0) {
    const copy = [...current];
    copy[existingIdx] = {
      ...copy[existingIdx]!,
      value,
      easing,
    };
    return copy;
  }

  const newKf: Keyframe = {
    id: `kf_${property}_${frame}_${Math.random().toString(36).slice(2, 6)}`,
    frame,
    property,
    value,
    easing,
  };

  return [...current, newKf].sort((a, b) => a.frame - b.frame);
}

/**
 * Remove a keyframe by frame and property.
 */
export function removeKeyframeOnClip(
  existingKeyframes: Keyframe[] | undefined,
  frame: number,
  property: KeyframeProperty,
): Keyframe[] {
  if (!existingKeyframes) return [];
  return existingKeyframes.filter((k) => !(k.frame === frame && k.property === property));
}
