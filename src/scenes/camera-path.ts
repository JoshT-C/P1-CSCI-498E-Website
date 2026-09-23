/**
 * Pure camera math for the room.
 *
 * Two kinds of pose:
 *  - the **spine**: one scalar `p` (0 → 1 through the intro scroll) carries
 *    the camera from the doorway, across the room, down to the desk and
 *    through the VT100's glass — the portal into the page;
 *  - **stations**: fixed framings of the rack, floppy shelf, whiteboard and
 *    laptop, opened by clicking them.
 *
 * Plain numbers only, so it is unit-tested without three.js. The scene
 * damps toward whatever pose these return; nothing here knows about time.
 */
import { anchor, SCREEN_CENTER, SCREEN_NORMAL, vec, type StationId } from './room/layout';

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

interface Key {
  /** Spine fraction at which the camera passes this pose. */
  readonly at: number;
  readonly pose: CameraPose;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const add = (p: Vec3, d: Vec3, k: number): Vec3 => v(p.x + d.x * k, p.y + d.y * k, p.z + d.z * k);

/** The screen's sideways axis (its right, seen from in front). */
const SIDE: Vec3 = v(-SCREEN_NORMAL.z, 0, SCREEN_NORMAL.x);

/** Doorway: the whole corner — hutch, desk, rack, monitors, flag. */
export const ESTABLISH: CameraPose = {
  position: vec(anchor('doorway').position),
  target: v(-1.15, 0.95, -1.3),
  fov: 50
};

/** Standing at the desk, over the keyboard, a little to the right. */
export const DESK_VIEW: CameraPose = {
  position: add(add(add(SCREEN_CENTER, SCREEN_NORMAL, 0.95), SIDE, -0.28), v(0, 1, 0), 0.22),
  target: add(SCREEN_CENTER, v(0, 1, 0), -0.06),
  fov: 42
};

/** Square on to the tube; the glass fills most of the frame. */
export const SCREEN_VIEW: CameraPose = {
  position: add(SCREEN_CENTER, SCREEN_NORMAL, 0.42),
  target: SCREEN_CENTER,
  fov: 36
};

/** Inside the glass: the frame is all phosphor. The DOM takes over here. */
export const PORTAL: CameraPose = {
  position: add(SCREEN_CENTER, SCREEN_NORMAL, 0.09),
  target: SCREEN_CENTER,
  fov: 30
};

/** The desk tier's opening shot: no need to show the room, so start at the
 *  desk, a step back, framed for a tall phone screen. */
export const DESK_WIDE: CameraPose = {
  position: add(add(SCREEN_CENTER, SCREEN_NORMAL, 1.7), v(0, 1, 0), 0.3),
  target: add(SCREEN_CENTER, v(0, 1, 0), -0.08),
  fov: 50
};

const spine = (start: CameraPose): readonly Key[] => [
  { at: 0, pose: start },
  { at: 0.42, pose: DESK_VIEW },
  { at: 0.8, pose: SCREEN_VIEW },
  { at: 1, pose: PORTAL }
];

const ROOM_SPINE = spine(ESTABLISH);
const DESK_SPINE = spine(DESK_WIDE);

/** Stand `dist` out along an anchor's facing, `lift` above it. */
function facing(name: string, dist: number, lift: number, fov: number): CameraPose {
  const a = anchor(name);
  const at = vec(a.position);
  const look = vec(a.look ?? [0, 0, 1]);
  return { position: add(add(at, look, dist), v(0, 1, 0), lift), target: at, fov };
}

export const STATION_POSES: Readonly<Record<StationId, CameraPose>> = {
  terminal: DESK_VIEW,
  // crouched: the rack lives under the desk
  rack: facing('rack', 1.25, 0.1, 50),
  floppies: facing('floppies', 0.75, 0.02, 40),
  whiteboard: facing('whiteboard', 1.45, -0.12, 44),
  laptop: facing('laptop', 0.7, 0.08, 40)
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

/** Uniform Catmull-Rom through p1→p2, with p0/p3 as tangent neighbours. */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

const catmullVec = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number): Vec3 =>
  v(catmull(a.x, b.x, c.x, d.x, t), catmull(a.y, b.y, c.y, d.y, t), catmull(a.z, b.z, c.z, d.z, t));

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Clamp to [0, 1]; NaN lands on 0 so no pose is ever NaN. */
export function clampUnit(p: number): number {
  return Number.isNaN(p) ? 0 : Math.min(Math.max(p, 0), 1);
}

/**
 * Pose on the spine at fraction `p`. Positions follow a Catmull-Rom curve
 * through the keys (a lerp reads as a slider; the curve reads as a person
 * walking up to a desk); targets and fov ease per segment.
 */
export function spinePose(p: number, tier: 'room' | 'desk' = 'room'): CameraPose {
  const SPINE = tier === 'room' ? ROOM_SPINE : DESK_SPINE;
  const t = clampUnit(p);
  if (t === 0) return SPINE[0].pose;
  if (t === 1) return SPINE[SPINE.length - 1].pose;

  let i = 0;
  while (i < SPINE.length - 2 && t > SPINE[i + 1].at) i++;
  const a = SPINE[i];
  const b = SPINE[i + 1];
  const u = (t - a.at) / (b.at - a.at);
  const prev = SPINE[Math.max(i - 1, 0)].pose.position;
  const next = SPINE[Math.min(i + 2, SPINE.length - 1)].pose.position;
  const s = smoothstep(u);

  return {
    position: catmullVec(prev, a.pose.position, b.pose.position, next, u),
    target: lerpVec(a.pose.target, b.pose.target, s),
    fov: lerp(a.pose.fov, b.pose.fov, s)
  };
}

/** Straight blend between two poses (the scene damps on top of this). */
export function blendPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const s = clampUnit(t);
  return {
    position: lerpVec(a.position, b.position, s),
    target: lerpVec(a.target, b.target, s),
    fov: lerp(a.fov, b.fov, s)
  };
}

/**
 * Vertical fov for a viewport: poses are framed for landscape, so a tall
 * screen widens the vertical fov until the horizontal field roughly holds.
 */
export function fovForAspect(fov: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= 1) return fov;
  return Math.min(fov / Math.sqrt(aspect), 85);
}

/** Spine fraction past which the glass fills the frame and the DOM takes over. */
export const PORTAL_AT = 0.94;
