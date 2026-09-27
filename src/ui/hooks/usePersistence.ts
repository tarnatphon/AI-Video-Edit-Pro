import { useEffect, useState } from 'react';
import { useEditorStore } from '../../core/store';
import { restoreSession, saveSession } from '../../engine/persistence';

const SAVE_DEBOUNCE_MS = 600;

/**
 * Restores the previous session on mount and auto-saves project + asset metadata (debounced).
 * Returns `true` once the restore attempt has finished so the UI can avoid a flash of empty state.
 */
export function usePersistence(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled) return;
        if (session) useEditorStore.getState().loadSession(session.project, session.assets);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let timer: number | null = null;
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.project === prev.project && state.assets === prev.assets) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const latest = useEditorStore.getState();
        saveSession(latest.project, latest.assets);
      }, SAVE_DEBOUNCE_MS);
    });
    const flush = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
        const latest = useEditorStore.getState();
        saveSession(latest.project, latest.assets);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [ready]);

  return ready;
}
