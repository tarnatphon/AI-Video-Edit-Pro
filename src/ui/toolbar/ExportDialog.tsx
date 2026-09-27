import { Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../core/store';
import { downloadBlob, exportRealtime, exportSupported, pickMimeType, type ExportResult } from '../../engine/exporter';
import { getEngine } from '../../engine/playback';
import { TextButton } from '../shared/controls';

type Phase = { kind: 'idle' } | { kind: 'running'; progress: number } | { kind: 'done'; result: ExportResult } | { kind: 'error'; message: string };

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const projectName = useEditorStore((s) => s.project.name);
  const width = useEditorStore((s) => s.project.width);
  const height = useEditorStore((s) => s.project.height);
  const fps = useEditorStore((s) => s.project.fps);
  const supported = exportSupported();
  const mime = pickMimeType();

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = (): void => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'running', progress: 0 });
    exportRealtime(getEngine(), {
      signal: controller.signal,
      onProgress: (progress) => setPhase((p) => (p.kind === 'running' ? { kind: 'running', progress } : p)),
    })
      .then((result) => setPhase({ kind: 'done', result }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setPhase({ kind: 'idle' });
          return;
        }
        setPhase({ kind: 'error', message: error instanceof Error ? error.message : 'Export failed' });
      });
  };

  const safeName = projectName.replace(/[^\w.\-]+/g, '_') || 'export';
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Export video">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Export video</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-xs text-neutral-400">
          <dt>Output</dt>
          <dd className="text-neutral-200">
            {outW}×{outH} · {fps} fps
          </dd>
          <dt>Container</dt>
          <dd className="text-neutral-200">{mime ? (mime.includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9/VP8)') : 'Unavailable'}</dd>
          <dt>Method</dt>
          <dd className="text-neutral-200">Real-time capture (1× duration)</dd>
        </dl>

        {!supported && <p className="mb-4 text-sm text-red-300">This browser cannot record video. Try Chrome, Edge or Safari 16+.</p>}

        {phase.kind === 'running' && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-neutral-400">
              <span>Rendering… keep this tab visible</span>
              <span>{Math.round(phase.progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-gradient-to-r from-accent to-accent-2 transition-[width]" style={{ width: `${phase.progress * 100}%` }} />
            </div>
          </div>
        )}

        {phase.kind === 'error' && <p className="mb-4 text-sm text-red-300">{phase.message}</p>}

        {phase.kind === 'done' && (
          <p className="mb-4 text-sm text-emerald-300">
            Done — {(phase.result.blob.size / (1024 * 1024)).toFixed(1)} MB ready.
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
                <Download size={16} /> Download
              </TextButton>
            </>
          ) : (
            <>
              <TextButton variant="solid" onClick={onClose}>
                Close
              </TextButton>
              <TextButton variant="accent" onClick={start} disabled={!supported || !mime}>
                Start export
              </TextButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
