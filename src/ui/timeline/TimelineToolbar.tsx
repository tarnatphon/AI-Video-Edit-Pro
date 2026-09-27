import { Copy, Layers, Magnet, Music, Scissors, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react';
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND, useEditorStore } from '../../core/store';
import { IconButton } from '../shared/controls';

interface TimelineToolbarProps {
  onZoom(factor: number): void;
}

export function TimelineToolbar({ onZoom }: TimelineToolbarProps) {
  const selectedCount = useEditorStore((s) => s.selectedClipIds.length);
  const snapping = useEditorStore((s) => s.snappingEnabled);
  const pxPerSecond = useEditorStore((s) => s.pxPerSecond);
  const store = useEditorStore.getState;

  const zoomFraction = (Math.log(pxPerSecond) - Math.log(MIN_PX_PER_SECOND)) / (Math.log(MAX_PX_PER_SECOND) - Math.log(MIN_PX_PER_SECOND));

  return (
    <div className="no-scrollbar flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2">
      <IconButton label="Split at playhead (S)" onClick={() => store().splitAtPlayhead()}>
        <Scissors size={18} />
      </IconButton>
      <IconButton label="Duplicate (⌘D)" onClick={() => store().duplicateClips(store().selectedClipIds)} disabled={selectedCount === 0}>
        <Copy size={18} />
      </IconButton>
      <IconButton label="Delete (⌫)" variant="danger" onClick={() => store().removeClips(store().selectedClipIds)} disabled={selectedCount === 0}>
        <Trash2 size={18} />
      </IconButton>
      <IconButton
        label="Ripple delete — close the gap (⇧⌫)"
        variant="danger"
        onClick={() => store().rippleDeleteClips(store().selectedClipIds)}
        disabled={selectedCount === 0}
        className="text-xs"
      >
        <Trash2 size={18} />
        <span className="hidden md:inline">Ripple</span>
      </IconButton>

      <span className="mx-1 h-6 w-px bg-line" />

      <IconButton label="Add title (T)" onClick={() => store().addTextClip()}>
        <Type size={18} />
        <span className="hidden md:inline">Title</span>
      </IconButton>
      <IconButton label="Add video track" onClick={() => store().addTrack('video')}>
        <Layers size={18} />
        <span className="hidden md:inline">+V</span>
      </IconButton>
      <IconButton label="Add audio track" onClick={() => store().addTrack('audio')}>
        <Music size={18} />
        <span className="hidden md:inline">+A</span>
      </IconButton>

      <span className="flex-1" />

      <IconButton label={snapping ? 'Snapping on (N)' : 'Snapping off (N)'} active={snapping} onClick={() => store().toggleSnapping()}>
        <Magnet size={18} />
      </IconButton>
      <IconButton label="Zoom out (-)" onClick={() => onZoom(1 / 1.4)}>
        <ZoomOut size={18} />
      </IconButton>
      <input
        type="range"
        aria-label="Timeline zoom"
        min={0}
        max={1}
        step={0.001}
        value={zoomFraction}
        onChange={(e) => {
          const fraction = Number.parseFloat(e.target.value);
          const target = Math.exp(Math.log(MIN_PX_PER_SECOND) + fraction * (Math.log(MAX_PX_PER_SECOND) - Math.log(MIN_PX_PER_SECOND)));
          onZoom(target / pxPerSecond);
        }}
        className="w-24 sm:w-32"
      />
      <IconButton label="Zoom in (=)" onClick={() => onZoom(1.4)}>
        <ZoomIn size={18} />
      </IconButton>
    </div>
  );
}
