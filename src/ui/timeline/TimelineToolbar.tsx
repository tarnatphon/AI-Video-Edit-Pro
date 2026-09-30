import {
  Activity,
  Copy,
  Crop,
  Film,
  Layers,
  Magnet,
  MessageSquare,
  Mic,
  Music,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND, useEditorStore } from '../../core/store';
import { BeatDetectionModal } from '../ai/BeatDetectionModal';
import { SceneDetectionModal } from '../ai/SceneDetectionModal';
import { SilenceRemovalModal } from '../ai/SilenceRemovalModal';
import { SmartReframeModal } from '../ai/SmartReframeModal';
import { SubtitleGeneratorModal } from '../ai/SubtitleGeneratorModal';
import { VoiceoverModal } from '../ai/VoiceoverModal';
import { IconButton } from '../shared/controls';

interface TimelineToolbarProps {
  onZoom(factor: number): void;
}

export function TimelineToolbar({ onZoom }: TimelineToolbarProps) {
  const selectedCount = useEditorStore((s) => s.selectedClipIds.length);
  const snapping = useEditorStore((s) => s.snappingEnabled);
  const pxPerSecond = useEditorStore((s) => s.pxPerSecond);
  const store = useEditorStore.getState;

  const [silenceModalOpen, setSilenceModalOpen] = useState(false);
  const [subtitlesModalOpen, setSubtitlesModalOpen] = useState(false);
  const [sceneModalOpen, setSceneModalOpen] = useState(false);
  const [voiceoverModalOpen, setVoiceoverModalOpen] = useState(false);
  const [reframeModalOpen, setReframeModalOpen] = useState(false);
  const [beatModalOpen, setBeatModalOpen] = useState(false);

  const zoomFraction = (Math.log(pxPerSecond) - Math.log(MIN_PX_PER_SECOND)) / (Math.log(MAX_PX_PER_SECOND) - Math.log(MIN_PX_PER_SECOND));

  return (
    <>
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

        <span className="mx-1 h-6 w-px bg-line" />

        {/* AI Quick Buttons */}
        <button
          type="button"
          onClick={() => setSilenceModalOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 text-xs font-medium text-purple-300 transition-colors hover:border-purple-500/60 hover:bg-purple-500/20 active:scale-95"
          title="AI Auto Cut Silence — remove dead air & create jump cuts"
        >
          <Sparkles size={14} className="text-purple-400" />
          <span className="hidden sm:inline">Cut Silence</span>
        </button>

        <button
          type="button"
          onClick={() => setSubtitlesModalOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 text-xs font-medium text-indigo-300 transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/20 active:scale-95"
          title="AI Auto Subtitles (Whisper) — generate and sync captions"
        >
          <MessageSquare size={14} className="text-indigo-400" />
          <span className="hidden sm:inline">Subtitles</span>
        </button>

        <button
          type="button"
          onClick={() => setBeatModalOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 px-2.5 text-xs font-medium text-pink-300 transition-colors hover:border-pink-500/60 hover:bg-pink-500/20 active:scale-95"
          title="AI Beat Detection — detect BPM & cut to music beats"
        >
          <Activity size={14} className="text-pink-400" />
          <span className="hidden sm:inline">Beats</span>
        </button>

        <button
          type="button"
          onClick={() => setSceneModalOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 text-xs font-medium text-blue-300 transition-colors hover:border-blue-500/60 hover:bg-blue-500/20 active:scale-95"
          title="AI Scene Detection — split camera shots automatically"
        >
          <Film size={14} className="text-blue-400" />
          <span className="hidden sm:inline">Scenes</span>
        </button>

        <button
          type="button"
          onClick={() => setVoiceoverModalOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/20 active:scale-95"
          title="AI Voiceover — Text to speech audio generator"
        >
          <Mic size={14} className="text-emerald-400" />
          <span className="hidden sm:inline">Voiceover</span>
        </button>

        <button
          type="button"
          onClick={() => setReframeModalOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-300 transition-colors hover:border-amber-500/60 hover:bg-amber-500/20 active:scale-95"
          title="AI Smart Reframe — 16:9 to 9:16 vertical conversion"
        >
          <Crop size={14} className="text-amber-400" />
          <span className="hidden sm:inline">Reframe</span>
        </button>

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

      {silenceModalOpen && <SilenceRemovalModal onClose={() => setSilenceModalOpen(false)} />}
      {subtitlesModalOpen && <SubtitleGeneratorModal onClose={() => setSubtitlesModalOpen(false)} />}
      {beatModalOpen && <BeatDetectionModal onClose={() => setBeatModalOpen(false)} />}
      {sceneModalOpen && <SceneDetectionModal onClose={() => setSceneModalOpen(false)} />}
      {voiceoverModalOpen && <VoiceoverModal onClose={() => setVoiceoverModalOpen(false)} />}
      {reframeModalOpen && <SmartReframeModal onClose={() => setReframeModalOpen(false)} />}
    </>
  );
}
