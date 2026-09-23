import {
  DESK_VIEW,
  ESTABLISH,
  PORTAL,
  PORTAL_AT,
  SCREEN_VIEW,
  STATION_POSES,
  blendPose,
  spinePose,
  type CameraPose,
  type Vec3
} from './camera-path';
import { ROOM_MAX, ROOM_MIN, SCREEN_CENTER, STATIONS } from './room/layout';

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

/** Compares two poses coordinate by coordinate (blendPose builds fresh objects). */
function expectPoseNear(actual: CameraPose, expected: CameraPose): void {
  for (const [a, b] of [
    [actual.position, expected.position],
    [actual.target, expected.target]
  ] as const) {
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
    expect(a.z).toBeCloseTo(b.z);
  }
  expect(actual.fov).toBeCloseTo(expected.fov);
}

describe('camera-path', () => {
  it('returns the exact endpoint poses at p = 0 and p = 1', () => {
    expect(spinePose(0)).toBe(ESTABLISH);
    expect(spinePose(1)).toBe(PORTAL);
  });

  it('clamps NaN, ±Infinity, and negatives to the endpoints without ever producing a NaN', () => {
    for (const p of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      -5
    ]) {
      assertFinite(spinePose(p));
    }
    expect(spinePose(Number.NaN)).toBe(ESTABLISH); // NaN clamps to 0
    expect(spinePose(-5)).toBe(ESTABLISH);
    expect(spinePose(Number.NEGATIVE_INFINITY)).toBe(ESTABLISH);
    expect(spinePose(Number.POSITIVE_INFINITY)).toBe(PORTAL);
  });

  it('passes exactly through DESK_VIEW and SCREEN_VIEW at their key fractions', () => {
    expectPoseNear(spinePose(0.42), DESK_VIEW);
    expectPoseNear(spinePose(0.8), SCREEN_VIEW);
  });

  it('closes in on the screen monotonically from the desk to the portal', () => {
    let prev = dist(spinePose(0.42).position, SCREEN_CENTER);
    for (let i = 1; i <= 12; i++) {
      const p = Math.min(0.42 + i * 0.05, 1); // 0.47, 0.52, …, 0.97, 1
      const pose = spinePose(p);
      assertFinite(pose);
      const d = dist(pose.position, SCREEN_CENTER);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
  });

  it('keeps the fov within [25, 60] everywhere', () => {
    for (let i = 0; i <= 1000; i++) {
      const fov = spinePose(i / 1000).fov;
      expect(fov).toBeGreaterThanOrEqual(25);
      expect(fov).toBeLessThanOrEqual(60);
    }
  });

  it('keeps every station pose finite and inside the room', () => {
    for (const id of STATIONS) {
      const pose = STATION_POSES[id];
      assertFinite(pose);
      const { position } = pose;
      expect(position.x, `${id} x`).toBeGreaterThanOrEqual(ROOM_MIN.x);
      expect(position.x, `${id} x`).toBeLessThanOrEqual(ROOM_MAX.x);
      expect(position.y, `${id} y`).toBeGreaterThanOrEqual(ROOM_MIN.y);
      expect(position.y, `${id} y`).toBeLessThanOrEqual(ROOM_MAX.y);
      expect(position.z, `${id} z`).toBeGreaterThanOrEqual(ROOM_MIN.z);
      expect(position.z, `${id} z`).toBeLessThanOrEqual(ROOM_MAX.z);
    }
  });

  it('blendPose returns its endpoints at t = 0 and t = 1', () => {
    expectPoseNear(blendPose(ESTABLISH, PORTAL, 0), ESTABLISH);
    expectPoseNear(blendPose(ESTABLISH, PORTAL, 1), PORTAL);
  });

  it('hands over to the DOM between the screen view and the portal', () => {
    expect(PORTAL_AT).toBeGreaterThan(0.8);
    expect(PORTAL_AT).toBeLessThan(1);
  });
});
