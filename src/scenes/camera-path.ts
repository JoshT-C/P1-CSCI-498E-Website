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
  /** Aspect whose horizontal field this pose keeps on a narrower screen
   *  (see framedFor); none for shots where a tall crop reads fine. */
  readonly hold?: number;
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

// The desk and screen shots are about the glass, which is wider than tall:
// on a portrait phone they must keep its width, not just its height.
const spine = (start: CameraPose): readonly Key[] => [
  { at: 0, pose: start },
  { at: 0.42, pose: DESK_VIEW, hold: 1.25 },
  { at: 0.8, pose: SCREEN_VIEW, hold: 1.6 },
  { at: 1, pose: PORTAL, hold: 1.6 }
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
  rack: facing('rack', 1.45, 0.1, 50),
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
export function spinePose(p: number, tier: 'room' | 'desk' = 'room', start?: CameraPose, aspect?: number): CameraPose {
  // `start` replaces the opening shot (re-framed for the viewport by fitPose)
  const base = start ? spine(start) : tier === 'room' ? ROOM_SPINE : DESK_SPINE;
  // with an aspect, every key is framed for it and the fov returned is final
  const SPINE = aspect === undefined ? base : base.map(k => ({ ...k, pose: framedFor(k.pose, aspect, k.hold) }));
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

/**
 * A pose framed for a viewport. Without `hold`, as fovForAspect. With it, a
 * screen narrower than `hold` keeps the horizontal field the pose has at
 * `hold`: the fov takes half the correction (up to 80°) and the camera
 * steps back along its line of sight for the rest, so a phone held upright
 * sees the whole CRT glass without a fish-eye.
 */
export function framedFor(pose: CameraPose, aspect: number, hold?: number): CameraPose {
  if (!hold || !(aspect > 0) || aspect >= hold) return { ...pose, fov: fovForAspect(pose.fov, aspect) };
  const need = hold / aspect;
  const tan = Math.tan((pose.fov * Math.PI) / 360);
  const wide = Math.min(tan * Math.sqrt(need), Math.tan((80 * Math.PI) / 360));
  const back = (need * tan) / wide;
  const t = pose.target;
  const q = pose.position;
  return {
    position: v(t.x + (q.x - t.x) * back, t.y + (q.y - t.y) * back, t.z + (q.z - t.z) * back),
    target: t,
    fov: (Math.atan(wide) * 360) / Math.PI
  };
}

/** Spine fraction past which the glass fills the frame and the DOM takes over. */
export const PORTAL_AT = 0.94;

/** The part of the viewport a shot must fit in, in CSS pixels. */
export interface ShotFrame {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface FittedShot {
  readonly pose: CameraPose;
  /** For camera.setViewOffset: shifts that centre the points in the frame. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** False when even the widest candidate could not hold every point. */
  readonly fits: boolean;
}

const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};

/**
 * Re-aim a pose so every point lands inside `frame`, keeping its angle.
 *
 * The camera slides along its line of sight (from `near` metres forward to
 * as far back as `bounds` allow) and, only once it can go no further back,
 * widens its fov up to `maxFov`. The first candidate from the front that
 * holds every point wins, so a roomy screen gets a closer, fuller shot and
 * a cramped one a wider one. The returned offsets then centre the points in
 * the frame. Portrait-first framing is not attempted: the caller keeps its
 * own fallback for phones.
 */
export function fitPose(
  base: CameraPose,
  points: readonly Vec3[],
  frame: ShotFrame,
  bounds: { readonly min: Vec3; readonly max: Vec3 },
  opts: { readonly near?: number; readonly maxFov?: number; readonly step?: number } = {}
): FittedShot {
  const near = opts.near ?? 0.5;
  const maxFov = opts.maxFov ?? 72;
  const step = opts.step ?? 0.05;
  const aspect = frame.width / frame.height;
  const forward = norm(sub(base.target, base.position));
  const right = norm(cross(forward, v(0, 1, 0)));
  const up = cross(right, forward);

  // how far back the camera can go before leaving the room (0.15 m inset)
  let back = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = -forward[axis];
    if (Math.abs(d) < 1e-6) continue;
    const limit = d > 0 ? bounds.max[axis] - 0.15 : bounds.min[axis] + 0.15;
    back = Math.min(back, (limit - base.position[axis]) / d);
  }
  back = Math.max(back, 0);

  const usableW = frame.right - frame.left;
  const usableH = frame.bottom - frame.top;
  const measure = (position: Vec3, fov: number) => {
    const t = Math.tan((fov * Math.PI) / 360);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const d = sub(p, position);
      const z = dot(d, forward);
      if (z < 0.05) return null; // behind or at the lens
      const x = (dot(d, right) / (z * t * aspect) + 1) * 0.5 * frame.width;
      const y = (1 - dot(d, up) / (z * t)) * 0.5 * frame.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { minX, maxX, minY, maxY };
  };

  const shot = (dist: number, fov: number, fits: boolean): FittedShot | null => {
    const position = add(base.position, forward, -dist);
    const m = measure(position, fov);
    if (!m) return null;
    if (fits && (m.maxX - m.minX > usableW || m.maxY - m.minY > usableH)) return null;
    return {
      pose: { position, target: add(base.target, forward, -dist), fov },
      offsetX: (m.minX + m.maxX) / 2 - (frame.left + frame.right) / 2,
      offsetY: (m.minY + m.maxY) / 2 - (frame.top + frame.bottom) / 2,
      fits
    };
  };

  for (let dist = -near; dist <= back + 1e-9; dist += step) {
    const s = shot(Math.min(dist, back), base.fov, true);
    if (s) return s;
  }
  for (let fov = base.fov + 1; fov <= maxFov; fov += 1) {
    const s = shot(back, fov, true);
    if (s) return s;
  }
  return shot(back, maxFov, false) ?? { pose: base, offsetX: 0, offsetY: 0, fits: false };
}
