/**
 * Core domain model for AI Video Edit Pro.
 *
 * Design rules (frame-accurate editing):
 *  - Every timeline position/duration is stored as an INTEGER number of frames at `Project.fps`.
 *    Floating-point seconds are only produced at the rendering boundary (`frames / fps`).
 *  - The model is plain JSON (no classes) so it can be persisted, diffed, undone and driven by code/AI.
 *  - `Project` references media by `assetId`; the media registry (`MediaAsset`) lives next to it.
 */

/** Integer count of frames at the project's frame rate. */
export type Frames = number;

export type MediaKind = 'video' | 'audio' | 'image';
export type ClipKind = MediaKind | 'text';
export type TrackKind = 'video' | 'audio';

export type AssetStorage = { kind: 'memory' } | { kind: 'opfs'; path: string };

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mimeType: string;
  /** File size in bytes. */
  size: number;
  /** Object URL usable by <video>/<audio>/<img>. Session-scoped (re-created on reload). */
  url: string;
  /** Intrinsic duration in seconds (0 for images). */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Small JPEG data URL used by the media library and timeline clips. */
  thumbnail: string | null;
  /** Down-sampled absolute peaks in [0,1] over the full asset duration (audio/video only). */
  waveform: number[] | null;
  storage: AssetStorage;
  /** True when the underlying file could not be restored (e.g. session-only storage after reload). */
  missing: boolean;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface Transform {
  /** Horizontal offset from the canvas centre in project pixels. */
  x: number;
  /** Vertical offset from the canvas centre in project pixels. */
  y: number;
  /** Uniform scale factor (1 = fit inside the frame). */
  scale: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
  /** 0..1 */
  opacity: number;
}

export const EFFECT_TYPES = [
  'brightness',
  'contrast',
  'saturate',
  'grayscale',
  'sepia',
  'hueRotate',
  'blur',
  'invert',
] as const;

export type EffectType = (typeof EFFECT_TYPES)[number];

export interface Effect {
  id: string;
  type: EffectType;
  value: number;
  enabled: boolean;
}

export interface TextStyle {
  content: string;
  fontFamily: string;
  /** Font size in project pixels. */
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  /** CSS colour for a background box behind the text, or null for none. */
  background: string | null;
}

export interface TransitionConfig {
  type: 'none' | 'crossfade' | 'fadeToBlack' | 'fadeToWhite' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'zoomIn';
  duration: Frames;
}

export type KeyframeProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface Keyframe {
  id: string;
  frame: number;
  property: KeyframeProperty;
  value: number;
  easing?: KeyframeEasing | undefined;
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  /** Null for generated clips (text). */
  assetId: string | null;
  name: string;
  /** Timeline position (frames). */
  start: Frames;
  /** Timeline length (frames). Always >= 1. */
  duration: Frames;
  /** In-point inside the source media (frames of the *project* rate at speed 1). */
  offset: Frames;
  /** Playback rate. 1 = normal. */
  speed: number;
  /** 0..2 linear gain. */
  volume: number;
  muted: boolean;
  fadeIn: Frames;
  fadeOut: Frames;
  transform: Transform;
  effects: Effect[];
  text: TextStyle | null;
  transitionIn?: TransitionConfig | undefined;
  transitionOut?: TransitionConfig | undefined;
  keyframes?: Keyframe[] | undefined;
}

export interface Project {
  id: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  /** Ordered top -> bottom exactly as displayed in the timeline (e.g. V2, V1, A1, A2). */
  tracks: Track[];
  clips: Clip[];
  createdAt: number;
  updatedAt: number;
}

export type TrimEdge = 'start' | 'end';

export const DEFAULT_TRANSFORM: Readonly<Transform> = Object.freeze({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
});

export const DEFAULT_TEXT_STYLE: Readonly<TextStyle> = Object.freeze({
  content: 'Title',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
  fontSize: 96,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
  background: null,
});

export const SUPPORTED_FPS = [24, 25, 30, 50, 60] as const;

export interface ResolutionPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  { id: '1080p', label: '1080p · 16:9 (1920×1080)', width: 1920, height: 1080 },
  { id: '720p', label: '720p · 16:9 (1280×720)', width: 1280, height: 720 },
  { id: '4k', label: '4K UHD · 16:9 (3840×2160)', width: 3840, height: 2160 },
  { id: 'vertical', label: 'Vertical · 9:16 (1080×1920)', width: 1080, height: 1920 },
  { id: 'square', label: 'Square · 1:1 (1080×1080)', width: 1080, height: 1080 },
];
