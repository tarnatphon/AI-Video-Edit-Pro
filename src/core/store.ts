/**
 * Editor state (Zustand). The `project` is immutable: every change goes through a pure operation
 * from `timelineOps.ts` and is recorded in an undo stack. Continuous gestures (drags, slider
 * scrubs) are wrapped in a transaction so that one gesture == one undo step.
 */

import { create } from 'zustand';
import { clampEffectValue, EFFECT_DEFINITIONS } from './effects';
import { newId } from './id';
import { createClipFromAsset, createProject, createTextClip, defaultTrackFor, topVideoTrack } from './project';
import { clamp } from './time';
import * as ops from './timelineOps';
import type { ClipPatch } from './timelineOps';
import type {
  Clip,
  Effect,
  EffectType,
  Frames,
  MediaAsset,
  Project,
  Track,
  TrackKind,
  TrimEdge,
} from './types';

export const MIN_PX_PER_SECOND = 4;
export const MAX_PX_PER_SECOND = 800;
export const DEFAULT_PX_PER_SECOND = 60;
const HISTORY_LIMIT = 200;

export type PanelId = 'media' | 'timeline' | 'inspector';

export interface EditorState {
  project: Project;
  assets: Record<string, MediaAsset>;
  playhead: Frames;
  isPlaying: boolean;
  selectedClipIds: string[];
  pxPerSecond: number;
  snappingEnabled: boolean;
  activePanel: PanelId;
  past: Project[];
  future: Project[];
  /** Project snapshot captured by `beginTransaction`, or null when no transaction is open. */
  transactionSnapshot: Project | null;
  /** Bumped on every restore/load so engines can drop cached sources. */
  sessionVersion: number;
}

export interface EditorActions {
  // Session
  loadSession(project: Project, assets: Record<string, MediaAsset>): void;
  newProject(): void;
  renameProject(name: string): void;
  setFps(fps: number): void;
  setResolution(width: number, height: number): void;

  // Assets
  addAsset(asset: MediaAsset): void;
  updateAsset(assetId: string, patch: Partial<MediaAsset>): void;
  removeAsset(assetId: string): void;

  // Clips
  addClipFromAsset(assetId: string, options?: { trackId?: string; start?: Frames }): string | null;
  addTextClip(options?: { start?: Frames; content?: string }): string | null;
  moveClip(clipId: string, start: Frames, trackId?: string): void;
  trimClip(clipId: string, edge: TrimEdge, frame: Frames): void;
  splitClip(clipId: string, frame: Frames): void;
  splitAtPlayhead(): void;
  removeClips(clipIds: readonly string[]): void;
  rippleDeleteClips(clipIds: readonly string[]): void;
  duplicateClips(clipIds: readonly string[]): void;
  updateClip(clipId: string, patch: ClipPatch): void;
  setClipSpeed(clipId: string, speed: number): void;
  addEffect(clipId: string, type: EffectType): void;
  updateEffect(clipId: string, effectId: string, patch: Partial<Pick<Effect, 'value' | 'enabled'>>): void;
  removeEffect(clipId: string, effectId: string): void;

  // Tracks
  addTrack(kind: TrackKind): void;
  removeTrack(trackId: string): void;
  updateTrack(trackId: string, patch: Partial<Omit<Track, 'id' | 'kind'>>): void;

  // Transport
  setPlayhead(frame: Frames): void;
  setPlaying(playing: boolean): void;

  // Selection & view
  select(clipIds: readonly string[], additive?: boolean): void;
  toggleSelect(clipId: string): void;
  clearSelection(): void;
  setPxPerSecond(value: number): void;
  toggleSnapping(): void;
  setActivePanel(panel: PanelId): void;

  // History
  beginTransaction(): void;
  endTransaction(): void;
  undo(): void;
  redo(): void;
}

export type EditorStore = EditorState & EditorActions;

function pruneSelection(selected: readonly string[], project: Project): string[] {
  const ids = new Set(project.clips.map((c) => c.id));
  const next = selected.filter((id) => ids.has(id));
  return next.length === selected.length ? [...selected] : next;
}

