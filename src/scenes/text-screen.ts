/**
 * The 3D screen's surface: a 2D canvas painting terminal snapshots with a
 * phosphor glow, wrapped in a CanvasTexture.
 *
 * The canvas is 512×384 (4:3, matching the screen plane) and is redrawn
 * ONLY when the screen-text machine bumps its version — at most ~45 times a
 * second while typing, ~2/s for the caret blink while idle. Never per frame.
 */
import * as THREE from 'three';
import type { ScreenSnapshot } from './screen-text';

export const TEXTURE_W = 512;
export const TEXTURE_H = 384;

const FONT = '500 16px "IBM Plex Mono", monospace';
const LINE_H = 26;
const PAD_X = 16;
const PAD_Y = 20;

const BG = '#0a0f0b';
const PROMPT_COLOR = '#8df7bd';
const TEXT_COLOR = '#9fe8c0';
const CARET_COLOR = '#66f2a6';
const GLOW_BLUR = 8;

export interface TextScreen {
  readonly texture: THREE.CanvasTexture;
  /** Paints the snapshot; a no-op (and no texture upload) when the version
   *  has not changed since the last paint. */
  paint(snap: ScreenSnapshot): void;
  dispose(): void;
}

export function createTextScreen(): TextScreen {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_W;
  canvas.height = TEXTURE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  // Measured lazily on first paint: the self-hosted face is loaded by the
  // time the loop starts, so the caret is sized from the real glyphs.
  let charWidth = 0;
  let lastVersion = -1;

  function paint(snap: ScreenSnapshot): void {
    if (snap.version === lastVersion) return;
    lastVersion = snap.version;

    ctx!.font = FONT;
    if (charWidth === 0) charWidth = ctx!.measureText('M').width;
    ctx!.fillStyle = BG;
    ctx!.fillRect(0, 0, TEXTURE_W, TEXTURE_H);
    ctx!.textBaseline = 'top';
    ctx!.shadowColor = PROMPT_COLOR;
    ctx!.shadowBlur = GLOW_BLUR;

    // End-of-line x for the caret, if the caret sits on a typed line.
    let caretX: number | null = null;
    for (let i = 0; i < snap.lines.length; i++) {
      const line = snap.lines[i];
      const y = PAD_Y + i * LINE_H;
      let x = PAD_X;
      if (line.prompt) {
        ctx!.fillStyle = PROMPT_COLOR;
        ctx!.fillText(line.prompt, x, y);
        x += ctx!.measureText(line.prompt).width;
      }
      if (line.text) {
        ctx!.fillStyle = TEXT_COLOR;
        ctx!.fillText(line.text, x, y);
        x += ctx!.measureText(line.text).width;
      }
      if (i === snap.caretLine) caretX = x;
    }

    if (snap.caretVisible) {
      const caretY = PAD_Y + Math.min(snap.caretLine, snap.lines.length - 1) * LINE_H;
      ctx!.fillStyle = CARET_COLOR;
      ctx!.fillRect(
        (caretX ?? PAD_X) + 2,
        caretY + 3,
        charWidth * 0.6,
        LINE_H - 8
      );
    }

    texture.needsUpdate = true;
  }

  function dispose(): void {
    texture.dispose();
  }

  return { texture, paint, dispose };
}
