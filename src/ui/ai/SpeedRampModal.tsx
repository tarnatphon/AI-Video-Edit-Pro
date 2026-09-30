import { Check, FastForward, Gauge, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { SPEED_RAMP_PRESETS, applySpeedRampToClip, type SpeedRampPreset } from '../../core/speedRamp';
import { useEditorStore } from '../../core/store';
import { getClip } from '../../core/timelineOps';
import { TextButton } from '../shared/controls';

interface SpeedRampModalProps {
  onClose(): void;
  initialClipId?: string;
}

export function SpeedRampModal({ onClose, initialClipId }: SpeedRampModalProps) {
  const project = useEditorStore((s) => s.project);
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
  const [selectedPreset, setSelectedPreset] = useState<SpeedRampPreset>(SPEED_RAMP_PRESETS[0]!);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const activeClip = getClip(project, selectedClipId);

  const handleApply = () => {
    if (!activeClip) return;

    const store = useEditorStore.getState();
    store.beginTransaction();
    const updated = applySpeedRampToClip(store.project, activeClip.id, selectedPreset);
    useEditorStore.setState({ project: updated });
    store.endTransaction();

    setStatusNotice(`Applied ${selectedPreset.name} Speed Ramp!`);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  // Generate SVG path for the speed curve graph
  const graphWidth = 400;
  const graphHeight = 120;
  const maxSpeed = 5.0;

  const pointsSvg = selectedPreset.curve.map((pt) => {
    const x = pt.position * graphWidth;
    const y = graphHeight - (Math.min(pt.speed, maxSpeed) / maxSpeed) * graphHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${pointsSvg.join(' L ')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
              <FastForward size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">AI Speed Ramping (ปรับสปีดเร่ง-ชะลอแบบไดนามิก)</h3>
              <p className="text-[11px] text-neutral-400">
                Smooth cinematic speed curves: Bullet Time slow-mo drops, Flash ins &amp; montage transitions
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
          {/* Target Clip Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Target Video Clip</label>
            <select
              value={selectedClipId}
              onChange={(e) => setSelectedClipId(e.target.value)}
              className="w-full rounded-lg border border-line bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-hidden focus:border-accent"
            >
              {targetClips.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.duration} frames)
                </option>
              ))}
            </select>
          </div>

          {/* Speed Ramp Presets Grid */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Speed Curve Presets</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SPEED_RAMP_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPreset(p)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selectedPreset.id === p.id
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-line bg-neutral-900/50 hover:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-100">{p.name}</span>
                    <span className="text-[10px] rounded bg-neutral-800 px-1.5 py-0.5 text-cyan-300">
                      {p.category}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400 leading-relaxed">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Speed Curve Visualizer Graph */}
          <div className="space-y-2 rounded-lg border border-line bg-neutral-950 p-4">
            <div className="flex items-center justify-between text-xs text-neutral-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Gauge size={14} className="text-cyan-400" /> Dynamic Velocity Graph (0.2× ↔ 5.0×)
              </span>
              <span className="text-[11px] text-cyan-300 font-mono">
                {selectedPreset.name}
              </span>
            </div>

            <div className="relative h-32 w-full rounded border border-neutral-800 bg-neutral-900/40 p-2">
              {/* Reference Grid lines */}
              <div className="absolute inset-x-2 top-1/4 border-b border-dashed border-neutral-800 text-[9px] text-neutral-600">3.75×</div>
              <div className="absolute inset-x-2 top-2/4 border-b border-dashed border-neutral-800 text-[9px] text-neutral-600">2.5×</div>
              <div className="absolute inset-x-2 top-3/4 border-b border-neutral-700 text-[9px] text-neutral-500">1.0× (Realtime)</div>

              <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} className="h-full w-full overflow-visible">
                <defs>
                  <linearGradient id="rampGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={`${pathD} L ${graphWidth},${graphHeight} L 0,${graphHeight} Z`} fill="url(#rampGrad)" />
                <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {selectedPreset.curve.map((pt, idx) => {
                  const cx = pt.position * graphWidth;
                  const cy = graphHeight - (Math.min(pt.speed, maxSpeed) / maxSpeed) * graphHeight;
                  return (
                    <circle key={idx} cx={cx} cy={cy} r="4.5" fill="#0891b2" stroke="#ffffff" strokeWidth="1.5" />
                  );
                })}
              </svg>
            </div>
          </div>

          {statusNotice && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/15 p-3 text-xs text-green-300">
              <Check size={16} />
              {statusNotice}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-neutral-900/60 px-5 py-3">
          <TextButton variant="ghost" onClick={onClose}>
            Cancel
          </TextButton>

          <TextButton variant="accent" onClick={handleApply} disabled={!activeClip}>
            <Zap size={14} /> Apply Speed Ramp ({selectedPreset.name})
          </TextButton>
        </div>
      </div>
    </div>
  );
}
