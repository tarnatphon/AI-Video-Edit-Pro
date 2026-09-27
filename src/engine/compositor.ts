/**
 * Compositor: paints one timeline frame onto a 2D canvas.
 *
 * Video tracks are painted bottom-up (last video track in `project.tracks` first) so that upper
 * tracks overlay lower ones. Transforms are expressed in project pixels; the canvas may be any
 * size with the same aspect ratio (preview thumbnails, full-resolution export).
 */

import { applyPixelEffects, buildCanvasFilter, needsPixelFallback } from '../core/effects';
import { activeClipOnTrack, fadeFactor } from '../core/timelineOps';
import type { Clip, Frames, MediaAsset, Project, TextStyle } from '../core/types';
import type { FrameSource } from './sources';

export interface RenderInput {
  project: Project;
  assets: Readonly<Record<string, MediaAsset>>;
  frame: Frames;
  resolveSource: (clip: Clip) => FrameSource | null;
}

let filterSupport: boolean | null = null;

/** `CanvasRenderingContext2D.filter` is missing on older Safari. */
export function canvasFilterSupported(ctx: CanvasRenderingContext2D): boolean {
  if (filterSupport === null) {
    filterSupport = typeof (ctx as Partial<CanvasRenderingContext2D>).filter === 'string';
  }
  return filterSupport;
}

export class Compositor {
  private scratch: HTMLCanvasElement | null = null;

  render(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { project, frame } = input;
    const { width: W, height: H } = ctx.canvas;
    if (W === 0 || H === 0) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (canvasFilterSupported(ctx)) ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const scaleX = W / project.width;
    const scaleY = H / project.height;
    ctx.scale(scaleX, scaleY);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const videoTracks = project.tracks.filter((t) => t.kind === 'video');
    for (let i = videoTracks.length - 1; i >= 0; i--) {
      const track = videoTracks[i]!;
      if (track.hidden) continue;
      const clip = activeClipOnTrack(project, track.id, frame);
      if (!clip) continue;
      const alpha = clip.transform.opacity * fadeFactor(clip, frame);
      if (alpha <= 0) continue;

      if (clip.kind === 'text') {
        if (clip.text) this.drawText(ctx, project, clip, clip.text, alpha);
      } else {
        this.drawMedia(ctx, project, clip, alpha, input.resolveSource(clip), scaleX);
      }
    }
    ctx.restore();
  }

  private applyClipTransform(ctx: CanvasRenderingContext2D, project: Project, clip: Clip, alpha: number): void {
    const t = clip.transform;
    ctx.globalAlpha = alpha;
    ctx.translate(project.width / 2 + t.x, project.height / 2 + t.y);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scale, t.scale);
  }

  private drawMedia(
    ctx: CanvasRenderingContext2D,
    project: Project,
    clip: Clip,
    alpha: number,
    source: FrameSource | null,
    pixelScale: number,
  ): void {
    if (!source || !source.ready()) return;
    const image = source.image();
    if (!image) return;
    const nw = source.naturalWidth();
    const nh = source.naturalHeight();
    if (nw <= 0 || nh <= 0) return;

    // "Fit" the media inside the frame, then apply the user transform.
    const fit = Math.min(project.width / nw, project.height / nh);
    const w = nw * fit;
    const h = nh * fit;

    ctx.save();
    this.applyClipTransform(ctx, project, clip, alpha);

    let drawable: CanvasImageSource = image;
    const filter = buildCanvasFilter(clip.effects);
    if (filter !== 'none') {
      if (canvasFilterSupported(ctx)) {
        ctx.filter = filter;
      } else if (needsPixelFallback(clip.effects)) {
        const filtered = this.filterViaPixels(image, w * pixelScale * clip.transform.scale, h * pixelScale * clip.transform.scale, nw, nh, clip);
        if (filtered) drawable = filtered;
      }
    }

    try {
      ctx.drawImage(drawable, -w / 2, -h / 2, w, h);
    } catch {
      // A frame may transiently be undecodable (e.g. mid-seek); skip it silently.
    }
    ctx.restore();
  }

  /** Software effects path: draw into a scratch canvas, transform pixels, return the canvas. */
  private filterViaPixels(
    image: CanvasImageSource,
    targetW: number,
    targetH: number,
    naturalW: number,
    naturalH: number,
    clip: Clip,
  ): HTMLCanvasElement | null {
    const w = Math.max(1, Math.min(Math.round(targetW), naturalW));
    const h = Math.max(1, Math.min(Math.round(targetH), naturalH));
    this.scratch ??= document.createElement('canvas');
    const scratch = this.scratch;
    if (scratch.width !== w) scratch.width = w;
    if (scratch.height !== h) scratch.height = h;
    const sctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!sctx) return null;
    try {
      sctx.clearRect(0, 0, w, h);
      sctx.drawImage(image, 0, 0, w, h);
      const data = sctx.getImageData(0, 0, w, h);
      applyPixelEffects(data.data, clip.effects);
      sctx.putImageData(data, 0, 0);
      return scratch;
    } catch {
      return null;
    }
  }

  private drawText(ctx: CanvasRenderingContext2D, project: Project, clip: Clip, style: TextStyle, alpha: number): void {
    const lines = style.content.split('\n');
    const lineHeight = style.fontSize * 1.2;
    const blockHeight = lines.length * lineHeight;

    ctx.save();
    this.applyClipTransform(ctx, project, clip, alpha);
    ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? '700' : '400'} ${style.fontSize}px ${style.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = style.align;

    let blockWidth = 0;
    for (const line of lines) blockWidth = Math.max(blockWidth, ctx.measureText(line).width);

    const filter = buildCanvasFilter(clip.effects);
    if (filter !== 'none' && canvasFilterSupported(ctx)) ctx.filter = filter;

    if (style.background) {
      const pad = style.fontSize * 0.35;
      ctx.fillStyle = style.background;
      ctx.fillRect(-blockWidth / 2 - pad, -blockHeight / 2 - pad, blockWidth + pad * 2, blockHeight + pad * 2);
    }

    const x = style.align === 'left' ? -blockWidth / 2 : style.align === 'right' ? blockWidth / 2 : 0;
    ctx.fillStyle = style.color;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = style.fontSize * 0.08;
    ctx.shadowOffsetY = style.fontSize * 0.03;
    lines.forEach((line, index) => {
      const y = -blockHeight / 2 + lineHeight * (index + 0.5);
      ctx.fillText(line, x, y);
    });
    ctx.restore();
  }
}
