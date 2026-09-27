import { useSyncExternalStore } from 'react';

function subscribe(query: string, callback: () => void): () => void {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Wide layout: three columns + full-width timeline. Below this we switch to tabbed tablet mode. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** True for touch-first devices (iPad, Android tablets) → bigger hit targets. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}
