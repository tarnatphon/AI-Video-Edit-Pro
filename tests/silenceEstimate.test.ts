import { describe, expect, it } from 'vitest';
import { estimateNoiseFloor } from '../src/core/silence';

describe('estimateNoiseFloor', () => {
  it('calibrates noise floor from quiet audio samples', () => {
    const sampleRate = 44_100;
    // 1 second of audio with low background noise (0.005) and speech bursts (0.5)
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate; i++) {
      if (i > sampleRate * 0.3 && i < sampleRate * 0.7) {
        samples[i] = 0.5 * Math.sin(i * 0.1); // speech
      } else {
        samples[i] = 0.005 * (Math.random() - 0.5); // room noise
      }
    }

    const res = estimateNoiseFloor(samples, sampleRate);
    expect(res.recommendedThresholdDb).toBeLessThan(-20);
    expect(res.recommendedThresholdDb).toBeGreaterThan(-55);
    expect(res.noiseFloorDb).toBeLessThan(res.speechPeakDb);
  });
});
