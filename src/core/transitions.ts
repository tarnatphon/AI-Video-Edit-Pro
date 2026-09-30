/**
 * Transitions domain model and definitions.
 */

import type { Frames } from './types';

export const TRANSITION_TYPES = [
  'none',
  'crossfade',
  'fadeToBlack',
  'fadeToWhite',
  'wipeLeft',
  'wipeRight',
  'slideLeft',
  'zoomIn',
] as const;

export type TransitionType = (typeof TRANSITION_TYPES)[number];

export interface TransitionConfig {
  type: TransitionType;
  duration: Frames; // integer frames
}

export interface TransitionDefinition {
  type: TransitionType;
  label: string;
  description: string;
}

export const TRANSITION_DEFINITIONS: Record<TransitionType, TransitionDefinition> = {
  none: { type: 'none', label: 'None', description: 'Hard cut without transition' },
  crossfade: { type: 'crossfade', label: 'Cross Dissolve', description: 'Smooth dissolve between clips' },
  fadeToBlack: { type: 'fadeToBlack', label: 'Dip to Black', description: 'Fades through black' },
  fadeToWhite: { type: 'fadeToWhite', label: 'Dip to White', description: 'Fades through white flash' },
  wipeLeft: { type: 'wipeLeft', label: 'Wipe Left', description: 'Linear wipe transition to the left' },
  wipeRight: { type: 'wipeRight', label: 'Wipe Right', description: 'Linear wipe transition to the right' },
  slideLeft: { type: 'slideLeft', label: 'Slide Left', description: 'Slides in from the right edge' },
  zoomIn: { type: 'zoomIn', label: 'Zoom In', description: 'Zooms in on transition' },
};
