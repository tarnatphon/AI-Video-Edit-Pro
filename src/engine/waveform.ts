/**
 * Waveform peaks for the timeline. Decodes the audio track of a file with the Web Audio API
 * (works for mp3/wav/m4a and for the audio inside mp4/webm) and reduces it to `buckets`
 * absolute peak values in [0, 1].
 */

const MAX_DECODE_BYTES = 300 * 1024 * 1024;
/** Cap the number of samples visited so 1-hour files stay fast. */
const MAX_SAMPLES_VISITED = 24_000_000;

type OfflineCtor = typeof OfflineAudioContext;

function resolveOfflineContext(): OfflineCtor | null {
  const w = window as Window & { webkitOfflineAudioContext?: OfflineCtor };
  return window.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

function decode(ctx: OfflineAudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
  // Callback form works on every browser (Safari added the promise form late).
  return new Promise((resolve, reject) => {
    const maybePromise = ctx.decodeAudioData(buffer, resolve, (err) => reject(err ?? new Error('decode failed')));
    if (maybePromise && typeof (maybePromise as Promise<AudioBuffer>).catch === 'function') {
      (maybePromise as Promise<AudioBuffer>).catch(() => undefined);
    }
  });
}

export function reducePeaks(channels: readonly Float32Array[], buckets: number): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0 || channels.length === 0) return [];
  const count = Math.max(1, Math.min(buckets, length));
  const samplesPerBucket = length / count;
  const step = Math.max(1, Math.floor((length * channels.length) / MAX_SAMPLES_VISITED));
  const peaks = new Array<number>(count).fill(0);

  for (let b = 0; b < count; b++) {
    const from = Math.floor(b * samplesPerBucket);
    const to = Math.min(length, Math.floor((b + 1) * samplesPerBucket));
    let peak = 0;
    for (const channel of channels) {
      for (let i = from; i < to; i += step) {
        const v = Math.abs(channel[i]!);
        if (v > peak) peak = v;
      }
    }
    peaks[b] = Math.min(1, peak);
  }
  return peaks;
}

export async function computeWaveform(file: Blob, buckets = 1200): Promise<number[] | null> {
  if (file.size > MAX_DECODE_BYTES) return null;
  const Ctor = resolveOfflineContext();
  if (!Ctor) return null;
  try {
    const bytes = await file.arrayBuffer();
    const ctx = new Ctor(1, 1, 44_100);
    const audio = await decode(ctx, bytes);
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
    return reducePeaks(channels, buckets);
  } catch {
    return null;
  }
}
