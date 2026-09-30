/**
 * Subtitle domain models, presets, SRT/VTT parsers, serializers, and Karaoke support.
 */

import { newId } from './id';

export interface SubtitleWord {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface SubtitleSegment {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  words?: SubtitleWord[] | undefined;
}

export interface SubtitleStylePreset {
  id: string;
  name: string;
  description: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  background: string | null;
  /** Vertical offset in project pixels from canvas centre (+350 is near the bottom). */
  yOffset: number;
  /** Highlight words dynamically as spoken (TikTok/Reels karaoke style). */
  karaoke?: boolean | undefined;
  activeWordColor?: string | undefined;
}

export const SUBTITLE_PRESETS: readonly SubtitleStylePreset[] = [
  {
    id: 'tiktok-karaoke',
    name: 'TikTok Karaoke Pop 🔥',
    description: 'Active word highlight with vibrant neon yellow & dark translucent pill',
    fontSize: 72,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
    color: '#ffffff',
    bold: true,
    italic: false,
    align: 'center',
    background: '#000000cc',
    yOffset: 340,
    karaoke: true,
    activeWordColor: '#ffe600',
  },
  {
    id: 'tiktok',
    name: 'TikTok / Reels Classic',
    description: 'High-energy yellow bold text with dark translucent box',
    fontSize: 68,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
    color: '#ffe600',
    bold: true,
    italic: false,
    align: 'center',
    background: '#000000cc',
    yOffset: 340,
  },
  {
    id: 'modern',
    name: 'Modern Clean',
    description: 'Crisp white typography with soft rounded contrast pill',
    fontSize: 54,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
    color: '#ffffff',
    bold: true,
    italic: false,
    align: 'center',
    background: '#18181bcc',
    yOffset: 360,
  },
  {
    id: 'cinema',
    name: 'Cinema Classic',
    description: 'Traditional film subtitle font with crisp legibility',
    fontSize: 48,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
    color: '#ffffff',
    bold: false,
    italic: false,
    align: 'center',
    background: null,
    yOffset: 380,
  },
  {
    id: 'highlight',
    name: 'High-Contrast Box',
    description: 'Bold black text on bright yellow highlight background',
    fontSize: 60,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
    color: '#000000',
    bold: true,
    italic: false,
    align: 'center',
    background: '#ffd600',
    yOffset: 340,
  },
  {
    id: 'minimal',
    name: 'Minimalist',
    description: 'Subtle white clean text without background box',
    fontSize: 44,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
    color: '#f4f4f5',
    bold: true,
    italic: false,
    align: 'center',
    background: null,
    yOffset: 390,
  },
];

/* ------------------------------------------------------------------------------------------------
 * Timestamps & Formatters
 * --------------------------------------------------------------------------------------------- */

/**
 * Format seconds into SRT timestamp `HH:MM:SS,mmm`.
 */
export function formatSrtTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Format seconds into VTT timestamp `HH:MM:SS.mmm`.
 */
export function formatVttTimestamp(seconds: number): string {
  return formatSrtTimestamp(seconds).replace(',', '.');
}

/**
 * Parse a timestamp string (`00:01:23,456` or `01:23.456` or `83.456`) into seconds.
 */
export function parseTimestamp(timeStr: string): number {
  const cleaned = timeStr.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = Number.parseFloat(parts[0]!) || 0;
    const m = Number.parseFloat(parts[1]!) || 0;
    const s = Number.parseFloat(parts[2]!) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = Number.parseFloat(parts[0]!) || 0;
    const s = Number.parseFloat(parts[1]!) || 0;
    return m * 60 + s;
  }
  return Number.parseFloat(cleaned) || 0;
}

/* ------------------------------------------------------------------------------------------------
 * Parsers & Generators
 * --------------------------------------------------------------------------------------------- */

/**
 * Parse an SRT (SubRip) formatted string into SubtitleSegments.
 */
export function parseSRT(srtContent: string): SubtitleSegment[] {
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/);
  const segments: SubtitleSegment[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Handle optional index line
    let timeLineIndex = 0;
    if (/^\d+$/.test(lines[0]!.trim()) && lines.length >= 3) {
      timeLineIndex = 1;
    }

    const timeLine = lines[timeLineIndex]!;
    const timeMatch = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})/);
    if (!timeMatch) continue;

    const start = parseTimestamp(timeMatch[1]!);
    const end = parseTimestamp(timeMatch[2]!);
    const textLines = lines.slice(timeLineIndex + 1);
    const text = textLines.join('\n').trim();

    if (text && end > start) {
      // Generate synthetic word timestamps if words not present
      const words = text.split(/\s+/).map((w, idx, arr) => {
        const step = (end - start) / arr.length;
        return {
          word: w,
          start: start + idx * step,
          end: start + (idx + 1) * step,
        };
      });

      segments.push({
        id: newId('sub'),
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text,
        words,
      });
    }
  }

  return segments;
}

/**
 * Parse a WebVTT formatted string into SubtitleSegments.
 */
export function parseVTT(vttContent: string): SubtitleSegment[] {
  const normalized = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  // Strip WEBVTT header
  const body = normalized.replace(/^WEBVTT[^\n]*\n+/i, '');
  return parseSRT(body);
}

/**
 * Combine all subtitle segments into a continuous script for Voiceover TTS.
 */
export function convertSubtitlesToVoiceoverScript(segments: readonly SubtitleSegment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ');
}

/* ------------------------------------------------------------------------------------------------
 * Serializers
 * --------------------------------------------------------------------------------------------- */

/**
 * Export SubtitleSegments to SubRip (.srt) format.
 */
export function exportToSRT(segments: readonly SubtitleSegment[]): string {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  return sorted
    .map((seg, index) => {
      const idx = index + 1;
      const start = formatSrtTimestamp(seg.start);
      const end = formatSrtTimestamp(seg.end);
      return `${idx}\n${start} --> ${end}\n${seg.text.trim()}\n`;
    })
    .join('\n');
}

/**
 * Export SubtitleSegments to WebVTT (.vtt) format.
 */
export function exportToVTT(segments: readonly SubtitleSegment[]): string {
  const srtBody = exportToSRT(segments);
  const vttBody = srtBody
    .split('\n')
    .map((line) => {
      if (line.includes('-->')) {
        return line.replace(/,/g, '.');
      }
      return line;
    })
    .join('\n');

  return `WEBVTT\n\n${vttBody}`;
}
