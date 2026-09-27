import { useEffect } from 'react';
import { getEngine } from './engine/playback';
import { useKeyboardShortcuts } from './ui/hooks/useKeyboardShortcuts';
import { usePersistence } from './ui/hooks/usePersistence';
import { EditorLayout } from './ui/layout/EditorLayout';

export default function App() {
  const ready = usePersistence();
  useKeyboardShortcuts();

  // Boot the engine early and stop the browser from navigating when files are dropped outside a drop zone.
  useEffect(() => {
    getEngine();
    const block = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        <span className="animate-pulse-soft">Restoring your session…</span>
      </div>
    );
  }

  return <EditorLayout />;
}
