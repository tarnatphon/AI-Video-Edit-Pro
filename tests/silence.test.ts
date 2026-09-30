import { describe, expect, it } from 'vitest';
import {
  amplitudeToDb,
  calculateRms,
  dbToAmplitude,
  detectSilenceFromSamples,
} from '../src/core/silence';

describe('silence detection math', () => {
  it('converts amplitude to dB correctly', () => {
    expect(amplitudeToDb(1.0)).toBeCloseTo(0);
    expect(amplitudeToDb(0.1)).toBeCloseTo(-20);
    expect(amplitudeToDb(0.01)).toBeCloseTo(-40);
    expect(amplitudeToDb(0.001)).toBeCloseTo(-60);
    expect(amplitudeToDb(0)).toBe(-100);
  });

  it('converts dB to amplitude correctly', () => {
    expect(dbToAmplitude(0)).toBeCloseTo(1.0);
    expect(dbToAmplitude(-20)).toBeCloseTo(0.1);
    expect(dbToAmplitude(-40)).toBeCloseTo(0.01);
  });

  it('computes RMS energy accurately', () => {
    const samples = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    expect(calculateRms(samples, 0, 4)).toBeCloseTo(0.5);
  });
});

describe('detectSilenceFromSamples', () => {
  const sampleRate = 1000; // 1000 samples per second for easy testing

  it('handles empty samples', () => {
    const result = detectSilenceFromSamples(new Float32Array(0), sampleRate);
    expect(result.totalDuration).toBe(0);
    expect(result.silenceIntervals).toHaveLength(0);
    expect(result.speechIntervals).toHaveLength(0);
  });

  it('detects pure silence', () => {
    // 2 seconds of pure silence
    const samples = new Float32Array(sampleRate * 2).fill(0);
    const result = detectSilenceFromSamples(samples, sampleRate, {
      thresholdDb: -30,
      minSilenceDuration: 0.3,
      padding: 0,
    });

    expect(result.totalDuration).toBe(2);
    expect(result.speechIntervals).toHaveLength(0);
    expect(result.silenceIntervals.length).toBeGreaterThanOrEqual(1);
    expect(result.savedPercent).toBe(100);
  });

  it('detects continuous speech with no silence', () => {
    // 2 seconds of sine wave speech (amplitude 0.5 = -6dB)
    const samples = new Float32Array(sampleRate * 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.5 * Math.sin((i / sampleRate) * 2 * Math.PI * 100);
    }

    const result = detectSilenceFromSamples(samples, sampleRate, {
      thresholdDb: -30,
      minSilenceDuration: 0.3,
      padding: 0,
    });

    expect(result.totalDuration).toBe(2);
    expect(result.speechIntervals.length).toBe(1);
    expect(result.silenceIntervals).toHaveLength(0);
    expect(result.savedPercent).toBe(0);
  });

  it('detects speech separated by silence gaps and applies padding', () => {
    // 3 seconds: 0-1s speech, 1-2s silence, 2-3s speech
    const samples = new Float32Array(sampleRate * 3);
    // Speech segment 1: 0 to 1s
    for (let i = 0; i < sampleRate * 1; i++) {
      samples[i] = 0.6 * Math.sin(i * 0.1);
    }
    // Silence: 1s to 2s is left at 0
    // Speech segment 2: 2s to 3s
    for (let i = sampleRate * 2; i < sampleRate * 3; i++) {
      samples[i] = 0.6 * Math.sin(i * 0.1);
    }

    const result = detectSilenceFromSamples(samples, sampleRate, {
      thresholdDb: -30,
      minSilenceDuration: 0.4,
      minSpeechDuration: 0.2,
      padding: 0.05,
    });

    expect(result.totalDuration).toBe(3);
    expect(result.speechIntervals.length).toBe(2);
    expect(result.silenceIntervals.length).toBe(1);
    expect(result.silenceIntervals[0]!.start).toBeGreaterThanOrEqual(0.95);
    expect(result.silenceIntervals[0]!.end).toBeLessThanOrEqual(2.05);
  });
});
