import { Eye, EyeOff, Lock, LockOpen, Volume2, VolumeX, X } from 'lucide-react';
import { memo } from 'react';
import { useEditorStore } from '../../core/store';
import type { Track } from '../../core/types';
import { HEADER_W } from './timelineContext';

interface TrackHeaderProps {
  track: Track;
  height: number;
  isEmpty: boolean;
}

function SmallToggle({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

export const TrackHeader = memo(function TrackHeader({ track, height, isEmpty }: TrackHeaderProps) {
  const updateTrack = useEditorStore((s) => s.updateTrack);
  const removeTrack = useEditorStore((s) => s.removeTrack);

  return (
    <div
      className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-r border-b border-line bg-panel px-2"
      style={{ width: HEADER_W, height }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${track.kind === 'video' ? 'text-indigo-200' : 'text-emerald-200'}`}>{track.name}</span>
        {isEmpty && (
          <button
            type="button"
            aria-label={`Remove track ${track.name}`}
            title="Remove empty track"
            onClick={() => removeTrack(track.id)}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-800 hover:text-red-300"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {track.kind === 'video' && (
          <SmallToggle label={track.hidden ? 'Show track' : 'Hide track'} active={track.hidden} onClick={() => updateTrack(track.id, { hidden: !track.hidden })}>
            {track.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </SmallToggle>
        )}
        <SmallToggle label={track.muted ? 'Unmute track' : 'Mute track'} active={track.muted} onClick={() => updateTrack(track.id, { muted: !track.muted })}>
          {track.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </SmallToggle>
        <SmallToggle label={track.locked ? 'Unlock track' : 'Lock track'} active={track.locked} onClick={() => updateTrack(track.id, { locked: !track.locked })}>
          {track.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </SmallToggle>
      </div>
    </div>
  );
});
