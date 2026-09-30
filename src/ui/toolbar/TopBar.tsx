import {
  Activity,
  Clapperboard,
  Crop,
  Download,
  FilePlus2,
  Film,
  MessageSquare,
  Mic,
  Redo2,
  Scissors,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { selectCanRedo, selectCanUndo, selectDuration, useEditorStore } from '../../core/store';
import { formatTimecode } from '../../core/time';
import { clearSession } from '../../engine/persistence';
import { getEngine } from '../../engine/playback';
import { BeatDetectionModal } from '../ai/BeatDetectionModal';
import { SceneDetectionModal } from '../ai/SceneDetectionModal';
import { SilenceRemovalModal } from '../ai/SilenceRemovalModal';
import { SmartReframeModal } from '../ai/SmartReframeModal';
import { SubtitleGeneratorModal } from '../ai/SubtitleGeneratorModal';
import { VoiceoverModal } from '../ai/VoiceoverModal';
import { IconButton, TextButton } from '../shared/controls';
import { ExportDialog } from './ExportDialog';

export function TopBar() {
  const name = useEditorStore((s) => s.project.name);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const duration = useEditorStore(selectDuration);
  const fps = useEditorStore((s) => s.project.fps);
  const width = useEditorStore((s) => s.project.width);
  const height = useEditorStore((s) => s.project.height);
  const [exporting, setExporting] = useState(false);

  const [silenceModalOpen, setSilenceModalOpen] = useState(false);
  const [subtitlesModalOpen, setSubtitlesModalOpen] = useState(false);
  const [sceneModalOpen, setSceneModalOpen] = useState(false);
  const [voiceoverModalOpen, setVoiceoverModalOpen] = useState(false);
  const [reframeModalOpen, setReframeModalOpen] = useState(false);
  const [beatModalOpen, setBeatModalOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  const store = useEditorStore.getState;

  const startNewProject = (): void => {
    if (
      store().project.clips.length > 0 &&
      !window.confirm(
        'Start a new project? The current timeline will be cleared (media stays in the library).',
      )
    ) {
      return;
    }
    getEngine().pause();
    store().newProject();
    clearSession();
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <div className="flex items-center gap-2 pr-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white">
          <Clapperboard size={16} />
        </span>
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-[10px] text-neutral-500">
            {width}×{height} · {fps} fps · {formatTimecode(duration, fps)}
          </div>
        </div>
      </div>

      <span className="h-6 w-px bg-line" />

      <IconButton label="Undo (⌘Z)" onClick={() => store().undo()} disabled={!canUndo}>
        <Undo2 size={18} />
      </IconButton>
      <IconButton label="Redo (⇧⌘Z)" onClick={() => store().redo()} disabled={!canRedo}>
        <Redo2 size={18} />
      </IconButton>

      <span className="flex-1" />

      {/* AI Tools Quick Menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAiMenuOpen((o) => !o)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-purple-500/40 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 px-2.5 text-xs font-semibold text-purple-200 transition-colors hover:border-purple-500/70 hover:from-purple-500/30 hover:to-indigo-500/30 active:scale-95"
        >
          <Sparkles size={14} className="text-purple-400" />
          <span className="hidden sm:inline">AI Tools</span>
        </button>

        {aiMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setAiMenuOpen(false)}
            />
            <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-line bg-neutral-900 p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setAiMenuOpen(false);
                  setSilenceModalOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/20 text-purple-400">
                  <Scissors size={14} />
                </span>
                <div>
                  <div className="font-medium">Auto Cut Silence</div>
                  <div className="text-[10px] text-neutral-400">Remove pauses &amp; jump cuts</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiMenuOpen(false);
                  setSubtitlesModalOpen(true);
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-indigo-500/20 text-indigo-400">
                  <MessageSquare size={14} />
                </span>
                <div>
                  <div className="font-medium">Auto Subtitles (Whisper)</div>
                  <div className="text-[10px] text-neutral-400">AI captions &amp; Karaoke sync</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiMenuOpen(false);
                  setBeatModalOpen(true);
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-pink-500/20 text-pink-400">
                  <Activity size={14} />
                </span>
                <div>
                  <div className="font-medium">Beat Detection &amp; Cut</div>
                  <div className="text-[10px] text-neutral-400">BPM tempo &amp; snap to beat</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiMenuOpen(false);
                  setSceneModalOpen(true);
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/20 text-blue-400">
                  <Film size={14} />
                </span>
                <div>
                  <div className="font-medium">Scene Detection</div>
                  <div className="text-[10px] text-neutral-400">Split camera shots</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiMenuOpen(false);
                  setVoiceoverModalOpen(true);
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/20 text-emerald-400">
                  <Mic size={14} />
                </span>
                <div>
                  <div className="font-medium">AI Voiceover (TTS)</div>
                  <div className="text-[10px] text-neutral-400">Text-to-speech audio</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiMenuOpen(false);
                  setReframeModalOpen(true);
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/20 text-amber-400">
                  <Crop size={14} />
                </span>
                <div>
                  <div className="font-medium">Smart Reframe</div>
                  <div className="text-[10px] text-neutral-400">16:9 ↔ 9:16 vertical crop</div>
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      <IconButton label="New project" onClick={startNewProject}>
        <FilePlus2 size={18} />
      </IconButton>
      <TextButton variant="accent" onClick={() => setExporting(true)} disabled={duration === 0}>
        <Download size={16} />
        Export
      </TextButton>

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {silenceModalOpen && <SilenceRemovalModal onClose={() => setSilenceModalOpen(false)} />}
      {subtitlesModalOpen && <SubtitleGeneratorModal onClose={() => setSubtitlesModalOpen(false)} />}
      {beatModalOpen && <BeatDetectionModal onClose={() => setBeatModalOpen(false)} />}
      {sceneModalOpen && <SceneDetectionModal onClose={() => setSceneModalOpen(false)} />}
      {voiceoverModalOpen && <VoiceoverModal onClose={() => setVoiceoverModalOpen(false)} />}
      {reframeModalOpen && <SmartReframeModal onClose={() => setReframeModalOpen(false)} />}
    </header>
  );
}
