import { AudioLines, FileVideo, Image as ImageIcon, Plus, Trash2, Upload } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { useEditorStore } from '../../core/store';
import { formatBytes, formatDuration } from '../../core/time';
import type { MediaAsset } from '../../core/types';
import { deleteAsset, importFiles } from '../../engine/importer';
import { IconButton, TextButton } from '../shared/controls';

export const ASSET_DRAG_TYPE = 'application/x-aivep-asset';

const ACCEPT = 'video/*,audio/*,image/*,.mkv,.mov,.m4a';

export function MediaLibrary() {
  const assets = useEditorStore((s) => s.assets);
  const addClipFromAsset = useEditorStore((s) => s.addClipFromAsset);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const outcome = await importFiles(Array.from(files));
      setErrors(outcome.failed.map((f) => `${f.name}: ${f.reason}`));
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
    void handleFiles(event.dataTransfer.files);
  };

  const list = Object.values(assets).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      className={`flex h-full flex-col ${dragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="flex-1 text-sm font-semibold">Media</h2>
        <TextButton variant="accent" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload size={16} />
          {busy ? 'Importing…' : 'Import'}
        </TextButton>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {errors.length > 0 && (
        <div className="m-2 rounded-md border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
          {errors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="m-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-400 hover:border-accent hover:text-neutral-200"
        >
          <Upload size={28} />
          <span className="font-medium text-neutral-200">Drop video, audio or images here</span>
          <span className="text-xs">or tap to browse · files stay on this device</span>
        </button>
      ) : (
        <ul className="thin-scrollbar flex-1 overflow-y-auto p-2">
          {list.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              onAdd={() => {
                addClipFromAsset(asset.id);
                setActivePanel('timeline');
              }}
              onDelete={() => deleteAsset(asset.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: MediaAsset['kind'] }) {
  if (kind === 'video') return <FileVideo size={22} className="text-indigo-300" />;
  if (kind === 'audio') return <AudioLines size={22} className="text-emerald-300" />;
  return <ImageIcon size={22} className="text-amber-300" />;
}

function AssetRow({ asset, onAdd, onDelete }: { asset: MediaAsset; onAdd: () => void; onDelete: () => void }) {
  return (
    <li
      draggable={!asset.missing}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={`group mb-1 flex items-center gap-2 rounded-lg border border-transparent p-1.5 hover:border-line hover:bg-neutral-900 ${asset.missing ? 'opacity-60' : ''}`}
    >
      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-neutral-900">
        {asset.thumbnail ? (
          <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <KindIcon kind={asset.kind} />
          </div>
        )}
        {asset.kind !== 'image' && (
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">
            {formatDuration(asset.duration)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-neutral-100" title={asset.name}>
          {asset.name}
        </div>
        <div className="truncate text-[11px] text-neutral-500">
          {asset.missing
            ? 'Offline — re-import to use'
            : `${asset.width > 0 ? `${asset.width}×${asset.height} · ` : ''}${formatBytes(asset.size)} · ${
                asset.storage.kind === 'opfs' ? 'Saved on device' : 'This session'
              }`}
        </div>
      </div>
      <IconButton label="Add to timeline" onClick={onAdd} disabled={asset.missing} variant="solid" className="h-9 min-w-9">
        <Plus size={16} />
      </IconButton>
      <IconButton label="Remove from library" onClick={onDelete} variant="danger" className="h-9 min-w-9">
        <Trash2 size={16} />
      </IconButton>
    </li>
  );
}
