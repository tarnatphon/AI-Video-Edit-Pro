import { Download, FastForward, Film, Image as ImageIcon, Smartphone, Video, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../core/store';
import { downloadBlob, exportRealtime, exportSupported, pickMimeType, type ExportResult } from '../../engine/exporter';
import { fastExportVideo, isWebCodecsSupported, type FastExportProgress } from '../../engine/fastExporter';
import { exportToGif, type GifExportProgress } from '../../engine/gifExporter';
import { getEngine } from '../../engine/playback';
import { TextButton } from '../shared/controls';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: number; stage?: string; fps?: number }
  | { kind: 'done'; result: ExportResult }
  | { kind: 'error'; message: string };

interface SocialPreset {
  id: string;
  name: string;
  icon: 'phone' | 'video' | 'gif';
  width: number;
  height: number;
  fps: number;
  desc: string;
}

const SOCIAL_PRESETS: readonly SocialPreset[] = [
  { id: 'tiktok', name: 'TikTok / Reels', icon: 'phone', width: 1080, height: 1920, fps: 30, desc: 'Vertical 9:16 optimized for mobile feeds' },
  { id: 'youtube', name: 'YouTube 1080p', icon: 'video', width: 1920, height: 1080, fps: 30, desc: 'Widescreen 16:9 HD high bitrate' },
  { id: 'square', name: 'Instagram Square', icon: 'phone', width: 1080, height: 1080, fps: 30, desc: 'Square 1:1 post format' },
  { id: 'gif', name: 'Animated GIF', icon: 'gif', width: 480, height: 480, fps: 12, desc: 'Lightweight animated GIF for memes & stickers' },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [exportMode, setExportMode] = useState<'fast' | 'realtime'>('fast');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('project');
  const abortRef = useRef<AbortController | null>(null);

  const project = useEditorStore((s) => s.project);
  const projectName = project.name;
  const width = project.width;
  const height = project.height;
  const fps = project.fps;

  const supported = exportSupported();
  const webcodecs = isWebCodecsSupported();
  const mime = pickMimeType();

  useEffect(() => () => abortRef.current?.abort(), []);

  const safeName = projectName.replace(/[^\w.\-]+/g, '_') || 'export';
  
  // Calculate final target resolution based on selected preset
  const preset = SOCIAL_PRESETS.find((p) => p.id === selectedPresetId);
  const targetW = preset ? preset.width : width;
  const targetH = preset ? preset.height : height;
  const targetFps = preset ? preset.fps : fps;
  const isGif = selectedPresetId === 'gif';

  const scale = Math.min(1, 1920 / Math.max(targetW, targetH));
  const outW = Math.round(targetW * scale);
  const outH = Math.round(targetH * scale);

  const start = (): void => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'running', progress: 0, stage: 'Preparing export…' });

    if (isGif) {
      exportToGif(project, outW, outH, targetFps, (p: GifExportProgress) => {
        setPhase({
          kind: 'running',
          progress: p.percent / 100,
          stage: `Encoding GIF frame ${p.currentFrame + 1}/${p.totalFrames}…`,
        });
      })
        .then((blob) => {
          setPhase({ kind: 'done', result: { blob, mimeType: 'image/gif', extension: 'gif' } });
        })
        .catch((error: unknown) => {
          setPhase({ kind: 'error', message: error instanceof Error ? error.message : 'GIF export failed' });
        });
      return;
    }

    if (exportMode === 'fast') {
      fastExportVideo(
        {
          project,
          width: outW,
          height: outH,
          fps: targetFps,
          onProgress: (p: FastExportProgress) =>
            setPhase({
              kind: 'running',
              progress: p.percent / 100,
              stage: p.stage,
              fps: p.fps,
            }),
        },
        controller.signal,
      )
        .then((blob) => {
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
          setPhase({ kind: 'done', result: { blob, mimeType: blob.type, extension: ext as 'mp4' | 'webm' } });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            setPhase({ kind: 'idle' });
            return;
          }
          setPhase({ kind: 'error', message: error instanceof Error ? error.message : 'Fast export failed' });
        });
    } else {
      exportRealtime(getEngine(), {
        signal: controller.signal,
        onProgress: (progress) =>
          setPhase((p) => (p.kind === 'running' ? { kind: 'running', progress, stage: 'Real-time rendering…' } : p)),
      })
        .then((result) => setPhase({ kind: 'done', result }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            setPhase({ kind: 'idle' });
            return;
          }
          setPhase({ kind: 'error', message: error instanceof Error ? error.message : 'Export failed' });
        });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Export video">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Export &amp; Share Video</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Social Presets */}
        <div className="mb-3 space-y-1">
          <label className="text-xs font-medium text-neutral-300">Format &amp; Social Presets</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setSelectedPresetId('project')}
              className={`rounded-lg border p-2 text-left transition-colors ${
                selectedPresetId === 'project'
                  ? 'border-accent bg-accent/15 text-neutral-100'
                  : 'border-line bg-neutral-900/50 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              <div className="text-[11px] font-semibold">Project ({width}×{height})</div>
              <div className="text-[9px]">Original Aspect</div>
            </button>

            {SOCIAL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPresetId(p.id)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  selectedPresetId === p.id
                    ? 'border-accent bg-accent/15 text-neutral-100'
                    : 'border-line bg-neutral-900/50 text-neutral-400 hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-1 text-[11px] font-semibold">
                  {p.icon === 'phone' ? <Smartphone size={11} className="text-accent" /> : p.icon === 'gif' ? <ImageIcon size={11} className="text-pink-400" /> : <Video size={11} />}
                  {p.name}
                </div>
                <div className="text-[9px]">{p.width}×{p.height}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Export Engine Mode */}
        {!isGif && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setExportMode('fast')}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                exportMode === 'fast'
                  ? 'border-accent bg-accent/10 text-neutral-100'
                  : 'border-line bg-neutral-900/50 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              <FastForward size={16} className={exportMode === 'fast' ? 'text-accent' : ''} />
              <div>
                <div className="text-xs font-semibold">Fast Offline Render</div>
                <div className="text-[10px] text-neutral-400">Max hardware speed (WebCodecs)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExportMode('realtime')}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                exportMode === 'realtime'
                  ? 'border-accent bg-accent/10 text-neutral-100'
                  : 'border-line bg-neutral-900/50 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              <Film size={16} className={exportMode === 'realtime' ? 'text-accent' : ''} />
              <div>
                <div className="text-xs font-semibold">Real-time Capture</div>
                <div className="text-[10px] text-neutral-400">Standard preview stream (1×)</div>
              </div>
            </button>
          </div>
        )}

        <dl className="mb-3 grid grid-cols-2 gap-y-1 text-xs text-neutral-400">
          <dt>Resolution</dt>
          <dd className="text-neutral-200">
            {outW}×{outH} · {targetFps} fps
          </dd>
          <dt>Format</dt>
          <dd className="text-neutral-200">
            {isGif ? 'Animated GIF (.gif)' : mime ? (mime.includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9/VP8)') : 'Unavailable'}
          </dd>
          <dt>Engine</dt>
          <dd className="text-neutral-200">{webcodecs ? 'WebCodecs Hardware Accelerated' : 'Canvas Render'}</dd>
        </dl>

        {!supported && <p className="mb-4 text-sm text-red-300">This browser cannot record video. Try Chrome, Edge or Safari 16+.</p>}

        {phase.kind === 'running' && (
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-xs text-neutral-300">
              <span>{phase.stage || 'Rendering…'}</span>
              <span className="font-mono">{Math.round(phase.progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-gradient-to-r from-accent to-pink-500 transition-all duration-200" style={{ width: `${phase.progress * 100}%` }} />
            </div>
          </div>
        )}

        {phase.kind === 'error' && <p className="mb-4 text-sm text-red-300">{phase.message}</p>}

        {phase.kind === 'done' && (
          <p className="mb-4 text-sm text-emerald-300">
            Done — {(phase.result.blob.size / (1024 * 1024)).toFixed(1)} MB ready to save.
          </p>
        )}

        <div className="flex justify-end gap-2">
          {phase.kind === 'running' ? (
            <TextButton variant="solid" onClick={() => abortRef.current?.abort()}>
              Cancel
            </TextButton>
          ) : phase.kind === 'done' ? (
            <>
              <TextButton variant="solid" onClick={() => setPhase({ kind: 'idle' })}>
                Export again
              </TextButton>
              <TextButton variant="accent" onClick={() => downloadBlob(phase.result.blob, `${safeName}.${phase.result.extension}`)}>
                <Download size={16} /> Download {isGif ? '.GIF' : `.${phase.result.extension.toUpperCase()}`}
              </TextButton>
            </>
          ) : (
            <>
              <TextButton variant="solid" onClick={onClose}>
                Close
              </TextButton>
              <TextButton variant="accent" onClick={start} disabled={!supported && !isGif}>
                Start export
              </TextButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
