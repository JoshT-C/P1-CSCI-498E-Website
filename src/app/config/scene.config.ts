/**
 * 3D scene budgets. Everything the render loop measures itself against
 * lives here, so tuning never means hunting through the loop.
 */

/**
 * Render budget and the frame-rate governor (src/scenes/governor.ts).
 *
 * Tuned on this project's weakest test GPU, the Ryzen 9950X's integrated
 * Radeon (2 CUs): the full room at 1080p ran 41-48 fps with 34 ms hitches,
 * and a 2x laptop screen 21 fps until the old governor gave up on it.
 * Every second the governor measures; under targetFps it lowers the render
 * scale (two steps when far under), after highWindowsToStepUp comfortable
 * seconds it raises it again, and only at minScale and under floorFps for
 * lowWindowsToDowngrade seconds does the tier step down.
 */
export const RENDER = {
  /** At most this many device pixels per frame (1080p is 2.07 M). */
  pixelBudget: { room: 2_100_000, desk: 1_300_000 },
  /** devicePixelRatio caps per tier. */
  dprCap: { room: 2, desk: 2 },
  windowMs: 1000,
  warmupMs: 1500,
  targetFps: 50,
  comfortableFps: 57,
  floorFps: 28,
  minScale: 0.5,
  stepDown: 0.15,
  stepUp: 0.1,
  highWindowsToStepUp: 3,
  lowWindowsToDowngrade: 2
} as const;

/** How long the first frame waits for the self-hosted font before drawing
 *  the screen texture in the fallback monospace. */
export const FONT_WAIT_MS = 1500;

/** Camera damping time constants, ms: scroll-driven moves track closely,
 *  station moves glide. */
export const CAMERA_TAU_MS = { spine: 110, station: 380 } as const;

/** The tube's warm-up after the scene starts, ms. */
export const WARMUP = { delayMs: 350, durationMs: 1600 } as const;

/** The floppy shelf: disks per row, and each disk's label stripe (by shelf
 *  order). The panel's disk buttons use the same stripes and rows, so each
 *  button can be matched to its disk at a glance. */
export const FLOPPY_PER_ROW = 3;
export const FLOPPY_STRIPES = ['#c0392b', '#2e86c1', '#27ae60', '#d4a017', '#8e44ad', '#16a085'] as const;
