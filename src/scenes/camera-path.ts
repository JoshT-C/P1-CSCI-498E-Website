/**
 * Pure camera math for the persistent 3D dive.
 *
 * A single scalar `p` — the page scroll fraction, 0 at the top → 1 at the
 * bottom — drives a dolly from a wide shot of the whole CRT to a close-up
 * on its glowing screen. Everything here is plain numbers, so it is unit
 * tested without three.js; machine.ts imports the CRT dimensions from here
 * (this file is the single source for the machine's physical constants).
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CameraPose {
  readonly position: Vec3;
  /** The point the camera looks at. */
  readonly target: Vec3;
  /** Vertical field of view in degrees (three.js convention). */
  readonly fov: number;
}

/**
 * Physical dimensions of the CRT all-in-one, in scene units. The chassis
 * bottom sits `standHeight` above the floor; the screen is a 4:3 rectangle
 * on the front face, slightly above the chassis center like a real 1980s
 * set. The keyboard slab in machine.ts is placed against the front face
 * using these same numbers.
 */
export const CRT = {
  width: 2.6,
  height: 2.4,
  depth: 2.0,
  standHeight: 0.35,
  screen: { width: 1.9, height: 1.425 },
  /** Screen center above the chassis center. */
  screenRise: 0.18
};

export const CHASSIS_CENTER: Vec3 = {
  x: 0,
  y: CRT.standHeight + CRT.height / 2,
  z: 0
};

/** The glowing screen plane, centered on the chassis front face. */
export const SCREEN_CENTER: Vec3 = {
  x: 0,
  y: CHASSIS_CENTER.y + CRT.screenRise,
  z: CRT.depth / 2
};

/** Wide shot: the whole machine, slightly off-axis. */
export const WIDE: CameraPose = {
  position: { x: 1.7, y: CHASSIS_CENTER.y + 0.35, z: 7.4 },
  target: { x: 0, y: CHASSIS_CENTER.y - 0.1, z: 0 },
  fov: 55
};

/**
 * Close-up: straight on, 2.2 units from the screen. At fov 40 the visible
 * height there is ≈1.6 (screen is 1.425) and, at a 16:9 aspect, the visible
 * width ≈2.85 (screen is 1.9) — the screen fills the frame with margin.
 */
export const CLOSE: CameraPose = {
  position: { x: 0, y: SCREEN_CENTER.y, z: SCREEN_CENTER.z + 2.2 },
  target: { x: 0, y: SCREEN_CENTER.y, z: SCREEN_CENTER.z },
  fov: 40
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** The dolly bows slightly sideways — a pure straight lerp reads as a
 * slider, the arc reads as a camera. */
const ARC_BOW = 0.4;

/**
 * Camera pose for scroll fraction `p`. Out-of-range values (including
 * ±Infinity) clamp to the exact endpoint poses; NaN lands on the wide shot —
 * the function can never emit a NaN.
 */
export function cameraPose(p: number): CameraPose {
  const t = Number.isNaN(p) ? 0 : Math.min(Math.max(p, 0), 1);
  if (t === 0) return WIDE;
  if (t === 1) return CLOSE;

  const s = smoothstep(t);
  return {
    position: {
      x: lerp(WIDE.position.x, CLOSE.position.x, s) + ARC_BOW * Math.sin(Math.PI * t),
      y: lerp(WIDE.position.y, CLOSE.position.y, s),
      z: lerp(WIDE.position.z, CLOSE.position.z, s)
    },
    target: {
      x: 0,
      y: lerp(WIDE.target.y, CLOSE.target.y, s),
      z: lerp(WIDE.target.z, CLOSE.target.z, s)
    },
    fov: lerp(WIDE.fov, CLOSE.fov, s)
  };
}
