/**
 * Import pipeline: File → probe → asset in store → (background) OPFS copy + waveform.
 * The asset appears in the library as soon as metadata is known; heavy work continues async.
 */

import { newId } from '../core/id';
import { useEditorStore } from '../core/store';
import type { MediaAsset } from '../core/types';
import { deleteFromOpfs, makeOpfsPath, opfsAvailable, saveToOpfs } from './opfs';
import { detectKind, probeMedia } from './probe';
import { computeWaveform } from './waveform';

export interface ImportOutcome {
  imported: string[];
  failed: { name: string; reason: string }[];
}

export async function importFiles(files: Iterable<File>): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { imported: [], failed: [] };
  const persistent = await opfsAvailable();

  for (const file of files) {
    const kind = detectKind(file);
    if (!kind) {
      outcome.failed.push({ name: file.name, reason: 'Unsupported file type' });
      continue;
    }

    const id = newId('ast');
    const url = URL.createObjectURL(file);
    try {
      const probe = await probeMedia(kind, url);
      if (kind !== 'image' && probe.duration <= 0) {
        throw new Error('Could not read media duration');
      }
      const asset: MediaAsset = {
        id,
        name: file.name,
        kind,
        mimeType: file.type || `${kind}/*`,
        size: file.size,
        url,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        hasAudio: probe.hasAudio,
        thumbnail: probe.thumbnail,
        waveform: null,
        storage: { kind: 'memory' },
        missing: false,
      };
      useEditorStore.getState().addAsset(asset);
      outcome.imported.push(id);

      if (persistent) void persistInBackground(id, file);
      if (kind !== 'image') void analyseWaveform(id, file);
    } catch (error) {
      URL.revokeObjectURL(url);
      outcome.failed.push({ name: file.name, reason: error instanceof Error ? error.message : 'Import failed' });
    }
  }
  return outcome;
}

async function persistInBackground(assetId: string, file: File): Promise<void> {
  const path = makeOpfsPath(assetId, file.name);
  const ok = await saveToOpfs(path, file);
  if (!ok) return;
  const store = useEditorStore.getState();
  if (!store.assets[assetId]) {
    // Asset was removed while copying.
    void deleteFromOpfs(path);
    return;
  }
  store.updateAsset(assetId, { storage: { kind: 'opfs', path } });
}

async function analyseWaveform(assetId: string, file: File): Promise<void> {
  const peaks = await computeWaveform(file);
  const store = useEditorStore.getState();
  if (!store.assets[assetId]) return;
  if (!peaks) {
    store.updateAsset(assetId, { hasAudio: false });
    return;
  }
  const audible = peaks.some((p) => p > 0.002);
  store.updateAsset(assetId, { waveform: peaks, hasAudio: audible });
}

/** Remove an asset everywhere: store (and its clips), OPFS bytes and the object URL. */
export function deleteAsset(assetId: string): void {
  const store = useEditorStore.getState();
  const asset = store.assets[assetId];
  if (!asset) return;
  store.removeAsset(assetId);
  if (asset.url) URL.revokeObjectURL(asset.url);
  if (asset.storage.kind === 'opfs') void deleteFromOpfs(asset.storage.path);
}
