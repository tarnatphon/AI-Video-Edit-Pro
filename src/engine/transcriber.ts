/**
 * Speech-to-Text and Whisper AI Transcriber Engine.
 *
 * Supported engines:
 *  1. In-Browser Whisper AI (Transformers.js / ONNX) — 100% Client-side, private, offline.
 *  2. Built-in Web Speech API — Instant native speech recognition.
 *  3. Cloud Whisper API (OpenAI / Groq / Local Whisper server).
 *  4. SRT / VTT parser.
 */

import { newId } from '../core/id';
import { parseSRT, parseVTT, type SubtitleSegment } from '../core/subtitles';
import type { MediaAsset } from '../core/types';
import { mixToMono } from './silenceDetector';

export type TranscribeProvider = 'browser-whisper' | 'web-speech' | 'whisper-api' | 'manual-srt';

export interface TranscribeProgress {
  stage: string;
  percent: number;
}

export interface TranscribeOptions {
  provider: TranscribeProvider;
  /** Language code: 'auto', 'th', 'en', 'es', 'fr', 'de', 'ja', 'zh', etc. */
  language?: string | undefined;
  /** Whisper model: 'tiny', 'base', 'small', 'whisper-1', 'whisper-large-v3-turbo' */
  model?: 'tiny' | 'base' | 'small' | 'whisper-1' | 'whisper-large-v3-turbo' | undefined;
  /** API key for OpenAI / Groq / custom endpoint */
  apiKey?: string | undefined;
  /** Base API URL (e.g. https://api.openai.com/v1 or https://api.groq.com/openai/v1) */
  apiEndpoint?: string | undefined;
  onProgress?: ((progress: TranscribeProgress) => void) | undefined;
}

type OfflineCtor = typeof OfflineAudioContext;

function resolveOfflineContext(): OfflineCtor | null {
  const w = window as Window & { webkitOfflineAudioContext?: OfflineCtor };
  return window.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

async function decodeAudioFile(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const Ctor = resolveOfflineContext();
  if (!Ctor) throw new Error('OfflineAudioContext is not available.');
  const ctx = new Ctor(1, 1, 44_100);
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(
      arrayBuffer,
      resolve,
      (err) => reject(err ?? new Error('Audio decoding failed')),
    );
  });
}

/**
 * Resample a Float32Array to 16,000 Hz (Whisper requirement).
 */
export function resampleTo16k(audioBuffer: AudioBuffer): Float32Array {
  const mono = mixToMono(audioBuffer);
  const srcRate = audioBuffer.sampleRate;
  const targetRate = 16_000;

  if (srcRate === targetRate) return mono;

  const ratio = srcRate / targetRate;
  const targetLength = Math.round(mono.length / ratio);
  const resampled = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const fraction = srcIndex - i0;
    resampled[i] = (mono[i0] ?? 0) * (1 - fraction) + (mono[i1] ?? 0) * fraction;
  }

  return resampled;
}

/**
 * Encode an AudioBuffer into a standard 16-bit PCM WAV Blob.
 */
export function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = 16_000;
  const samples = resampleTo16k(audioBuffer);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples (clamp and scale to 16-bit int)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/* ------------------------------------------------------------------------------------------------
 * Transcribe Implementation: In-Browser Whisper AI (Transformers.js)
 * --------------------------------------------------------------------------------------------- */

let pipelineCache: unknown = null;

async function transcribeWithBrowserWhisper(
  audioBuffer: AudioBuffer,
  options: TranscribeOptions,
): Promise<SubtitleSegment[]> {
  options.onProgress?.({ stage: 'Loading Whisper AI model…', percent: 15 });

  const modelName = `Xenova/whisper-${options.model || 'tiny'}`;

  // Dynamically load Transformers.js from CDN in browser
  const dynamicImport = new Function('url', 'return import(url)') as (
    url: string,
  ) => Promise<{
    pipeline?: (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
    default?: { pipeline?: (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown> };
  }>;
  const transformers = await dynamicImport('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
  const pipeline = transformers.pipeline || transformers.default?.pipeline;

  if (!pipeline) {
    throw new Error('Could not load Transformers.js pipeline.');
  }

  options.onProgress?.({ stage: 'Initializing Whisper pipeline…', percent: 35 });

  if (!pipelineCache) {
    pipelineCache = await pipeline('automatic-speech-recognition', modelName, {
      progress_callback: (p: { status: string; progress?: number }) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          options.onProgress?.({
            stage: `Downloading model weights (${Math.round(p.progress)}%)…`,
            percent: 15 + Math.round(p.progress * 0.35),
          });
        }
      },
    });
  }

  options.onProgress?.({ stage: 'Resampling audio to 16kHz…', percent: 60 });
  const audio16k = resampleTo16k(audioBuffer);

  options.onProgress?.({ stage: 'Transcribing speech with Whisper AI…', percent: 75 });

  const asr = pipelineCache as (
    audio: Float32Array,
    opts: Record<string, unknown>,
  ) => Promise<{
    text: string;
    chunks?: { text: string; timestamp: [number, number | null] }[];
  }>;

  const language = options.language && options.language !== 'auto' ? options.language : undefined;
  const result = await asr(audio16k, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    language,
    task: 'transcribe',
  });

  options.onProgress?.({ stage: 'Formatting subtitles…', percent: 95 });

  const segments: SubtitleSegment[] = [];
  if (result.chunks && result.chunks.length > 0) {
    for (const chunk of result.chunks) {
      const text = chunk.text.trim();
      if (!text) continue;
      const start = chunk.timestamp[0] ?? 0;
      const end = chunk.timestamp[1] ?? start + 2.0;
      segments.push({
        id: newId('sub'),
        start: Number(start.toFixed(3)),
        end: Number(Math.max(start + 0.5, end).toFixed(3)),
        text,
      });
    }
  } else if (result.text && result.text.trim()) {
    segments.push({
      id: newId('sub'),
      start: 0,
      end: Number((audioBuffer.duration || 3).toFixed(3)),
      text: result.text.trim(),
    });
  }

  options.onProgress?.({ stage: 'Done', percent: 100 });
  return segments;
}

