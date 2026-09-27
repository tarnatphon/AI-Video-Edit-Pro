// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { useEditorStore } from '../src/core/store';
import { getClip } from '../src/core/timelineOps';
import { installBrowserMocks } from './setup/browserMocks';
import { makeAsset } from './helpers';

beforeAll(() => installBrowserMocks({ desktop: true }));

beforeEach(() => {
  localStorage.clear();
  useEditorStore.getState().newProject();
});

afterEach(() => cleanup());

async function mountApp() {
  const utils = render(<App />);
  await waitFor(() => expect(screen.getByText('Import')).toBeTruthy());
  return utils;
}

function seedAsset(): string {
  const asset = makeAsset({ id: 'asset1', duration: 4, name: 'clip.mp4', thumbnail: 'data:image/jpeg;base64,' });
  useEditorStore.getState().addAsset(asset);
  return asset.id;
}

describe('application smoke test (desktop layout)', () => {
  it('mounts every panel without runtime errors', async () => {
    await mountApp();
    expect(screen.getByText('Media')).toBeTruthy();
    expect(screen.getByLabelText('Play (Space)')).toBeTruthy();
    expect(screen.getByLabelText('Split at playhead (S)')).toBeTruthy();
    expect(screen.getByText('Project')).toBeTruthy();
    expect(screen.getByText('V2')).toBeTruthy();
    expect(screen.getByText('V1')).toBeTruthy();
    expect(screen.getByText('A1')).toBeTruthy();
  });

  it('adds a library asset to the timeline with the + button and renders the clip', async () => {
    await mountApp();
    act(() => {
      seedAsset();
    });
    expect(screen.getByText('clip.mp4')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Add to timeline'));

    const state = useEditorStore.getState();
    expect(state.project.clips).toHaveLength(1);
    const clip = state.project.clips[0]!;
    expect(clip).toMatchObject({ start: 0, duration: 120, trackId: state.project.tracks[1]!.id });
    expect(document.querySelector(`[data-clip-id="${clip.id}"]`)).toBeTruthy();
    // Inspector switches to clip mode
    expect(screen.getByText('Clip')).toBeTruthy();
    expect(screen.getByText('Transform')).toBeTruthy();
  });

  it('moves a clip by dragging it on the timeline (one undo step)', async () => {
    await mountApp();
    let clipId = '';
    act(() => {
      seedAsset();
      clipId = useEditorStore.getState().addClipFromAsset('asset1')!;
    });
    const element = document.querySelector<HTMLElement>(`[data-clip-id="${clipId}"]`)!;
    const rect = element.getBoundingClientRect();
    const grabX = rect.left + rect.width / 2;
    const grabY = rect.top + 10;
    const pxPerFrame = useEditorStore.getState().pxPerSecond / 30; // 2px per frame by default

    const pastBefore = useEditorStore.getState().past.length;
    fireEvent.pointerDown(element, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: grabX, clientY: grabY });
    fireEvent.pointerMove(element, { pointerId: 1, pointerType: 'mouse', clientX: grabX + 100 * pxPerFrame, clientY: grabY });
    fireEvent.pointerMove(element, { pointerId: 1, pointerType: 'mouse', clientX: grabX + 200 * pxPerFrame, clientY: grabY });
    fireEvent.pointerUp(element, { pointerId: 1, pointerType: 'mouse', clientX: grabX + 200 * pxPerFrame, clientY: grabY });

    const state = useEditorStore.getState();
    expect(getClip(state.project, clipId)!.start).toBe(200);
    expect(state.past.length).toBe(pastBefore + 1);
    expect(state.transactionSnapshot).toBeNull();

    act(() => state.undo());
    expect(getClip(useEditorStore.getState().project, clipId)!.start).toBe(0);
  });

  it('drags a clip vertically onto another compatible track', async () => {
    await mountApp();
    let clipId = '';
    act(() => {
      seedAsset();
      clipId = useEditorStore.getState().addClipFromAsset('asset1')!; // lands on V1 (second row)
    });
    const element = document.querySelector<HTMLElement>(`[data-clip-id="${clipId}"]`)!;
    const rect = element.getBoundingClientRect();
    const grabX = rect.left + rect.width / 2;
    const grabY = rect.top + 10;
    const v2 = useEditorStore.getState().project.tracks[0]!;

    fireEvent.pointerDown(element, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: grabX, clientY: grabY });
    fireEvent.pointerMove(element, { pointerId: 2, pointerType: 'mouse', clientX: grabX, clientY: grabY - 64 });
    fireEvent.pointerUp(element, { pointerId: 2, pointerType: 'mouse', clientX: grabX, clientY: grabY - 64 });

    expect(getClip(useEditorStore.getState().project, clipId)!.trackId).toBe(v2.id);
  });

  it('trims the end edge with the right handle and respects the source length', async () => {
    await mountApp();
    let clipId = '';
    act(() => {
      seedAsset();
      clipId = useEditorStore.getState().addClipFromAsset('asset1')!;
    });
    const element = document.querySelector<HTMLElement>(`[data-clip-id="${clipId}"]`)!;
    const rect = element.getBoundingClientRect();
    const grabX = rect.right - 2; // inside the trim-end handle
    const grabY = rect.top + 10;

    fireEvent.pointerDown(element, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: grabX, clientY: grabY });
    fireEvent.pointerMove(element, { pointerId: 3, pointerType: 'mouse', clientX: grabX - 60, clientY: grabY }); // -30 frames
    fireEvent.pointerUp(element, { pointerId: 3, pointerType: 'mouse', clientX: grabX - 60, clientY: grabY });
    expect(getClip(useEditorStore.getState().project, clipId)!.duration).toBe(90);

    // Extending beyond the 4s source is clamped back to 120 frames.
    const element2 = document.querySelector<HTMLElement>(`[data-clip-id="${clipId}"]`)!;
    const rect2 = element2.getBoundingClientRect();
    fireEvent.pointerDown(element2, { pointerId: 4, pointerType: 'mouse', button: 0, clientX: rect2.right - 2, clientY: grabY });
    fireEvent.pointerMove(element2, { pointerId: 4, pointerType: 'mouse', clientX: rect2.right + 500, clientY: grabY });
    fireEvent.pointerUp(element2, { pointerId: 4, pointerType: 'mouse', clientX: rect2.right + 500, clientY: grabY });
    expect(getClip(useEditorStore.getState().project, clipId)!.duration).toBe(120);
  });

  it('supports keyboard shortcuts: split, delete, undo, title', async () => {
    await mountApp();
    act(() => {
      seedAsset();
      useEditorStore.getState().addClipFromAsset('asset1');
      useEditorStore.getState().setPlayhead(40);
    });
    fireEvent.keyDown(window, { key: 's' });
    expect(useEditorStore.getState().project.clips).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(useEditorStore.getState().project.clips).toHaveLength(0);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(useEditorStore.getState().project.clips).toHaveLength(2);

    fireEvent.keyDown(window, { key: 't' });
    const clips = useEditorStore.getState().project.clips;
    expect(clips).toHaveLength(3);
    expect(clips.some((c) => c.kind === 'text')).toBe(true);
  });

  it('adds effects from the inspector and persists the session', async () => {
    await mountApp();
    act(() => {
      seedAsset();
      useEditorStore.getState().addClipFromAsset('asset1');
    });
    fireEvent.change(screen.getByLabelText('Add effect'), { target: { value: 'grayscale' } });
    const clip = useEditorStore.getState().project.clips[0]!;
    expect(clip.effects).toHaveLength(1);
    expect(clip.effects[0]!.type).toBe('grayscale');

    await waitFor(() => expect(localStorage.getItem('aivep.session.v1')).toBeTruthy(), { timeout: 3000 });
    const saved = JSON.parse(localStorage.getItem('aivep.session.v1')!);
    expect(saved.project.clips).toHaveLength(1);
    expect(saved.assets[0].id).toBe('asset1');
    expect(saved.assets[0].url).toBeUndefined();
  });
});
