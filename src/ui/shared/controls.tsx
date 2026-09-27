import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../core/store';

/* ------------------------------------------------------------------------------------------------
 * Buttons
 * --------------------------------------------------------------------------------------------- */

type Variant = 'ghost' | 'solid' | 'danger' | 'accent';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  ghost: 'text-neutral-300 hover:bg-neutral-800 hover:text-white',
  solid: 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700',
  danger: 'text-red-300 hover:bg-red-950/60 hover:text-red-200',
  accent: 'bg-accent text-white hover:bg-indigo-500',
};

/** Icon button with a 44px minimum touch target (Apple HIG / Material guidance). */
export function IconButton({ label, active = false, variant = 'ghost', className = '', children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASS[variant]} ${active ? 'bg-neutral-700/80 text-white ring-1 ring-accent/60' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function TextButton({ variant = 'solid', className = '', children, ...rest }: TextButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Section
 * --------------------------------------------------------------------------------------------- */

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3 last:border-b-0">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</h3>
        {action}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Slider with numeric input. Drags are wrapped in a store transaction (one undo step per drag).
 * --------------------------------------------------------------------------------------------- */

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  onChange: (value: number) => void;
  onReset?: (() => void) | undefined;
}

export function SliderField({ label, value, min, max, step, unit = '', decimals = 2, onChange, onReset }: SliderFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const transactionOpen = useRef(false);

  const endTransaction = useCallback(() => {
    if (!transactionOpen.current) return;
    transactionOpen.current = false;
    useEditorStore.getState().endTransaction();
  }, []);

  const beginTransaction = useCallback(() => {
    if (transactionOpen.current) return;
    transactionOpen.current = true;
    useEditorStore.getState().beginTransaction();
    window.addEventListener('pointerup', endTransaction, { once: true });
    window.addEventListener('pointercancel', endTransaction, { once: true });
  }, [endTransaction]);

  useEffect(() => endTransaction, [endTransaction]);

  const commitDraft = (): void => {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
  };

  const display = draft ?? value.toFixed(decimals).replace(/\.?0+$/, '');

  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-300">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={display}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setDraft(display)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setDraft(null);
            }}
            className="w-16 rounded border border-line bg-neutral-900 px-1.5 py-0.5 text-right text-xs tabular-nums text-neutral-100 outline-none focus:border-accent"
          />
          {unit && <span className="w-4 text-neutral-500">{unit}</span>}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded px-1 text-[10px] uppercase text-neutral-500 hover:text-white"
              title="Reset"
            >
              ↺
            </button>
          )}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={beginTransaction}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
    </label>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Toggle
 * --------------------------------------------------------------------------------------------- */

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-9 items-center justify-between text-xs text-neutral-300">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-neutral-700'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`}
        />
      </button>
    </label>
  );
}
