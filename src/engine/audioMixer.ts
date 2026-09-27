/**
 * Web Audio mixer. Routes every media element through its own GainNode so per-clip volume works
 * on iOS (where `HTMLMediaElement.volume` is read-only) and so the mix can be captured for export.
 * Falls back to `element.volume` when Web Audio is unavailable or refuses an element.
 */

import { clamp } from '../core/time';

interface ElementNodes {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

type AudioContextCtor = typeof AudioContext;

function resolveAudioContext(): AudioContextCtor | null {
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private readonly nodes = new WeakMap<HTMLMediaElement, ElementNodes>();
  private readonly rejected = new WeakSet<HTMLMediaElement>();

  /** Create/resume the context. MUST be called synchronously from a user gesture. */
  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return true;
    }
    const Ctor = resolveAudioContext();
    if (!Ctor) return false;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  setElementGain(el: HTMLMediaElement, gain: number): void {
    const value = clamp(gain, 0, 2);
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.rejected.has(el)) {
      this.applyElementFallback(el, value);
      return;
    }

    let entry = this.nodes.get(el);
    if (!entry) {
      try {
        const source = ctx.createMediaElementSource(el);
        const gainNode = ctx.createGain();
        gainNode.gain.value = value;
        source.connect(gainNode);
        gainNode.connect(master);
        entry = { source, gain: gainNode };
        this.nodes.set(el, entry);
        el.volume = 1;
        el.muted = false;
        return;
      } catch {
        this.rejected.add(el);
        this.applyElementFallback(el, value);
        return;
      }
    }

    if (Math.abs(entry.gain.gain.value - value) > 1e-4) {
      // Short ramp avoids zipper noise when scrubbing sliders.
      entry.gain.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
    }
  }

  private applyElementFallback(el: HTMLMediaElement, value: number): void {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(el.volume - clamped) > 1e-4) el.volume = clamped;
    const shouldMute = value <= 0;
    if (el.muted !== shouldMute) el.muted = shouldMute;
  }

  /** A MediaStream carrying the full mix (for MediaRecorder export). */
  captureStream(): MediaStream | null {
    if (!this.ctx || !this.master) return null;
    if (!this.streamDestination) {
      this.streamDestination = this.ctx.createMediaStreamDestination();
      this.master.connect(this.streamDestination);
    }
    return this.streamDestination.stream;
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.streamDestination = null;
  }
}
