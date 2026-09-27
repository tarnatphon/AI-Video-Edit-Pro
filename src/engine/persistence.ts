/**
 * Session persistence: project JSON + asset metadata in localStorage, media bytes in OPFS.
 * Object URLs are re-created on restore; assets that only lived in memory are flagged `missing`.
 */

import type { MediaAsset, Project } from '../core/types';
import { readFromOpfs } from './opfs';

const STORAGE_KEY = 'aivep.session.v1';

type StoredAsset = Omit<MediaAsset, 'url' | 'missing'>;

interface StoredSession {
  version: 1;
  savedAt: number;
  project: Project;
  assets: StoredAsset[];
}

export interface RestoredSession {
  project: Project;
  assets: Record<string, MediaAsset>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProject(value: unknown): value is Project {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.fps === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    Array.isArray(value.tracks) &&
    Array.isArray(value.clips)
  );
}

function toStoredAsset(asset: MediaAsset, slim: boolean): StoredAsset {
  const { url: _url, missing: _missing, ...rest } = asset;
  return slim ? { ...rest, thumbnail: null, waveform: null } : rest;
}

export function saveSession(project: Project, assets: Readonly<Record<string, MediaAsset>>): void {
  if (typeof localStorage === 'undefined') return;
  const build = (slim: boolean): string =>
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      project,
      assets: Object.values(assets).map((a) => toStoredAsset(a, slim)),
    } satisfies StoredSession);

  try {
    localStorage.setItem(STORAGE_KEY, build(false));
  } catch {
    // Quota exceeded: retry without thumbnails/waveforms (they are re-computable).
    try {
      localStorage.setItem(STORAGE_KEY, build(true));
    } catch {
      /* give up silently; the editor keeps working in-memory */
    }
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function restoreSession(): Promise<RestoredSession | null> {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isProject(parsed.project) || !Array.isArray(parsed.assets)) {
    return null;
  }

  const assets: Record<string, MediaAsset> = {};
  await Promise.all(
    (parsed.assets as StoredAsset[]).map(async (stored) => {
      if (!isRecord(stored) || typeof stored.id !== 'string') return;
      let url = '';
      let missing = true;
      if (stored.storage?.kind === 'opfs') {
        const file = await readFromOpfs(stored.storage.path);
        if (file) {
          url = URL.createObjectURL(file);
          missing = false;
        }
      }
      assets[stored.id] = { ...stored, url, missing };
    }),
  );

  return { project: parsed.project, assets };
}
