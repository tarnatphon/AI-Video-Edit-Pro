/**
 * Minimal browser API shims for jsdom so the full React app can mount in unit tests.
 * Everything here is a no-op stand-in; behaviour is asserted through the store, not pixels.
 */

type StorageName = 'localStorage' | 'sessionStorage';

function isStorage(value: unknown): value is Storage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Storage).getItem === 'function' &&
    typeof (value as Storage).setItem === 'function' &&
    typeof (value as Storage).clear === 'function'
  );
}

/** Spec-shaped in-memory Storage used when neither jsdom nor the runtime provides a working one. */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => map.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      map.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      map.delete(String(key));
    },
    clear: () => map.clear(),
  };
  return storage;
}

/**
 * Resolve a usable Web Storage object for the given global name.
 *
 * Node ≥ 22 (with --experimental-webstorage) and Node ≥ 25 (by default) define their own global
 * `localStorage` accessor. Without `--localstorage-file` it throws (Node 22) or returns `undefined`
 * (Node 25+), and because the global already exists vitest's jsdom environment does not replace it.
 * vitest also rewrites `document.defaultView` to point at the Node global, so the real jsdom window
 * has to be reached through `globalThis.jsdom` instead.
 */
function resolveStorage(name: StorageName): Storage {
  const jsdomWindow = (globalThis as { jsdom?: { window?: Partial<Record<StorageName, unknown>> } }).jsdom?.window;
  try {
    const fromJsdom = jsdomWindow?.[name];
    if (isStorage(fromJsdom)) return fromJsdom;
  } catch {
    // jsdom throws for opaque origins — fall through.
  }
  try {
    const current = (globalThis as Partial<Record<StorageName, unknown>>)[name];
    if (isStorage(current)) return current;
  } catch {
    // Node 22 throws when the storage file is not configured — fall through.
  }
  return createMemoryStorage();
}

export function installBrowserMocks(options: { desktop?: boolean } = {}): void {
  const desktop = options.desktop ?? true;

  // Web Storage — always bind a working Storage object to the global (see resolveStorage).
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: resolveStorage(name),
    });
  }

  // matchMedia — drive the responsive layout.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('min-width') ? desktop : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });

  // ResizeObserver
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, writable: true, value: ResizeObserverMock });

  // requestAnimationFrame (jsdom only provides it with pretendToBeVisual).
  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
  }

  // Canvas 2D — a permissive fake so drawing code paths execute.
  const fakeContext = () => {
    const noop = (): void => undefined;
    const ctx: Record<string, unknown> = {
      canvas: null,
      filter: 'none',
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'top',
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetY: 0,
      save: noop,
      restore: noop,
      setTransform: noop,
      scale: noop,
      translate: noop,
      rotate: noop,
      fillRect: noop,
      clearRect: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      stroke: noop,
      fill: noop,
      fillText: noop,
      drawImage: noop,
      putImageData: noop,
      measureText: (text: string) => ({ width: text.length * 8 }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    };
    return ctx;
  };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function getContext(this: HTMLCanvasElement) {
      const ctx = fakeContext();
      ctx.canvas = this;
      return ctx;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', { configurable: true, writable: true, value: () => 'data:image/jpeg;base64,' });

  // Media elements
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, writable: true, value: () => undefined });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, writable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, writable: true, value: () => undefined });

  // Pointer capture
  for (const name of ['setPointerCapture', 'releasePointerCapture'] as const) {
    Object.defineProperty(Element.prototype, name, { configurable: true, writable: true, value: () => undefined });
  }
  Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, writable: true, value: () => false });

  // Layout: give the timeline a believable geometry.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 300 });

  const RULER_H = 28;
  const HEADER_W = 112;
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value: function getBoundingClientRect(this: Element): DOMRect {
      const make = (left: number, top: number, width: number, height: number): DOMRect =>
        ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

      if (this instanceof HTMLElement && this.dataset.clipId) {
        const left = HEADER_W + Number.parseFloat(this.style.left || '0');
        const width = Number.parseFloat(this.style.width || '0');
        const lane = this.parentElement;
        const laneRect = lane ? lane.getBoundingClientRect() : make(0, RULER_H, 0, 64);
        return make(left, laneRect.top + 4, width, laneRect.height - 8);
      }
      if (this instanceof HTMLElement && this.dataset.trackId) {
        const lanes = Array.from(document.querySelectorAll<HTMLElement>('[data-track-id]'));
        let top = RULER_H;
        for (const lane of lanes) {
          const height = Number.parseFloat(lane.parentElement?.style.height || '64');
          if (lane === this) return make(HEADER_W, top, 1200 - HEADER_W, height);
          top += height;
        }
      }
      return make(0, 0, 1200, 300);
    },
  });
}
