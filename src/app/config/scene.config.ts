/**
 * 3D scene budgets. Everything the render loop measures itself against
 * lives here, so tuning never means hunting through the loop.
 */

/** Frame-rate governor: after a warm-up, two consecutive 2 s windows under
 *  LOW_FPS step the scene down one tier (room → desk → CSS). */
export const FPS_BUDGET = {
  lowFps: 28,
  windowMs: 2000,
  warmupMs: 3000,
  lowStreakNeeded: 2
} as const;

/** How long the first frame waits for the self-hosted font before drawing
 *  the screen texture in the fallback monospace. */
export const FONT_WAIT_MS = 1500;

/** devicePixelRatio caps per tier. */
export const DPR_CAP = { room: 2, desk: 1.5 } as const;

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
