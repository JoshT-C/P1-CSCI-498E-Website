import {
  CLOSE,
  CRT,
  SCREEN_CENTER,
  WIDE,
  cameraPose,
  type CameraPose,
  type Vec3
} from './camera-path';

const dist = (a: Vec3, b: Vec3): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Asserts every field of a pose is a finite number. */
function assertFinite(pose: CameraPose): void {
  for (const v of [pose.position, pose.target]) {
    expect(Number.isFinite(v.x)).toBe(true);
    expect(Number.isFinite(v.y)).toBe(true);
    expect(Number.isFinite(v.z)).toBe(true);
  }
  expect(Number.isFinite(pose.fov)).toBe(true);
}

describe('camera-path', () => {
  it('returns the exact endpoint poses at p = 0 and p = 1', () => {
    expect(cameraPose(0)).toBe(WIDE);
    expect(cameraPose(1)).toBe(CLOSE);
  });

  it('clamps out-of-range values to the endpoints', () => {
    expect(cameraPose(-5)).toBe(WIDE);
    expect(cameraPose(17)).toBe(CLOSE);
  });

  it('never emits a NaN, even for non-finite input', () => {
    for (const p of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assertFinite(cameraPose(p));
    }
    // -Infinity clamps to the wide shot, +Infinity to the close-up
    expect(cameraPose(Number.NEGATIVE_INFINITY)).toBe(WIDE);
    expect(cameraPose(Number.POSITIVE_INFINITY)).toBe(CLOSE);
  });

  it('is monotonic in z and fov, and never NaN, over 1001 samples', () => {
    let prevZ = Number.POSITIVE_INFINITY;
    let prevFov = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 1000; i++) {
      const pose = cameraPose(i / 1000);
      assertFinite(pose);
      // the camera approaches along the z axis: z and fov only decrease
      expect(pose.position.z).toBeLessThanOrEqual(prevZ);
      expect(pose.fov).toBeLessThanOrEqual(prevFov);
      // and it never crosses the screen plane
      expect(pose.position.z).toBeGreaterThan(SCREEN_CENTER.z);
      prevZ = pose.position.z;
      prevFov = pose.fov;
    }
    // …and it actually moved, not just stayed put
    expect(cameraPose(0.5).position.z).toBeLessThan(cameraPose(0).position.z);
  });

  it('bows outward, then dives in without wobble', () => {
    // the bow pushes the camera past its starting x before the dive
    expect(cameraPose(0.05).position.x).toBeGreaterThan(WIDE.position.x);
    // midpoint is well outside a pure lerp (which would give x = 0.85)
    expect(cameraPose(0.5).position.x).toBeGreaterThan(0.85);
    // after the bow, x decreases monotonically all the way to the close-up
    let prevX = Number.POSITIVE_INFINITY;
    for (let i = 150; i <= 1000; i++) {
      const x = cameraPose(i / 1000).position.x;
      expect(x).toBeLessThanOrEqual(prevX);
      prevX = x;
    }
  });

  it('frames the whole machine wide and the screen close', () => {
    // Wide: the chassis top and the floor are both inside the vertical fov.
    const wideDist = dist(WIDE.position, WIDE.target);
    const halfHeight = wideDist * Math.tan((WIDE.fov * Math.PI) / 360);
    const machineTop = CRT.standHeight + CRT.height;
    expect(halfHeight).toBeGreaterThan(machineTop - WIDE.target.y);
    expect(halfHeight).toBeGreaterThan(WIDE.target.y); // floor at y = 0

    // Close: at a 16:9 aspect the visible rectangle covers the screen with
    // margin on both axes.
    const closeDist = dist(CLOSE.position, CLOSE.target);
    const vHalf = closeDist * Math.tan((CLOSE.fov * Math.PI) / 360);
    const hHalf = vHalf * (16 / 9);
    expect(vHalf).toBeGreaterThan(CRT.screen.height / 2);
    expect(hHalf).toBeGreaterThan(CRT.screen.width / 2);
  });
});
