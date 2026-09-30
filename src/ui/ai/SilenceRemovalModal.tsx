import { AlertCircle, Check, Loader2, Play, Scissors, Sparkles, VolumeX, Wand2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SILENCE_OPTIONS,
  detectSilenceFromSamples,
  estimateNoiseFloor,
  type SilenceAnalysisResult,
  type SilenceDetectionOptions,
} from '../../core/silence';
import { removeSilenceFromClip, type SilenceCutMode } from '../../core/silenceOps';
import { useEditorStore } from '../../core/store';
import { formatTimecode } from '../../core/time';
import { getClip } from '../../core/timelineOps';
import type { Clip } from '../../core/types';
import { mixToMono } from '../../engine/silenceDetector';
import { SliderField, TextButton } from '../shared/controls';

interface SilenceRemovalModalProps {
  onClose(): void;
  initialClipId?: string;
}

export function SilenceRemovalModal({ onClose, initialClipId }: SilenceRemovalModalProps) {
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);

  const targetClips = project.clips.filter((c) => c.kind === 'video' || c.kind === 'audio');
  const defaultSelectedId =
    initialClipId ??
    selectedClipIds.find((id) => {
      const c = getClip(project, id);
      return c && (c.kind === 'video' || c.kind === 'audio');
    }) ??
    targetClips[0]?.id ??
    '';

  const [selectedClipId, setSelectedClipId] = useState<string>(defaultSelectedId);
  const [options, setOptions] = useState<SilenceDetectionOptions>(DEFAULT_SILENCE_OPTIONS);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<SilenceAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioSamples, setAudioSamples] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState<number>(44_100);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [autoDetectNotice, setAutoDetectNotice] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeClip: Clip | undefined = targetClips.find((c) => c.id === selectedClipId);
  const asset = activeClip?.assetId ? assets[activeClip.assetId] : undefined;

  // Load and decode audio data when selected clip changes
  useEffect(() => {
    if (!asset?.url) {
      setAudioSamples(null);
      setResult(null);
      return;
    }

    let cancelled = false;
    setAnalyzing(true);
    setError(null);
    setAppliedNotice(null);
    setAutoDetectNotice(null);

    const loadAudio = async () => {
      try {
        const res = await fetch(asset.url);
        const buffer = await res.arrayBuffer();
        const ctx = new (window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext)(1, 1, 44_100);
        const decoded = await ctx.decodeAudioData(buffer);
        if (cancelled) return;

        const mono = mixToMono(decoded);
        setAudioSamples(mono);
        setSampleRate(decoded.sampleRate);

        const resAnalysis = detectSilenceFromSamples(mono, decoded.sampleRate, options);
        if (cancelled) return;
        setResult(resAnalysis);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || 'Failed to decode audio track.');
        }
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    };

    loadAudio();
    return () => {
      cancelled = true;
    };
  }, [asset?.id, asset?.url]);

  // Re-run silence detection when options change
  useEffect(() => {
    if (!audioSamples) return;
    const resAnalysis = detectSilenceFromSamples(audioSamples, sampleRate, options);
    setResult(resAnalysis);
  }, [options, audioSamples, sampleRate]);

  // Handle auto-noise-floor detection
  const handleAutoDetect = () => {
    if (!audioSamples) return;
    const { recommendedThresholdDb, noiseFloorDb, speechPeakDb } = estimateNoiseFloor(audioSamples, sampleRate);
    setOptions((o) => ({ ...o, thresholdDb: recommendedThresholdDb }));
    setAutoDetectNotice(`Auto-calibrated: Noise floor ~${noiseFloorDb} dB, Speech peak ~${speechPeakDb} dB. Threshold set to ${recommendedThresholdDb} dB.`);
  };

  // Draw interactive waveform with color-coded speech (green) and silence (red/dim)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result || !audioSamples || !activeClip) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, width, height);

    const totalDur = result.totalDuration;
    if (totalDur <= 0) return;

    // Draw speech zones (green highlight) and silence zones (red highlight)
    for (const silence of result.silenceIntervals) {
      const x1 = (silence.start / totalDur) * width;
      const x2 = (silence.end / totalDur) * width;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
    }

    for (const speech of result.speechIntervals) {
      const x1 = (speech.start / totalDur) * width;
      const x2 = (speech.end / totalDur) * width;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
    }

    // Draw downsampled waveform peaks
    const bars = Math.min(width, 300);
    const samplesPerBar = Math.floor(audioSamples.length / bars);
    const midY = height / 2;

    for (let b = 0; b < bars; b++) {
      const start = b * samplesPerBar;
      const end = Math.min(audioSamples.length, start + samplesPerBar);
      let maxVal = 0;
      for (let i = start; i < end; i += Math.max(1, Math.floor((end - start) / 50))) {
        const v = Math.abs(audioSamples[i] ?? 0);
        if (v > maxVal) maxVal = v;
      }

      const barHeight = Math.max(2, maxVal * (height * 0.85));
      const x = (b / bars) * width;
      const timeSec = (b / bars) * totalDur;

      const isSilent = result.silenceIntervals.some((s) => s.start <= timeSec && timeSec <= s.end);
      ctx.fillStyle = isSilent ? '#ef4444' : '#22c55e';
      ctx.fillRect(x, midY - barHeight / 2, Math.max(1, width / bars - 1), barHeight);
    }

    // Active clip bounds indicator
    const clipStartSec = activeClip.offset / project.fps;
    const clipEndSec = (activeClip.offset + activeClip.duration * activeClip.speed) / project.fps;
    const clipX1 = (clipStartSec / totalDur) * width;
    const clipX2 = (clipEndSec / totalDur) * width;

    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.strokeRect(clipX1, 1, Math.max(2, clipX2 - clipX1), height - 2);
  }, [result, audioSamples, activeClip, project.fps]);

  const handleApply = (mode: SilenceCutMode) => {
    if (!activeClip || !result) return;
    const store = useEditorStore.getState();

    store.beginTransaction();
    const updated = removeSilenceFromClip(
      store.project,
      store.assets,
      activeClip.id,
      result.speechIntervals,
      mode,
    );
    store.updateClip(activeClip.id, {}); // Touch store
    useEditorStore.setState({ project: updated });
    store.endTransaction();

    const modeLabels: Record<SilenceCutMode, string> = {
      ripple: 'Applied Jump Cuts & closed silence gaps!',
      split: 'Split clip at silence points.',
      mute: 'Muted audio during silence intervals.',
    };
    setAppliedNotice(modeLabels[mode]);

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
              <Sparkles size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">AI Auto Cut Silence (ตัดช่วงเงียบ)</h3>
              <p className="text-[11px] text-neutral-400">Detect pauses, remove dead air, and create instant jump cuts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {/* Clip Selector & Auto-Calibrate */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-300">Target Clip</label>
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={!audioSamples}
                className="flex items-center gap-1.5 rounded-md border border-purple-500/40 bg-purple-500/15 px-2 py-1 text-[11px] font-semibold text-purple-200 hover:bg-purple-500/25 active:scale-95 disabled:opacity-50"
              >
                <Wand2 size={12} className="text-purple-400" />
                Auto-Detect Noise Level
              </button>
            </div>
            {targetClips.length === 0 ? (
              <p className="text-xs text-neutral-500">No video or audio clips found on the timeline.</p>
            ) : (
              <select
                value={selectedClipId}
                onChange={(e) => setSelectedClipId(e.target.value)}
                className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
              >
                {targetClips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({formatTimecode(c.duration, project.fps)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Waveform Visualization */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="font-medium">Audio Detection Waveform</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Speech (Kept)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Silence (Cut)
                </span>
              </div>
            </div>

            <div className="relative h-24 w-full overflow-hidden rounded-lg border border-line bg-neutral-950">
              {analyzing ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-neutral-400">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  Analyzing audio energy…
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-red-400">
                  <AlertCircle size={16} />
                  {error}
                </div>
              ) : (
                <canvas ref={canvasRef} width={600} height={96} className="h-full w-full" />
              )}
            </div>
          </div>

          {/* Statistics summary */}
          {result && (
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border border-line bg-neutral-900/80 p-2.5 text-center">
                <div className="text-[10px] uppercase text-neutral-400">Pauses Found</div>
                <div className="text-sm font-semibold text-neutral-100">{result.silenceIntervals.length}</div>
              </div>
              <div className="rounded-lg border border-line bg-neutral-900/80 p-2.5 text-center">
                <div className="text-[10px] uppercase text-neutral-400">Silence Cut</div>
                <div className="text-sm font-semibold text-red-400">-{result.silenceDuration}s</div>
              </div>
              <div className="rounded-lg border border-line bg-neutral-900/80 p-2.5 text-center">
                <div className="text-[10px] uppercase text-neutral-400">New Length</div>
                <div className="text-sm font-semibold text-green-400">{result.speechDuration}s</div>
              </div>
              <div className="rounded-lg border border-line bg-neutral-900/80 p-2.5 text-center">
                <div className="text-[10px] uppercase text-neutral-400">Time Saved</div>
                <div className="text-sm font-semibold text-purple-400">{result.savedPercent}%</div>
              </div>
            </div>
          )}

          {/* Parameters Controls */}
          <div className="space-y-3 rounded-lg border border-line bg-neutral-900/40 p-3.5">
            <h4 className="text-xs font-semibold text-neutral-300">Detection Sensitivity</h4>

            <SliderField
              label="Volume Threshold"
              value={options.thresholdDb ?? -35}
              min={-55}
              max={-15}
              step={1}
              unit="dB"
              decimals={0}
              onChange={(v) => setOptions((o) => ({ ...o, thresholdDb: v }))}
            />

            <SliderField
              label="Minimum Pause Duration"
              value={options.minSilenceDuration ?? 0.4}
              min={0.1}
              max={2.0}
              step={0.05}
              unit="s"
              onChange={(v) => setOptions((o) => ({ ...o, minSilenceDuration: v }))}
            />

            <SliderField
              label="Speech Padding Buffer"
              value={options.padding ?? 0.08}
              min={0.0}
              max={0.3}
              step={0.01}
              unit="s"
              onChange={(v) => setOptions((o) => ({ ...o, padding: v }))}
            />
          </div>

          {autoDetectNotice && (
            <div className="flex items-center gap-2 rounded-lg bg-purple-500/15 p-3 text-xs text-purple-200">
              <Sparkles size={16} className="text-purple-400 shrink-0" />
              {autoDetectNotice}
            </div>
          )}

          {appliedNotice && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/15 p-3 text-xs text-green-300">
              <Check size={16} className="shrink-0" />
              {appliedNotice}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-line bg-neutral-900/60 px-5 py-3">
          <TextButton variant="ghost" onClick={onClose}>
            Cancel
          </TextButton>

          <div className="flex items-center gap-2">
            <TextButton
              variant="solid"
              onClick={() => handleApply('mute')}
              disabled={!result || result.silenceIntervals.length === 0}
            >
              <VolumeX size={14} /> Mute Silences
            </TextButton>

            <TextButton
              variant="solid"
              onClick={() => handleApply('split')}
              disabled={!result || result.silenceIntervals.length === 0}
            >
              <Scissors size={14} /> Split Only
            </TextButton>

            <TextButton
              variant="accent"
              onClick={() => handleApply('ripple')}
              disabled={!result || result.silenceIntervals.length === 0}
            >
              <Play size={14} /> Jump Cut &amp; Ripple
            </TextButton>
          </div>
        </div>
      </div>
    </div>
  );
}
