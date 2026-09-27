import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/core/store';
import { getClip, projectDuration } from '../src/core/timelineOps';
import { makeAsset, makeProject } from './helpers';

const fresh = (): void => {
  useEditorStore.getState().loadSession(makeProject(), { asset1: makeAsset({ id: 'asset1', duration: 4 }) });
};

describe('editor store', () => {
  beforeEach(fresh);

  it('adds clips from assets at the playhead onto the default tracks', () => {
    const store = useEditorStore.getState();
    store.setPlayhead(45);
    const id = store.addClipFromAsset('asset1');
    expect(id).not.toBeNull();
    const clip = getClip(useEditorStore.getState().project, id!)!;
    expect(clip).toMatchObject({ start: 45, duration: 120, trackId: 'v1', kind: 'video' });
    expect(useEditorStore.getState().selectedClipIds).toEqual([id]);
  });

  it('adds text clips to the top video track', () => {
    const id = useEditorStore.getState().addTextClip({ content: 'Hello' })!;
    const clip = getClip(useEditorStore.getState().project, id)!;
    expect(clip).toMatchObject({ kind: 'text', trackId: 'v2', duration: 150 });
    expect(clip.text?.content).toBe('Hello');
  });

  it('records history per action and supports undo/redo', () => {
    const store = useEditorStore.getState();
    const id = store.addClipFromAsset('asset1')!;
    store.moveClip(id, 300);
    expect(getClip(useEditorStore.getState().project, id)!.start).toBe(300);
    expect(useEditorStore.getState().past).toHaveLength(2);

    useEditorStore.getState().undo();
    expect(getClip(useEditorStore.getState().project, id)!.start).toBe(0);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.clips).toHaveLength(0);
    expect(useEditorStore.getState().selectedClipIds).toEqual([]);

    useEditorStore.getState().redo();
    useEditorStore.getState().redo();
    expect(getClip(useEditorStore.getState().project, id)!.start).toBe(300);
    expect(useEditorStore.getState().future).toHaveLength(0);
  });

  it('collapses a transaction into a single undo step', () => {
    const store = useEditorStore.getState();
    const id = store.addClipFromAsset('asset1')!;
    store.beginTransaction();
    store.moveClip(id, 10);
    store.moveClip(id, 20);
    store.moveClip(id, 30);
    expect(useEditorStore.getState().past).toHaveLength(1); // only the add so far
    store.endTransaction();
    expect(useEditorStore.getState().past).toHaveLength(2);
    useEditorStore.getState().undo();
    expect(getClip(useEditorStore.getState().project, id)!.start).toBe(0);
  });

  it('does not record empty transactions or no-op actions', () => {
    const store = useEditorStore.getState();
    const id = store.addClipFromAsset('asset1')!;
    store.beginTransaction();
    store.moveClip(id, 0);
    store.endTransaction();
    store.moveClip('missing', 5);
    expect(useEditorStore.getState().past).toHaveLength(1);
  });

  it('splits at the playhead and keeps the selection on both halves', () => {
    const store = useEditorStore.getState();
    const id = store.addClipFromAsset('asset1')!;
    store.setPlayhead(50);
    store.splitAtPlayhead();
    const clips = useEditorStore.getState().project.clips;
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ id, start: 0, duration: 50 });
    expect(clips[1]).toMatchObject({ start: 50, duration: 70, offset: 50 });
    expect(useEditorStore.getState().selectedClipIds).toEqual([id, clips[1]!.id]);
  });

  it('removing an asset removes its clips (even on locked tracks) and prunes selection', () => {
    const store = useEditorStore.getState();
    const id = store.addClipFromAsset('asset1')!;
    store.updateTrack('v1', { locked: true });
    store.removeAsset('asset1');
    const state = useEditorStore.getState();
    expect(state.assets.asset1).toBeUndefined();
    expect(getClip(state.project, id)).toBeUndefined();
    expect(state.selectedClipIds).toEqual([]);
    expect(state.project.tracks.find((t) => t.id === 'v1')!.locked).toBe(true);
  });

  it('manages effects with clamped values', () => {
    const store = useEditorStore.getState();
    const id = store.addClipFromAsset('asset1')!;
    store.addEffect(id, 'brightness');
    let clip = getClip(useEditorStore.getState().project, id)!;
    expect(clip.effects).toHaveLength(1);
    const fxId = clip.effects[0]!.id;
    store.updateEffect(id, fxId, { value: 42 });
    clip = getClip(useEditorStore.getState().project, id)!;
    expect(clip.effects[0]!.value).toBe(2);
    store.removeEffect(id, fxId);
    expect(getClip(useEditorStore.getState().project, id)!.effects).toHaveLength(0);
  });

  it('changing fps rescales the playhead and clips', () => {
    const store = useEditorStore.getState();
    store.addClipFromAsset('asset1');
    store.setPlayhead(60);
    store.setFps(60);
    const state = useEditorStore.getState();
    expect(state.project.fps).toBe(60);
    expect(state.playhead).toBe(120);
    expect(projectDuration(state.project)).toBe(240);
  });

  it('clamps zoom and normalises the playhead', () => {
    const store = useEditorStore.getState();
    store.setPxPerSecond(1);
    expect(useEditorStore.getState().pxPerSecond).toBe(4);
    store.setPxPerSecond(10_000);
    expect(useEditorStore.getState().pxPerSecond).toBe(800);
    store.setPlayhead(-3.7);
    expect(useEditorStore.getState().playhead).toBe(0);
    store.setPlayhead(12.4);
    expect(useEditorStore.getState().playhead).toBe(12);
  });
});
