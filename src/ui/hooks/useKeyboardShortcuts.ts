import { useEffect } from 'react';
import { useEditorStore } from '../../core/store';
import { projectDuration } from '../../core/timelineOps';
import { getEngine } from '../../engine/playback';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Desktop keyboard shortcuts (Premiere / Final Cut conventions):
 *  Space play/pause · J/K/L shuttle · ←/→ frame step (Shift ×10) · Home/End
 *  S or Cmd/Ctrl+B blade at playhead · Delete/Backspace remove · Shift+Delete ripple delete
 *  Cmd/Ctrl+Z undo · Shift+Cmd/Ctrl+Z or Ctrl+Y redo · Cmd/Ctrl+D duplicate · Cmd/Ctrl+A select all
 *  = / - zoom · N toggle snapping · T add title · Esc clear selection
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      const store = useEditorStore.getState();
      const engine = getEngine();
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key;
      const lower = key.toLowerCase();

      if (meta && lower === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (meta && lower === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }
      if (meta && lower === 'd') {
        event.preventDefault();
        store.duplicateClips(store.selectedClipIds);
        return;
      }
      if (meta && lower === 'a') {
        event.preventDefault();
        store.select(store.project.clips.map((c) => c.id));
        return;
      }
      if (meta && lower === 'b') {
        event.preventDefault();
        store.splitAtPlayhead();
        return;
      }
      if (meta) return;

      switch (key) {
        case ' ':
          event.preventDefault();
          // A focused toolbar button would also "click" on Space keyup — drop focus first.
          if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
            document.activeElement.blur();
          }
          engine.toggle();
          return;
        case 'k':
        case 'K':
          engine.pause();
          return;
        case 'l':
        case 'L':
          engine.play();
          return;
        case 'j':
        case 'J':
          engine.stepFrames(-store.project.fps);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          engine.stepFrames(event.shiftKey ? -10 : -1);
          return;
        case 'ArrowRight':
          event.preventDefault();
          engine.stepFrames(event.shiftKey ? 10 : 1);
          return;
        case 'Home':
          event.preventDefault();
          engine.pause();
          engine.seek(0);
          return;
        case 'End':
          event.preventDefault();
          engine.pause();
          engine.seek(projectDuration(store.project));
          return;
        case 's':
        case 'S':
          store.splitAtPlayhead();
          return;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          if (event.shiftKey) store.rippleDeleteClips(store.selectedClipIds);
          else store.removeClips(store.selectedClipIds);
          return;
        case '=':
        case '+':
          store.setPxPerSecond(store.pxPerSecond * 1.25);
          return;
        case '-':
        case '_':
          store.setPxPerSecond(store.pxPerSecond / 1.25);
          return;
        case 'n':
        case 'N':
          store.toggleSnapping();
          return;
        case 't':
        case 'T':
          store.addTextClip();
          return;
        case 'Escape':
          store.clearSelection();
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