/* ------------------------------------------------------------------------------------------------
 * Transcribe Implementation: Web Speech API
 * --------------------------------------------------------------------------------------------- */

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string; confidence: number };
    };
  };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function resolveSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function transcribeWithWebSpeech(
  audioBuffer: AudioBuffer,
  options: TranscribeOptions,
): Promise<SubtitleSegment[]> {
  const Ctor = resolveSpeechRecognition();
  if (!Ctor) {
    throw new Error('Web Speech API is not supported in this browser. Please use Whisper AI or API.');
  }

  options.onProgress?.({ stage: 'Listening with browser Speech Engine…', percent: 30 });

  return new Promise((resolve) => {
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = options.language === 'th' ? 'th-TH' : options.language || 'en-US';

    const segments: SubtitleSegment[] = [];
    const startTime = Date.now();
    let lastSegmentEnd = 0;

    recognition.onresult = (event) => {
      const elapsed = (Date.now() - startTime) / 1000;
      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        if (item?.isFinal) {
          const text = item[0]?.transcript?.trim();
          if (text) {
            const start = lastSegmentEnd;
            const end = Math.min(audioBuffer.duration, Math.max(start + 1.2, elapsed));
            segments.push({
              id: newId('sub'),
              start: Number(start.toFixed(3)),
              end: Number(end.toFixed(3)),
              text,
            });
            lastSegmentEnd = end;
          }
        }
      }
    };

    recognition.onerror = () => {
      resolve(segments);
    };

    recognition.onend = () => {
      options.onProgress?.({ stage: 'Done', percent: 100 });
      resolve(segments);
    };

    try {
      recognition.start();
      // Stop after audio duration plus buffer
      setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          resolve(segments);
        }
      }, Math.min(30_000, Math.round(audioBuffer.duration * 1000) + 1500));
    } catch {
      resolve(segments);
    }
  });
}

/* ------------------------------------------------------------------------------------------------
 * Transcribe Implementation: OpenAI / Groq / Whisper API
 * --------------------------------------------------------------------------------------------- */

interface WhisperApiSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface WhisperApiResponse {
  text: string;
  segments?: WhisperApiSegment[];
}

async function transcribeWithWhisperApi(
  audioBuffer: AudioBuffer,
  options: TranscribeOptions,
): Promise<SubtitleSegment[]> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Please provide an API key for Whisper cloud transcription.');
  }

  options.onProgress?.({ stage: 'Preparing audio for Whisper API…', percent: 20 });
  const wavBlob = audioBufferToWav(audioBuffer);

  const endpoint = options.apiEndpoint?.trim() || 'https://api.openai.com/v1';
  const url = `${endpoint.replace(/\/+$/, '')}/audio/transcriptions`;

  const formData = new FormData();
  formData.append('file', wavBlob, 'audio.wav');
  formData.append('model', options.model || 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');
  if (options.language && options.language !== 'auto') {
    formData.append('language', options.language);
  }

  options.onProgress?.({ stage: 'Uploading and transcribing with Whisper…', percent: 50 });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Whisper API error (${res.status}): ${errText || res.statusText}`);
  }

  options.onProgress?.({ stage: 'Processing transcription response…', percent: 90 });
  const data = (await res.json()) as WhisperApiResponse;

  const segments: SubtitleSegment[] = [];
  if (data.segments && data.segments.length > 0) {
    for (const seg of data.segments) {
      const text = seg.text?.trim();
      if (!text) continue;
      segments.push({
        id: newId('sub'),
        start: Number(seg.start.toFixed(3)),
        end: Number(seg.end.toFixed(3)),
        text,
      });
    }
  } else if (data.text?.trim()) {
    segments.push({
      id: newId('sub'),
      start: 0,
      end: Number(audioBuffer.duration.toFixed(3)),
      text: data.text.trim(),
    });
  }

  options.onProgress?.({ stage: 'Done', percent: 100 });
  return segments;
}

/* ------------------------------------------------------------------------------------------------
 * Main Entry Point
 * --------------------------------------------------------------------------------------------- */

/**
 * Transcribe an asset or audio buffer using the configured provider.
 */
export async function transcribeAsset(
  asset: MediaAsset,
  options: TranscribeOptions,
): Promise<SubtitleSegment[]> {
  if (!asset.url) {
    throw new Error('Asset URL is not available.');
  }

  options.onProgress?.({ stage: 'Decoding media audio…', percent: 10 });
  const audioBuffer = await decodeAudioFile(asset.url);

  switch (options.provider) {
    case 'browser-whisper':
      return transcribeWithBrowserWhisper(audioBuffer, options);
    case 'web-speech':
      return transcribeWithWebSpeech(audioBuffer, options);
    case 'whisper-api':
      return transcribeWithWhisperApi(audioBuffer, options);
    case 'manual-srt':
      return [];
    default:
      throw new Error(`Unknown transcription provider: ${options.provider}`);
  }
}

/**
 * Import subtitles from SRT or VTT file content.
 */
export function importSubtitlesFromText(content: string, filename?: string): SubtitleSegment[] {
  const isVtt = filename?.endsWith('.vtt') || content.trim().startsWith('WEBVTT');
  if (isVtt) {
    return parseVTT(content);
  }
  return parseSRT(content);
}
