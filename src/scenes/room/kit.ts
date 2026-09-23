/**
 * Shared plumbing for the room's runtime props: a disposal bag, so each
 * module hands back one dispose() for everything it allocated, and a few
 * geometry helpers.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface Disposable {
  dispose(): void;
}

export class Bag {
  private readonly items: Disposable[] = [];

  add<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }

  /** Tracks a mesh's geometry and material(s) and returns the mesh. */
  mesh<T extends THREE.Mesh | THREE.InstancedMesh | THREE.Points | THREE.LineSegments>(m: T): T {
    this.add(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) this.add(mat);
    return m;
  }

  dispose(): void {
    for (const item of this.items.splice(0)) item.dispose();
  }
}

/** A room module: its scene graph plus one dispose for all of it. */
export interface Part {
  readonly group: THREE.Group;
  /** Invisible boxes the pointer raycasts against, tagged with a station. */
  readonly hitboxes?: readonly THREE.Object3D[];
  /** Per-frame work, if the part animates (most do not). */
  update?(elapsed: number, dt: number): void;
  dispose(): void;
}

export function at(geometry: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  return geometry.translate(x, y, z);
}

/** Merge static pieces into one geometry — one draw call per material. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Non-indexed and indexed geometries cannot merge together.
  const normalised = parts.map(g => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(normalised);
  if (!merged) throw new Error('mergeGeometries failed: attribute mismatch');
  return merged;
}

/** Hitbox: an invisible box that only the raycaster sees. */
export function hitbox(station: string, size: THREE.Vector3Like, position: THREE.Vector3Like, bag: Bag): THREE.Mesh {
  const box = bag.mesh(
    new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({ visible: false })
    )
  );
  box.position.set(position.x, position.y, position.z);
  box.userData['station'] = station;
  return box;
}
