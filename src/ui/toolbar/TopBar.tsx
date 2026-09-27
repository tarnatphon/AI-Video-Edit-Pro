import { Clapperboard, Download, FilePlus2, Redo2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { selectCanRedo, selectCanUndo, selectDuration, useEditorStore } from '../../core/store';
import { formatTimecode } from '../../core/time';
import { clearSession } from '../../engine/persistence';
import { getEngine } from '../../engine/playback';
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

  const store = useEditorStore.getState;

  const startNewProject = (): void => {
    if (store().project.clips.length > 0 && !window.confirm('Start a new project? The current timeline will be cleared (media stays in the library).')) {
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

      <IconButton label="New project" onClick={startNewProject}>
        <FilePlus2 size={18} />
      </IconButton>
      <TextButton variant="accent" onClick={() => setExporting(true)} disabled={duration === 0}>
        <Download size={16} />
        Export
      </TextButton>

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </header>
  );
}
