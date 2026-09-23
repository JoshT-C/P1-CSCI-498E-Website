/**
 * Where things are in the room. The room is modelled and baked in Blender
 * (art/room/); its export writes anchors.generated.ts, and everything here
 * reads from that — no position is typed twice.
 */
import type { Vec3 } from '../camera-path';
import { ANCHORS, type Anchor } from './anchors.generated';

export const STATIONS = ['terminal', 'rack', 'floppies', 'whiteboard', 'laptop'] as const;
export type StationId = (typeof STATIONS)[number];

export function isStationId(value: string): value is StationId {
  return (STATIONS as readonly string[]).includes(value);
}

const TABLE: Readonly<Record<string, Anchor>> = ANCHORS;

/** An anchor by name; a missing one is a build error, caught by the spec. */
export function anchor(name: string): Anchor {
  const a = TABLE[name];
  if (!a) throw new Error(`room anchor "${name}" missing — rebuild with npm run art:build`);
  return a;
}

export const vec = (p: readonly [number, number, number]): Vec3 => ({ x: p[0], y: p[1], z: p[2] });

/** Centre of the VT100's glass, and the unit vector it faces. */
export const SCREEN_CENTER: Vec3 = vec(anchor('screen').position);
export const SCREEN_NORMAL: Vec3 = vec(anchor('screen').look ?? [1, 0, 0]);

/** The room's inner bounds (walls, floor, ceiling). */
export const ROOM_MIN: Vec3 = vec(anchor('room_min').position);
export const ROOM_MAX: Vec3 = vec(anchor('room_max').position);
