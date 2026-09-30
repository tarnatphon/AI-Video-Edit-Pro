import { Check, Film, Loader2, Play, Scissors, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_SCENE_OPTIONS, type SceneDetectionOptions, type SceneInterval } from '../../core/scene';
import { splitClipIntoScenes } from '../../core/sceneOps';
import { useEditorStore } from '../../core/store';
import { formatTimecode } from '../../core/time';
import { getClip } from '../../core/timelineOps';
import type { MediaAsset } from '../../core/types';
import { getEngine } from '../../engine/playback';
import { detectScenesInAsset, type SceneDetectionProgress } from '../../engine/sceneDetector';
import { IconButton, SliderField, TextButton } from '../shared/controls';

interface SceneDetectionModalProps {
  onClose(): void;
  initialClipId?: string;
}

export function SceneDetectionModal({ onClose, initialClipId }: SceneDetectionModalProps) {
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);

  const targetClips = project.clips.filter((c) => c.kind === 'video');
  const defaultSelectedId =
    initialClipId ??
    selectedClipIds.find((id) => {
      const c = getClip(project, id);
      return c && c.kind === 'video';
    }) ??
    targetClips[0]?.id ??
    '';

  const [selectedClipId, setSelectedClipId] = useState<string>(defaultSelectedId);
  const [options, setOptions] = useState<SceneDetectionOptions>(DEFAULT_SCENE_OPTIONS);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<SceneDetectionProgress | null>(null);
  const [scenes, setScenes] = useState<SceneInterval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeClip = targetClips.find((c) => c.id === selectedClipId);
  const asset: MediaAsset | undefined = activeClip?.assetId ? assets[activeClip.assetId] : undefined;

  const handleStartScan = async () => {
    if (!asset) {
      setError('Please select a valid video clip.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setNotice(null);

    try {
      const detected = await detectScenesInAsset(asset, options, (p) => setProgress(p));
      setScenes(detected);
      if (detected.length <= 1) {
        setNotice('Only 1 continuous scene detected. Try lowering the sensitivity threshold.');
      } else {
        setNotice(`Found ${detected.length} distinct scenes!`);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to analyze scenes.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleApplySplit = () => {
    if (!activeClip || scenes.length <= 1) return;
    const store = useEditorStore.getState();

    store.beginTransaction();
    const updated = splitClipIntoScenes(store.project, activeClip.id, scenes);
    useEditorStore.setState({ project: updated });
    store.endTransaction();

    setNotice(`Split into ${scenes.length} scene clips on timeline!`);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleSeek = (seconds: number) => {
    const frame = Math.round(seconds * project.fps);
    useEditorStore.getState().setPlayhead(frame);
    getEngine().seek(frame);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <Film size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">AI Scene &amp; Shot Detection (ตรวจจับและแยกฉาก)</h3>
              <p className="text-[11px] text-neutral-400">
                Automatically detect camera cuts, shot transitions, and split long videos
              </p>
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
          {/* Clip Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-300">Target Video</label>
            {targetClips.length === 0 ? (
              <p className="text-xs text-neutral-500">No video clips found on the timeline.</p>
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

          {/* Parameters */}
          <div className="space-y-3 rounded-lg border border-line bg-neutral-900/40 p-3.5">
            <h4 className="text-xs font-semibold text-neutral-300">Sensitivity &amp; Cut Settings</h4>

            <SliderField
              label="Scene Change Threshold (Lower = More Sensitive)"
              value={options.threshold ?? 0.35}
              min={0.15}
              max={0.75}
              step={0.05}
              unit=""
              onChange={(v) => setOptions((o) => ({ ...o, threshold: v }))}
            />

            <SliderField
              label="Minimum Scene Length"
              value={options.minSceneDuration ?? 1.0}
              min={0.3}
              max={5.0}
              step={0.1}
              unit="s"
              onChange={(v) => setOptions((o) => ({ ...o, minSceneDuration: v }))}
            />
          </div>

          {/* Progress bar */}
          {isScanning && progress && (
            <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-neutral-200">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  {progress.stage}
                </span>
                <span className="font-mono text-accent">{progress.percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Detected Scenes Grid */}
          {scenes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <span className="font-semibold">Detected Scenes ({scenes.length})</span>
                <span className="text-neutral-500">Click preview to seek timeline</span>
              </div>

              <div className="thin-scrollbar grid max-h-64 grid-cols-2 gap-2.5 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                {scenes.map((scene, idx) => (
                  <div
                    key={scene.id}
                    className="group relative overflow-hidden rounded-lg border border-line bg-neutral-900 transition-colors hover:border-accent"
                  >
                    <div className="relative aspect-video w-full bg-neutral-950">
                      {scene.thumbnail ? (
                        <img
                          src={scene.thumbnail}
                          alt={`Scene ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-neutral-600">
                          <Film size={20} />
                        </div>
                      )}
                      <IconButton
                        label="Play scene"
                        onClick={() => handleSeek(scene.startSec)}
                        className="absolute right-1.5 bottom-1.5 h-6 w-6 rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Play size={11} />
                      </IconButton>
                    </div>

                    <div className="p-2">
                      <div className="text-[11px] font-semibold text-neutral-200">Scene {idx + 1}</div>
                      <div className="flex items-center justify-between font-mono text-[10px] text-neutral-500">
                        <span>{scene.duration}s</span>
                        <span>{formatTimecode(scene.startFrame, project.fps)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notice && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/15 p-3 text-xs text-green-300">
              <Check size={16} />
              {notice}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/15 p-3 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-neutral-900/60 px-5 py-3">
          <TextButton variant="ghost" onClick={onClose}>
            Cancel
          </TextButton>

          <div className="flex items-center gap-2">
            <TextButton
              variant="solid"
              onClick={handleStartScan}
              disabled={isScanning || !activeClip}
            >
              {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {scenes.length > 0 ? 'Re-scan Scenes' : 'Scan Video for Cuts'}
            </TextButton>

            <TextButton
              variant="accent"
              onClick={handleApplySplit}
              disabled={scenes.length <= 1}
            >
              <Scissors size={14} /> Split into {scenes.length} Clips
            </TextButton>
          </div>
        </div>
      </div>
    </div>
  );
}
