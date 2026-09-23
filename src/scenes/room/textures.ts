/**
 * Canvas helpers for the room's runtime surfaces: a seeded RNG (so every
 * visit paints the same props), 2D canvases, and the label-tape atlas the
 * floppies print their names from.
 */
import * as THREE from 'three';

/** mulberry32: tiny seeded PRNG — the same room on every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat = 1, color = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

export interface LabelSpec {
  readonly text: string;
  /** Tape colour; text is always near-black. */
  readonly tape?: string;
}

export interface LabelAtlas {
  readonly texture: THREE.CanvasTexture;
  /** UV rect [u0, v0, u1, v1] of label i. */
  uv(i: number): readonly [number, number, number, number];
  /** Width / height of label i as painted, for sizing its quad. */
  aspect(i: number): number;
}

/**
 * Embossed label-maker tape, one strip per row: the rack's machine names
 * and the floppy labels are the same prop, printed from one atlas so each
 * set of labels is a single draw call.
 */
export function labelAtlas(labels: readonly LabelSpec[], font = '600 26px "IBM Plex Mono", monospace'): LabelAtlas {
  const rowH = 40;
  const w = 512;
  const h = THREE.MathUtils.ceilPowerOfTwo(Math.max(rowH * labels.length, 64));
  const [c, ctx] = canvas2d(w, h);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  const widths: number[] = [];
  labels.forEach((label, i) => {
    const tw = Math.min(ctx.measureText(label.text).width + 24, w);
    widths.push(tw);
    const y = i * rowH;
    ctx.fillStyle = label.tape ?? '#e8e2cf';
    ctx.fillRect(0, y + 2, tw, rowH - 4);
    ctx.fillStyle = '#141414';
    ctx.fillText(label.text, 12, y + rowH / 2 + 1, w - 24);
  });
  const texture = toTexture(c, 1);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return {
    texture,
    uv: i => [0, 1 - ((i + 1) * rowH - 2) / h, widths[i] / w, 1 - (i * rowH + 2) / h],
    aspect: i => widths[i] / (rowH - 4)
  };
}

/** Gives a PlaneGeometry the atlas rect of one label. */
export function applyUvRect(geometry: THREE.BufferGeometry, rect: readonly [number, number, number, number]): THREE.BufferGeometry {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const [u0, v0, u1, v1] = rect;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geometry;
}
