/**
 * Minimal browser API shims for jsdom so the full React app can mount in unit tests.
 * Everything here is a no-op stand-in; behaviour is asserted through the store, not pixels.
 */

export function installBrowserMocks(options: { desktop?: boolean } = {}): void {
  const desktop = options.desktop ?? true;

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
