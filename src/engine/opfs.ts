/**
 * Origin Private File System storage for imported media. Large files never leave the device and
 * survive page reloads. Gracefully reports `false` when unsupported (insecure context, private
 * browsing, older Safari without `createWritable`).
 */

const MEDIA_DIR = 'media';

let availability: Promise<boolean> | null = null;

async function mediaDirectory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(MEDIA_DIR, { create });
  } catch {
    return null;
  }
}

export function opfsAvailable(): Promise<boolean> {
  availability ??= (async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return false;
      if (typeof FileSystemFileHandle === 'undefined') return false;
      if (typeof FileSystemFileHandle.prototype.createWritable !== 'function') return false;
      const dir = await mediaDirectory(true);
      if (!dir) return false;
      void navigator.storage.persist?.().catch(() => false);
      return true;
    } catch {
      return false;
    }
  })();
  return availability;
}

export function makeOpfsPath(id: string, name: string): string {
  const safe = name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
  return `${id}__${safe}`;
}

export async function saveToOpfs(path: string, blob: Blob): Promise<boolean> {
  if (!(await opfsAvailable())) return false;
  const dir = await mediaDirectory(true);
  if (!dir) return false;
  try {
    const handle = await dir.getFileHandle(path, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
    return true;
  } catch {
    try {
      await dir.removeEntry(path);
    } catch {
      /* ignore */
    }
    return false;
  }
}

export async function readFromOpfs(path: string): Promise<File | null> {
  if (!(await opfsAvailable())) return null;
  const dir = await mediaDirectory(false);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(path, { create: false });
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function deleteFromOpfs(path: string): Promise<void> {
  if (!(await opfsAvailable())) return;
  const dir = await mediaDirectory(false);
  if (!dir) return;
  try {
    await dir.removeEntry(path);
  } catch {
    /* already gone */
  }
}
