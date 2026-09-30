import type { Clip, Project } from './types';

export interface SpeedRampPoint {
  /** Normalized position in clip (0.0 = clip start, 1.0 = clip end) */
  position: number;
  /** Speed multiplier at this point (e.g. 0.25 for 4x slow-mo, 4.0 for 4x fast) */
  speed: number;
}

export interface SpeedRampPreset {
  id: string;
  name: string;
  description: string;
  category: 'Cinematic' | 'Action' | 'Montage';
  curve: SpeedRampPoint[];
}

export const SPEED_RAMP_PRESETS: readonly SpeedRampPreset[] = [
  {
    id: 'bullet-time',
    name: 'Bullet Time (Hero Drop)',
    description: 'Fast entrance (3×) → Ultra Slow-Mo impact (0.3×) → Quick resolution (2×)',
    category: 'Cinematic',
    curve: [
      { position: 0.0, speed: 3.0 },
      { position: 0.25, speed: 1.0 },
      { position: 0.5, speed: 0.3 },
      { position: 0.75, speed: 1.0 },
      { position: 1.0, speed: 2.0 },
    ],
  },
  {
    id: 'montage-pop',
    name: 'Montage Pop',
    description: 'Brisk build-up (2.5×) → Crisp freeze beat (0.5×) → Rapid cutaway (3×)',
    category: 'Montage',
    curve: [
      { position: 0.0, speed: 2.5 },
      { position: 0.4, speed: 1.0 },
      { position: 0.5, speed: 0.5 },
      { position: 0.6, speed: 1.0 },
      { position: 1.0, speed: 3.0 },
    ],
  },
  {
    id: 'flash-in',
    name: 'Flash In (Speed Zoom)',
    description: 'High velocity entry (5×) transitioning smoothly into standard real-time (1×)',
    category: 'Action',
    curve: [
      { position: 0.0, speed: 5.0 },
      { position: 0.3, speed: 2.5 },
      { position: 0.6, speed: 1.2 },
      { position: 1.0, speed: 1.0 },
    ],
  },
  {
    id: 'flash-out',
    name: 'Flash Out (Whip Rush)',
    description: 'Standard real-time pacing (1×) accelerating dramatically into an exit rush (5×)',
    category: 'Action',
    curve: [
      { position: 0.0, speed: 1.0 },
      { position: 0.4, speed: 1.2 },
      { position: 0.7, speed: 2.5 },
      { position: 1.0, speed: 5.0 },
    ],
  },
  {
    id: 'smooth-slowmo',
    name: 'Smooth Slow-Mo (0.5×)',
    description: 'Consistent 50% slow-motion for dreamy, emotional, or detailed shots',
    category: 'Cinematic',
    curve: [
      { position: 0.0, speed: 0.5 },
      { position: 1.0, speed: 0.5 },
    ],
  },
];

/**
 * Calculates average weighted speed of a curve across the clip.
 */
export function calculateAverageSpeed(curve: SpeedRampPoint[]): number {
  if (curve.length === 0) return 1.0;
  if (curve.length === 1) return curve[0]!.speed;

  let totalArea = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i]!;
    const p2 = curve[i + 1]!;
    const dx = p2.position - p1.position;
    const avgSpeed = (p1.speed + p2.speed) / 2;
    totalArea += dx * avgSpeed;
  }

  return Math.max(0.1, Math.min(8.0, totalArea));
}

/**
 * Apply a Speed Ramp preset to a timeline clip.
 * Splits the clip into proportional segments with corresponding speed rates.
 */
export function applySpeedRampToClip(
  project: Project,
  clipId: string,
  preset: SpeedRampPreset,
): Project {
  const targetClip = project.clips.find((c) => c.id === clipId);
  if (!targetClip || targetClip.kind === 'text') return project;

  const curve = preset.curve;
  if (curve.length < 2) return project;

  const segmentCount = curve.length - 1;
  const newClips: Clip[] = [];
  let currentStart = targetClip.start;
  let currentSourceOffset = targetClip.offset;

  for (let i = 0; i < segmentCount; i++) {
    const p1 = curve[i]!;
    const p2 = curve[i + 1]!;
    const segmentSpanRatio = p2.position - p1.position;
    const avgSegmentSpeed = Math.max(0.1, (p1.speed + p2.speed) / 2);

    // Timeline duration in frames for this segment
    const sourceFrames = Math.round(targetClip.duration * targetClip.speed * segmentSpanRatio);
    const timelineDuration = Math.max(2, Math.round(sourceFrames / avgSegmentSpeed));

    const segClip: Clip = {
      ...targetClip,
      id: i === 0 ? targetClip.id : `clip_ramp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      start: currentStart,
      duration: timelineDuration,
      offset: currentSourceOffset,
      speed: avgSegmentSpeed,
    };

    newClips.push(segClip);
    currentStart += timelineDuration;
    currentSourceOffset += sourceFrames;
  }

  const otherClips = project.clips.filter((c) => c.id !== targetClip.id);
  return {
    ...project,
    clips: [...otherClips, ...newClips],
  };
}
