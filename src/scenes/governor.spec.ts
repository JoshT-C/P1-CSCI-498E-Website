import { RENDER } from '../app/config/scene.config';
import { govern, INITIAL_GOVERNOR, renderPixelRatio, type GovernorState } from './governor';

/** Feed a run of fps readings; return the last step and every downgrade. */
function run(fpsList: number[], from: GovernorState = INITIAL_GOVERNOR) {
  let state = from;
  let downgrades = 0;
  let rescales = 0;
  for (const fps of fpsList) {
    const step = govern(state, fps);
    state = step.state;
    if (step.downgrade) downgrades++;
    if (step.rescale) rescales++;
  }
  return { state, downgrades, rescales };
}

describe('govern', () => {
  it('leaves a smooth scene alone', () => {
    const r = run([60, 60, 60, 60]);
    expect(r.state.scale).toBe(1);
    expect(r.rescales).toBe(0);
    expect(r.downgrades).toBe(0);
  });

  it('draws fewer pixels before it gives up on a tier', () => {
    // a weak GPU at 40 fps: the scale steps down, the tier holds
    const r = run([40, 40]);
    expect(r.state.scale).toBeLessThan(1);
    expect(r.downgrades).toBe(0);
  });

  it('takes bigger steps when far under target', () => {
    const near = run([45]).state.scale;
    const far = run([20]).state.scale;
    expect(far).toBeLessThan(near);
  });

  it('never goes under the lowest scale', () => {
    const r = run(Array(12).fill(40));
    expect(r.state.scale).toBe(RENDER.minScale);
  });

  it('steps the tier down only at the lowest scale and under the floor, for long enough', () => {
    const atFloor = { scale: RENDER.minScale, low: 0, high: 0 };
    expect(run([20], atFloor).downgrades).toBe(0);
    expect(run(Array(RENDER.lowWindowsToDowngrade).fill(20), atFloor).downgrades).toBe(1);
    // slow but above the floor: stays, just at the lowest scale
    expect(run(Array(6).fill(35), atFloor).downgrades).toBe(0);
  });

  it('a good window between bad ones resets the count', () => {
    const atFloor = { scale: RENDER.minScale, low: 0, high: 0 };
    expect(run([20, 40, 20], atFloor).downgrades).toBe(0);
  });

  it('steps back up only after sustained headroom', () => {
    const lowered = { scale: 0.7, low: 0, high: 0 };
    expect(run(Array(RENDER.highWindowsToStepUp - 1).fill(60), lowered).state.scale).toBe(0.7);
    expect(run(Array(RENDER.highWindowsToStepUp).fill(60), lowered).state.scale).toBeGreaterThan(0.7);
    // headroom interrupted by a middling window starts over
    expect(run([60, 60, 53, 60, 60], lowered).state.scale).toBe(0.7);
  });
});

describe('renderPixelRatio', () => {
  it('uses the device ratio when the frame fits the budget', () => {
    expect(renderPixelRatio(1, 1920, 1080, 'room', 1)).toBe(1);
    expect(renderPixelRatio(2, 800, 600, 'room', 1)).toBe(2);
  });

  it('caps a high-DPI screen to the pixel budget', () => {
    // 1440x900 at 2x would be 5.2 M pixels
    const ratio = renderPixelRatio(2, 1440, 900, 'room', 1);
    expect(1440 * ratio * 900 * ratio).toBeLessThanOrEqual(RENDER.pixelBudget.room + 1);
    expect(ratio).toBeLessThan(2);
  });

  it('caps a large 1x screen too', () => {
    const ratio = renderPixelRatio(1, 2560, 1440, 'room', 1);
    expect(2560 * ratio * 1440 * ratio).toBeLessThanOrEqual(RENDER.pixelBudget.room + 1);
  });

  it('applies the governor scale and the lighter tier budget', () => {
    expect(renderPixelRatio(1, 1920, 1080, 'room', 0.5)).toBe(0.5);
    expect(renderPixelRatio(1, 1920, 1080, 'desk', 1)).toBeLessThan(1);
  });
});
