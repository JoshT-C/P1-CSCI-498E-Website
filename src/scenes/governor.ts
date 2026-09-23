/**
 * Frame-rate governor and render-resolution budget, as pure functions.
 *
 * Weak GPUs (an integrated Radeon or Intel, a phone) are handled by drawing
 * fewer pixels before anything else: the render scale steps down while the
 * frame rate is under target, and back up once there is headroom. Only when
 * even the lowest scale cannot hold the floor does the tier step down (room
 * → desk → flat).
 */
import { RENDER } from '../app/config/scene.config';

export interface GovernorState {
  /** Multiplier on the render pixel ratio, RENDER.minScale … 1. */
  readonly scale: number;
  /** Consecutive windows under the floor at the lowest scale. */
  readonly low: number;
  /** Consecutive comfortable windows (for stepping back up). */
  readonly high: number;
}

export interface GovernorStep {
  readonly state: GovernorState;
  /** The scale changed: re-apply the pixel ratio. */
  readonly rescale: boolean;
  /** Give up on this tier. */
  readonly downgrade: boolean;
}

export const INITIAL_GOVERNOR: GovernorState = { scale: 1, low: 0, high: 0 };

/** One measurement window's verdict. */
export function govern(s: GovernorState, fps: number): GovernorStep {
  const r = RENDER;
  if (fps < r.targetFps) {
    if (s.scale > r.minScale) {
      // far under target: take two steps at once
      const step = fps < r.targetFps * 0.6 ? r.stepDown * 2 : r.stepDown;
      const scale = Math.max(r.minScale, round2(s.scale - step));
      return { state: { scale, low: 0, high: 0 }, rescale: true, downgrade: false };
    }
    const low = fps < r.floorFps ? s.low + 1 : 0;
    return { state: { ...s, low, high: 0 }, rescale: false, downgrade: low >= r.lowWindowsToDowngrade };
  }
  if (fps >= r.comfortableFps && s.scale < 1) {
    const high = s.high + 1;
    if (high >= r.highWindowsToStepUp) {
      return { state: { scale: Math.min(1, round2(s.scale + r.stepUp)), low: 0, high: 0 }, rescale: true, downgrade: false };
    }
    return { state: { ...s, high, low: 0 }, rescale: false, downgrade: false };
  }
  return { state: { ...s, low: 0, high: 0 }, rescale: false, downgrade: false };
}

/**
 * The pixel ratio to render at: the device's, capped per tier, and capped
 * again so the frame never holds more than the tier's pixel budget (a 2x
 * laptop screen would otherwise draw four times the pixels of the same
 * window at 1x), times the governor's scale.
 */
export function renderPixelRatio(
  devicePixelRatio: number,
  cssWidth: number,
  cssHeight: number,
  tier: 'room' | 'desk',
  scale: number
): number {
  const cap = RENDER.dprCap[tier];
  const budget = RENDER.pixelBudget[tier];
  const area = Math.max(cssWidth * cssHeight, 1);
  const fit = Math.sqrt(budget / area);
  return Math.max(0.25, Math.min(devicePixelRatio || 1, cap, fit) * scale);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