export const useEditorStore = create<EditorStore>()((set, get) => {
  /**
   * Commit a new project produced by a pure operation. No-op when the operation returned the
   * same reference. Records history unless a transaction is open (the transaction records the
   * snapshot taken at `beginTransaction`).
   */
  const commit = (next: Project): void => {
    const state = get();
    if (next === state.project) return;
    const stamped: Project = { ...next, updatedAt: Date.now() };
    if (state.transactionSnapshot !== null) {
      set({ project: stamped, selectedClipIds: pruneSelection(state.selectedClipIds, stamped) });
      return;
    }
    const past = [...state.past, state.project];
    if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
    set({ project: stamped, past, future: [], selectedClipIds: pruneSelection(state.selectedClipIds, stamped) });
  };

  return {
    project: createProject(),
    assets: {},
    playhead: 0,
    isPlaying: false,
    selectedClipIds: [],
    pxPerSecond: DEFAULT_PX_PER_SECOND,
    snappingEnabled: true,
    activePanel: 'timeline',
    past: [],
    future: [],
    transactionSnapshot: null,
    sessionVersion: 0,

    /* ---------------------------------- Session ---------------------------------- */

    loadSession: (project, assets) =>
      set((s) => ({
        project,
        assets,
        playhead: 0,
        isPlaying: false,
        selectedClipIds: [],
        past: [],
        future: [],
        transactionSnapshot: null,
        sessionVersion: s.sessionVersion + 1,
      })),

    newProject: () =>
      set((s) => ({
        project: createProject(),
        playhead: 0,
        isPlaying: false,
        selectedClipIds: [],
        past: [],
        future: [],
        transactionSnapshot: null,
        sessionVersion: s.sessionVersion + 1,
      })),

    renameProject: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      commit({ ...get().project, name: trimmed });
    },

    setFps: (fps) => {
      const state = get();
      const next = ops.changeFps(state.project, fps);
      if (next === state.project) return;
      const ratio = fps / state.project.fps;
      commit(next);
      set({ playhead: Math.max(0, Math.round(state.playhead * ratio)) });
    },

    setResolution: (width, height) => commit(ops.setResolution(get().project, width, height)),

    /* ---------------------------------- Assets ----------------------------------- */

    addAsset: (asset) => set((s) => ({ assets: { ...s.assets, [asset.id]: asset } })),

    updateAsset: (assetId, patch) =>
      set((s) => {
        const existing = s.assets[assetId];
        if (!existing) return {};
        return { assets: { ...s.assets, [assetId]: { ...existing, ...patch } } };
      }),

    removeAsset: (assetId) => {
      const state = get();
      if (!state.assets[assetId]) return;
      const clipIds = state.project.clips.filter((c) => c.assetId === assetId).map((c) => c.id);
      if (clipIds.length > 0) {
        // Removing an asset must remove its clips even from locked tracks.
        const unlocked: Project = {
          ...state.project,
          tracks: state.project.tracks.map((t) => (t.locked ? { ...t, locked: false } : t)),
        };
        const cleaned = ops.removeClips(unlocked, clipIds);
        commit({ ...cleaned, tracks: state.project.tracks });
      }
      set((s) => {
        const assets = { ...s.assets };
        delete assets[assetId];
        return { assets };
      });
    },

    /* ----------------------------------- Clips ----------------------------------- */

    addClipFromAsset: (assetId, options) => {
      const state = get();
      const asset = state.assets[assetId];
      if (!asset) return null;
      const track = options?.trackId
        ? ops.getTrack(state.project, options.trackId)
        : defaultTrackFor(state.project, asset.kind);
      if (!track || !ops.isKindCompatible(asset.kind, track.kind) || track.locked) return null;
      const clip = createClipFromAsset(asset, track.id, options?.start ?? state.playhead, state.project.fps);
      const next = ops.addClip(state.project, clip);
      if (next === state.project) return null;
      commit(next);
      set({ selectedClipIds: [clip.id] });
      return clip.id;
    },

    addTextClip: (options) => {
      const state = get();
      const track = topVideoTrack(state.project);
      if (!track) return null;
      const clip = createTextClip(track.id, options?.start ?? state.playhead, state.project.fps, options?.content);
      const next = ops.addClip(state.project, clip);
      if (next === state.project) return null;
      commit(next);
      set({ selectedClipIds: [clip.id] });
      return clip.id;
    },

    moveClip: (clipId, start, trackId) => commit(ops.moveClip(get().project, clipId, start, trackId)),

    trimClip: (clipId, edge, frame) => {
      const state = get();
      commit(ops.trimClip(state.project, state.assets, clipId, edge, frame));
    },

    splitClip: (clipId, frame) => {
      const newClipId = newId('clip');
      const state = get();
      const next = ops.splitClip(state.project, clipId, frame, newClipId);
      if (next === state.project) return;
      commit(next);
      set((s) => ({
        selectedClipIds: s.selectedClipIds.includes(clipId) ? [...s.selectedClipIds, newClipId] : s.selectedClipIds,
      }));
    },

    splitAtPlayhead: () => {
      const state = get();
      const under = ops.clipsAt(state.project, state.playhead);
      const selected = new Set(state.selectedClipIds);
      const candidates = under.filter((c) => selected.size === 0 || selected.has(c.id));
      if (candidates.length === 0) return;

      let project = state.project;
      const created: string[] = [];
      for (const clip of candidates) {
        const id = newId('clip');
        const next = ops.splitClip(project, clip.id, state.playhead, id);
        if (next !== project) {
          created.push(id);
          project = next;
        }
      }
      if (project === state.project) return;
      commit(project);
      if (selected.size > 0) set((s) => ({ selectedClipIds: [...s.selectedClipIds, ...created] }));
    },

    removeClips: (clipIds) => commit(ops.removeClips(get().project, clipIds)),

    rippleDeleteClips: (clipIds) => commit(ops.rippleDelete(get().project, clipIds)),

    duplicateClips: (clipIds) => {
      const state = get();
      let project = state.project;
      const created: string[] = [];
      for (const clipId of clipIds) {
        const id = newId('clip');
        const next = ops.duplicateClip(project, clipId, id);
        if (next !== project) {
          created.push(id);
          project = next;
        }
      }
      if (project === state.project) return;
      commit(project);
      set({ selectedClipIds: created });
    },

    updateClip: (clipId, patch) => commit(ops.updateClip(get().project, clipId, patch)),

    setClipSpeed: (clipId, speed) => {
      const state = get();
      commit(ops.setClipSpeed(state.project, state.assets, clipId, speed));
    },

    addEffect: (clipId, type) => {
      const state = get();
      const clip = ops.getClip(state.project, clipId);
      if (!clip) return;
      const effect: Effect = { id: newId('fx'), type, value: EFFECT_DEFINITIONS[type].defaultValue, enabled: true };
      commit(ops.updateClip(state.project, clipId, { effects: [...clip.effects, effect] }));
    },

    updateEffect: (clipId, effectId, patch) => {
      const state = get();
      const clip = ops.getClip(state.project, clipId);
      if (!clip) return;
      const effects = clip.effects.map((e) => {
        if (e.id !== effectId) return e;
        const value = patch.value === undefined ? e.value : clampEffectValue(e.type, patch.value);
        const enabled = patch.enabled === undefined ? e.enabled : patch.enabled;
        return { ...e, value, enabled };
      });
      commit(ops.updateClip(state.project, clipId, { effects }));
    },

    removeEffect: (clipId, effectId) => {
      const state = get();
      const clip = ops.getClip(state.project, clipId);
      if (!clip) return;
      commit(ops.updateClip(state.project, clipId, { effects: clip.effects.filter((e) => e.id !== effectId) }));
    },

    /* ---------------------------------- Tracks ----------------------------------- */

    addTrack: (kind) => commit(ops.addTrack(get().project, kind, newId('trk'))),
    removeTrack: (trackId) => commit(ops.removeTrack(get().project, trackId)),
    updateTrack: (trackId, patch) => commit(ops.updateTrack(get().project, trackId, patch)),

    /* --------------------------------- Transport --------------------------------- */

    setPlayhead: (frame) => {
      const next = Math.max(0, Math.round(frame));
      if (next !== get().playhead) set({ playhead: next });
    },

    setPlaying: (playing) => {
      if (playing !== get().isPlaying) set({ isPlaying: playing });
    },

    /* ------------------------------ Selection & view ----------------------------- */

    select: (clipIds, additive = false) =>
      set((s) => {
        const base = additive ? s.selectedClipIds : [];
        const merged = [...base];
        for (const id of clipIds) if (!merged.includes(id)) merged.push(id);
        return { selectedClipIds: merged };
      }),

    toggleSelect: (clipId) =>
      set((s) => ({
        selectedClipIds: s.selectedClipIds.includes(clipId)
          ? s.selectedClipIds.filter((id) => id !== clipId)
          : [...s.selectedClipIds, clipId],
      })),

    clearSelection: () => {
      if (get().selectedClipIds.length > 0) set({ selectedClipIds: [] });
    },

    setPxPerSecond: (value) => {
      const next = clamp(value, MIN_PX_PER_SECOND, MAX_PX_PER_SECOND);
      if (next !== get().pxPerSecond) set({ pxPerSecond: next });
    },

    toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled })),

    setActivePanel: (panel) => set({ activePanel: panel }),

    /* ---------------------------------- History ---------------------------------- */

    beginTransaction: () => {
      if (get().transactionSnapshot === null) set((s) => ({ transactionSnapshot: s.project }));
    },

    endTransaction: () => {
      const state = get();
      const snapshot = state.transactionSnapshot;
      if (snapshot === null) return;
      if (snapshot === state.project) {
        set({ transactionSnapshot: null });
        return;
      }
      const past = [...state.past, snapshot];
      if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
      set({ transactionSnapshot: null, past, future: [] });
    },

    undo: () => {
      const state = get();
      if (state.transactionSnapshot !== null || state.past.length === 0) return;
      const previous = state.past[state.past.length - 1]!;
      set({
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
        selectedClipIds: pruneSelection(state.selectedClipIds, previous),
      });
    },

    redo: () => {
      const state = get();
      if (state.transactionSnapshot !== null || state.future.length === 0) return;
      const next = state.future[0]!;
      set({
        project: next,
        past: [...state.past, state.project],
        future: state.future.slice(1),
        selectedClipIds: pruneSelection(state.selectedClipIds, next),
      });
    },
  };
});

/* ------------------------------------------------------------------------------------------------
 * Selectors
 * --------------------------------------------------------------------------------------------- */

export const selectCanUndo = (s: EditorStore): boolean => s.past.length > 0;
export const selectCanRedo = (s: EditorStore): boolean => s.future.length > 0;
export const selectDuration = (s: EditorStore): Frames => ops.projectDuration(s.project);
export const selectPrimaryClip = (s: EditorStore): Clip | undefined => {
  const id = s.selectedClipIds[s.selectedClipIds.length - 1];
  return id ? ops.getClip(s.project, id) : undefined;
};
