import { describe, expect, it } from 'vitest';
import { calculateHistogram, compareHistograms, detectScenesFromScores } from '../src/core/scene';

describe('scene detection math', () => {
  it('calculates histogram accurately', () => {
    // 4 pixels: red, green, blue, white
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,   // red
      0, 255, 0, 255,   // green
      0, 0, 255, 255,   // blue
      255, 255, 255, 255, // white
    ]);

    const hist = calculateHistogram(pixels);
    expect(hist.length).toBe(64);
    let sum = 0;
    for (let i = 0; i < hist.length; i++) sum += hist[i]!;
    expect(sum).toBeCloseTo(1.0);
  });

  it('compares identical histograms to score 0', () => {
    const h1 = new Float32Array(64).fill(0.1);
    expect(compareHistograms(h1, h1)).toBe(0);
  });

  it('detects scene cuts from score spikes', () => {
    const scores = [
      { timeSec: 0.5, frame: 15, score: 0.05 },
      { timeSec: 1.0, frame: 30, score: 0.02 },
      { timeSec: 1.5, frame: 45, score: 0.65 }, // Scene cut!
      { timeSec: 2.0, frame: 60, score: 0.04 },
      { timeSec: 2.5, frame: 75, score: 0.01 },
      { timeSec: 3.0, frame: 90, score: 0.80 }, // Scene cut!
      { timeSec: 3.5, frame: 105, score: 0.02 },
    ];

    const scenes = detectScenesFromScores(scores, 4.0, 30, {
      threshold: 0.35,
      minSceneDuration: 0.5,
    });

    expect(scenes.length).toBe(3);
    expect(scenes[0]!.startSec).toBe(0);
    expect(scenes[0]!.endSec).toBe(1.5);
    expect(scenes[1]!.startSec).toBe(1.5);
    expect(scenes[1]!.endSec).toBe(3.0);
    expect(scenes[2]!.startSec).toBe(3.0);
    expect(scenes[2]!.endSec).toBe(4.0);
  });
});
