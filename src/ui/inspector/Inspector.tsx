import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from 'lucide-react';
import { EFFECT_DEFINITIONS } from '../../core/effects';
import { selectPrimaryClip, useEditorStore } from '../../core/store';
import { formatTimecode } from '../../core/time';
import { clipEnd, MAX_SPEED, MIN_SPEED, type ClipPatch } from '../../core/timelineOps';
import { DEFAULT_TRANSFORM, EFFECT_TYPES, RESOLUTION_PRESETS, SUPPORTED_FPS, type Clip, type EffectType } from '../../core/types';
import { IconButton, Section, SliderField, TextButton, ToggleRow } from '../shared/controls';

export function Inspector() {
  const clip = useEditorStore(selectPrimaryClip);
  return (
    <div className="thin-scrollbar flex h-full flex-col overflow-y-auto">
      <div className="flex h-11 shrink-0 items-center border-b border-line px-3">
        <h2 className="text-sm font-semibold">{clip ? 'Clip' : 'Project'}</h2>
        {clip && <span className="ml-2 truncate text-xs text-neutral-500">{clip.name}</span>}
      </div>
      {clip ? <ClipInspector clip={clip} /> : <ProjectInspector />}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Project settings
 * --------------------------------------------------------------------------------------------- */

function ProjectInspector() {
  const project = useEditorStore((s) => s.project);
  const clipCount = project.clips.length;
  const store = useEditorStore.getState;
  const presetId = RESOLUTION_PRESETS.find((p) => p.width === project.width && p.height === project.height)?.id ?? 'custom';

  return (
    <>
      <Section title="Sequence">
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Name
          <input
            type="text"
            defaultValue={project.name}
            key={project.id + project.name}
            onBlur={(e) => store().renameProject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="h-9 rounded-md border border-line bg-neutral-900 px-2 text-sm text-neutral-100 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Resolution
          <select
            value={presetId}
            onChange={(e) => {
              const preset = RESOLUTION_PRESETS.find((p) => p.id === e.target.value);
              if (preset) store().setResolution(preset.width, preset.height);
            }}
            className="h-9 rounded-md border border-line bg-neutral-900 px-2 text-sm text-neutral-100 outline-none focus:border-accent"
          >
            {presetId === 'custom' && <option value="custom">{`Custom (${project.width}×${project.height})`}</option>}
            {RESOLUTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Frame rate
          <select
            value={project.fps}
            onChange={(e) => store().setFps(Number.parseInt(e.target.value, 10))}
            className="h-9 rounded-md border border-line bg-neutral-900 px-2 text-sm text-neutral-100 outline-none focus:border-accent"
          >
            {SUPPORTED_FPS.map((fps) => (
              <option key={fps} value={fps}>
                {fps} fps
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] leading-relaxed text-neutral-500">
          {clipCount} clip{clipCount === 1 ? '' : 's'} · {project.tracks.length} tracks. Select a clip on the timeline to edit its
          timing, transform, audio and effects.
        </p>
      </Section>
      <Section title="Shortcuts">
        <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-neutral-400">
          <Key k="Space" d="Play / pause" />
          <Key k="← →" d="Step 1 frame (⇧ = 10)" />
          <Key k="S" d="Split at playhead" />
          <Key k="⌫" d="Delete (⇧⌫ ripple)" />
          <Key k="⌘Z / ⇧⌘Z" d="Undo / redo" />
          <Key k="⌘D" d="Duplicate" />
          <Key k="⌘ + wheel" d="Zoom timeline" />
          <Key k="N" d="Toggle snapping" />
          <Key k="T" d="Add title" />
        </ul>
      </Section>
    </>
  );
}

function Key({ k, d }: { k: string; d: string }) {
  return (
    <>
      <kbd className="rounded border border-line bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">{k}</kbd>
      <span className="self-center">{d}</span>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Clip settings
 * --------------------------------------------------------------------------------------------- */

function ClipInspector({ clip }: { clip: Clip }) {
  const fps = useEditorStore((s) => s.project.fps);
  const store = useEditorStore.getState;
  const update = (patch: ClipPatch): void => store().updateClip(clip.id, patch);

  const isVisual = clip.kind !== 'audio';
  const hasAudio = clip.kind === 'audio' || clip.kind === 'video';
  const t = clip.transform;

  return (
    <>
      <Section title="Timing">
        <div className="grid grid-cols-3 gap-2 text-[11px] text-neutral-400">
          <Stat label="In" value={formatTimecode(clip.start, fps)} />
          <Stat label="Out" value={formatTimecode(clipEnd(clip), fps)} />
          <Stat label="Length" value={formatTimecode(clip.duration, fps)} />
        </div>
        {clip.kind !== 'text' && clip.kind !== 'image' && (
          <SliderField
            label="Speed"
            value={clip.speed}
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.05}
            unit="×"
            onChange={(v) => store().setClipSpeed(clip.id, v)}
            onReset={clip.speed !== 1 ? () => store().setClipSpeed(clip.id, 1) : undefined}
          />
        )}
        <SliderField
          label="Fade in"
          value={clip.fadeIn / fps}
          min={0}
          max={Math.max(0.1, clip.duration / fps)}
          step={0.05}
          unit="s"
          onChange={(v) => update({ fadeIn: Math.round(v * fps) })}
        />
        <SliderField
          label="Fade out"
          value={clip.fadeOut / fps}
          min={0}
          max={Math.max(0.1, clip.duration / fps)}
          step={0.05}
          unit="s"
          onChange={(v) => update({ fadeOut: Math.round(v * fps) })}
        />
      </Section>

      {hasAudio && (
        <Section title="Audio">
          <SliderField label="Volume" value={clip.volume} min={0} max={2} step={0.01} unit="×" onChange={(v) => update({ volume: v })} onReset={clip.volume !== 1 ? () => update({ volume: 1 }) : undefined} />
          <ToggleRow label="Mute" checked={clip.muted} onChange={(v) => update({ muted: v })} />
        </Section>
      )}

      {isVisual && (
        <Section
          title="Transform"
          action={
            <button type="button" onClick={() => update({ transform: { ...DEFAULT_TRANSFORM } })} className="text-[11px] text-neutral-400 hover:text-white">
              Reset
            </button>
          }
        >
          <SliderField label="Position X" value={t.x} min={-2000} max={2000} step={1} unit="px" decimals={0} onChange={(v) => update({ transform: { ...t, x: v } })} />
          <SliderField label="Position Y" value={t.y} min={-2000} max={2000} step={1} unit="px" decimals={0} onChange={(v) => update({ transform: { ...t, y: v } })} />
          <SliderField label="Scale" value={t.scale} min={0.05} max={4} step={0.01} unit="×" onChange={(v) => update({ transform: { ...t, scale: v } })} />
          <SliderField label="Rotation" value={t.rotation} min={-180} max={180} step={1} unit="°" decimals={0} onChange={(v) => update({ transform: { ...t, rotation: v } })} />
          <SliderField label="Opacity" value={t.opacity} min={0} max={1} step={0.01} onChange={(v) => update({ transform: { ...t, opacity: v } })} />
        </Section>
      )}

      {clip.kind === 'text' && clip.text && <TextSection clip={clip} />}

      {isVisual && <EffectsSection clip={clip} />}

      <Section title="Danger zone">
        <div className="flex gap-2">
          <TextButton variant="danger" onClick={() => store().removeClips([clip.id])}>
            <Trash2 size={14} /> Delete clip
          </TextButton>
          <TextButton variant="solid" onClick={() => store().rippleDeleteClips([clip.id])}>
            Ripple delete
          </TextButton>
        </div>
      </Section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-neutral-900 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="font-mono text-xs tabular-nums text-neutral-100">{value}</div>
    </div>
  );
}

function TextSection({ clip }: { clip: Clip }) {
  const style = clip.text!;
  const store = useEditorStore.getState;
  const patch = (next: Partial<typeof style>): void => store().updateClip(clip.id, { text: { ...style, ...next }, name: next.content ?? clip.name });

  return (
    <Section title="Text">
      <textarea
        value={style.content}
        onChange={(e) => patch({ content: e.target.value })}
        rows={3}
        className="thin-scrollbar w-full resize-y rounded-md border border-line bg-neutral-900 p-2 text-sm text-neutral-100 outline-none focus:border-accent"
      />
      <SliderField label="Size" value={style.fontSize} min={12} max={400} step={1} unit="px" decimals={0} onChange={(v) => patch({ fontSize: v })} />
      <div className="flex items-center justify-between text-xs text-neutral-300">
        <span>Colour</span>
        <input type="color" value={style.color} onChange={(e) => patch({ color: e.target.value })} aria-label="Text colour" />
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-300">
        <span>Background</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={style.background ?? '#000000'}
            onChange={(e) => patch({ background: e.target.value })}
            aria-label="Background colour"
          />
          <button type="button" onClick={() => patch({ background: null })} className="text-[11px] text-neutral-400 hover:text-white">
            None
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="Bold" active={style.bold} onClick={() => patch({ bold: !style.bold })} className="h-9 min-w-9 font-bold">
          B
        </IconButton>
        <IconButton label="Italic" active={style.italic} onClick={() => patch({ italic: !style.italic })} className="h-9 min-w-9 italic">
          I
        </IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton label="Align left" active={style.align === 'left'} onClick={() => patch({ align: 'left' })} className="h-9 min-w-9">
          <AlignLeft size={16} />
        </IconButton>
        <IconButton label="Align centre" active={style.align === 'center'} onClick={() => patch({ align: 'center' })} className="h-9 min-w-9">
          <AlignCenter size={16} />
        </IconButton>
        <IconButton label="Align right" active={style.align === 'right'} onClick={() => patch({ align: 'right' })} className="h-9 min-w-9">
          <AlignRight size={16} />
        </IconButton>
      </div>
    </Section>
  );
}

function EffectsSection({ clip }: { clip: Clip }) {
  const store = useEditorStore.getState;
  return (
    <Section
      title="Effects"
      action={
        <label className="flex items-center gap-1 text-[11px] text-neutral-400">
          <Plus size={12} />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) store().addEffect(clip.id, e.target.value as EffectType);
            }}
            className="h-7 rounded border border-line bg-neutral-900 px-1 text-[11px] text-neutral-200 outline-none"
            aria-label="Add effect"
          >
            <option value="">Add effect…</option>
            {EFFECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EFFECT_DEFINITIONS[type].label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {clip.effects.length === 0 && <p className="text-[11px] text-neutral-500">No effects yet. Try Brightness, Black &amp; White or Blur.</p>}
      {clip.effects.map((effect) => {
        const def = EFFECT_DEFINITIONS[effect.type];
        return (
          <div key={effect.id} className={`rounded-md border border-line p-2 ${effect.enabled ? '' : 'opacity-50'}`}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-200">{def.label}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => store().updateEffect(clip.id, effect.id, { enabled: !effect.enabled })}
                  className="rounded px-1.5 text-[10px] uppercase text-neutral-400 hover:text-white"
                >
                  {effect.enabled ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => store().removeEffect(clip.id, effect.id)}
                  aria-label={`Remove ${def.label}`}
                  className="rounded p-1 text-neutral-500 hover:text-red-300"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <SliderField
              label="Amount"
              value={effect.value}
              min={def.min}
              max={def.max}
              step={def.step}
              unit={def.unit}
              onChange={(v) => store().updateEffect(clip.id, effect.id, { value: v })}
            />
          </div>
        );
      })}
    </Section>
  );
}
