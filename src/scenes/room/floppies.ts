/**
 * The project disks: 3.5" floppies standing in a hutch cubby, one per
 * project, in two rows of three. The front row stands on the shelf leaning
 * on a wooden riser; the back row stands on the riser leaning on the wall.
 * Picking one lifts it toward the viewer, and the panel carries the details.
 *
 * The room around them is baked, so nothing lights them at runtime: they
 * are drawn unlit at the cubby's light level (SHADE).
 *
 * Draw calls: bodies, shutters, labels (three).
 */
import * as THREE from 'three';
import { Bag, hitbox, merge, type Part } from './kit';
import { anchor } from './layout';
import { canvas2d } from './textures';

export interface FloppyData {
  readonly id: string;
  readonly label: string;
}

export interface Floppies extends Part {
  /** Lift the disk with this id (or none). */
  select(id: string | null): void;
}

/** A real 3.5" disk: 90 × 94 × 3.3 mm. */
const DISK = { w: 0.09, h: 0.094, t: 0.0033 };
/** Paper label on the upper face, as on a real disk. */
const LABEL = { w: 0.068, h: 0.034, y: DISK.h * 0.22 };
const PER_ROW = 3;
const PITCH = 0.1;
const LEAN = 0.2;
const BODY_COLORS = [0x1c1c1e, 0x2d3a4a, 0x55585a, 0xc9bfa6, 0x5a2a26, 0x23302a];
const STRIPES = ['#c0392b', '#2e86c1', '#27ae60', '#d4a017', '#8e44ad', '#16a085'];
/** Light level in the cubby, read off the bake (dim, screen-lit). */
const SHADE = new THREE.Color(0.34, 0.36, 0.42);

/** One label per row of a tall atlas: paper, a coloured top stripe, the
 *  project name in ink, shrunk to fit rather than squashed. */
function labelAtlas(items: readonly FloppyData[]): { texture: THREE.CanvasTexture; rect(i: number): [number, number, number, number] } {
  const cw = 272;
  const ch = 136;
  const [c, ctx] = canvas2d(cw, ch * items.length);
  items.forEach((item, i) => {
    const y0 = i * ch;
    ctx.fillStyle = '#efeadb';
    ctx.fillRect(0, y0, cw, ch);
    ctx.fillStyle = STRIPES[i % STRIPES.length];
    ctx.fillRect(0, y0, cw, 18);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let r = 0; r < 3; r++) ctx.fillRect(14, y0 + 62 + r * 24, cw - 28, 2);
    let size = 44;
    ctx.font = `600 ${size}px "IBM Plex Mono", monospace`;
    while (ctx.measureText(item.label).width > cw - 28 && size > 18) {
      size -= 2;
      ctx.font = `600 ${size}px "IBM Plex Mono", monospace`;
    }
    ctx.fillStyle = '#1b1b1b';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, 14, y0 + 64);
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const H = ch * items.length;
  return { texture, rect: i => [0, 1 - ((i + 1) * ch) / H, 1, 1 - (i * ch) / H] };
}

export function createFloppies(items: readonly FloppyData[]): Floppies {
  const bag = new Bag();
  const group = new THREE.Group();
  group.name = 'floppies';
  const count = items.length;

  const bodies = bag.mesh(
    new THREE.InstancedMesh(new THREE.BoxGeometry(DISK.w, DISK.h, DISK.t), new THREE.MeshBasicMaterial({ toneMapped: false }), count)
  );
  const shutterGeo = new THREE.BoxGeometry(DISK.w * 0.55, DISK.h * 0.34, DISK.t + 0.0008).translate(-0.004, -DISK.h * 0.33, 0);
  const shutters = bag.mesh(
    new THREE.InstancedMesh(shutterGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb8bcc0).multiply(SHADE), toneMapped: false }), count)
  );

  const atlas = labelAtlas(items);
  bag.add(atlas.texture);
  const labelParts = items.map((_, i) => {
    const g = new THREE.PlaneGeometry(LABEL.w, LABEL.h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const [u0, v0, u1, v1] = atlas.rect(i);
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    return g.translate(0, LABEL.y, DISK.t / 2 + 0.0003);
  });
  const labelGeo = bag.add(merge(labelParts));
  for (const g of labelParts) g.dispose(); // merge() copied them
  const labelLocal = new Float32Array((labelGeo.getAttribute('position') as THREE.BufferAttribute).array);
  const vertsPerLabel = labelLocal.length / 3 / count;
  const labels = new THREE.Mesh(
    labelGeo,
    bag.add(new THREE.MeshBasicMaterial({ map: atlas.texture, color: SHADE, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }))
  );

  // Rest poses, in world space: rows sit on the riser anchors, the disks
  // spread across the cubby and lean back by LEAN.
  const rows = [anchor('floppy_row0'), anchor('floppy_row1')];
  const rowOf = (i: number): (typeof rows)[number] => rows[Math.min(Math.floor(i / PER_ROW), rows.length - 1)];
  const rest: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  items.forEach((_, i) => {
    const row = rowOf(i);
    const look = new THREE.Vector3(...(row.look ?? [1, 0, 0])).normalize();
    const yaw = Math.atan2(look.x, look.z);
    const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const slot = (i % PER_ROW) - (PER_ROW - 1) / 2;
    const base = new THREE.Vector3(...row.position).addScaledVector(across, slot * PITCH);
    // bottom edge on the surface; the centre rises and falls back with the lean
    const p = base
      .clone()
      .add(new THREE.Vector3(0, (DISK.h / 2) * Math.cos(LEAN), 0))
      .addScaledVector(look, -(DISK.h / 2) * Math.sin(LEAN));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-LEAN, yaw, 0, 'YXZ'));
    rest.push({ p, q });
    bodies.setColorAt(i, new THREE.Color(BODY_COLORS[i % BODY_COLORS.length]).multiply(SHADE));
  });

  const current = rest.map(r => ({ p: r.p.clone(), q: r.q.clone() }));
  const target = rest.map(r => ({ p: r.p.clone(), q: r.q.clone() }));
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  const posAttr = labelGeo.getAttribute('position') as THREE.BufferAttribute;

  const write = (i: number): void => {
    m.compose(current[i].p, current[i].q, one);
    bodies.setMatrixAt(i, m);
    shutters.setMatrixAt(i, m);
    for (let k = 0; k < vertsPerLabel; k++) {
      const idx = i * vertsPerLabel + k;
      v.set(labelLocal[idx * 3], labelLocal[idx * 3 + 1], labelLocal[idx * 3 + 2]).applyMatrix4(m);
      posAttr.setXYZ(idx, v.x, v.y, v.z);
    }
  };
  const flush = (): void => {
    bodies.instanceMatrix.needsUpdate = true;
    shutters.instanceMatrix.needsUpdate = true;
    posAttr.needsUpdate = true;
  };
  for (let i = 0; i < count; i++) write(i);
  flush();
  // posed in world space: their own local bounds would cull them wrongly
  bodies.frustumCulled = false;
  shutters.frustumCulled = false;
  labels.frustumCulled = false;

  group.add(bodies, shutters, labels);

  const hitboxes: THREE.Object3D[] = items.map((item, i) => {
    const h = hitbox('floppies', { x: DISK.w, y: DISK.h, z: 0.03 }, rest[i].p, bag);
    h.quaternion.copy(rest[i].q);
    h.userData['item'] = item.id;
    group.add(h);
    return h;
  });

  let moving = false;

  return {
    group,
    hitboxes,
    select(id) {
      items.forEach((item, i) => {
        target[i].p.copy(rest[i].p);
        target[i].q.copy(rest[i].q);
        if (item.id !== id) return;
        // out of the cubby toward the viewer, a little higher, upright
        const look = new THREE.Vector3(...(rowOf(i).look ?? [1, 0, 0])).normalize();
        target[i].p.addScaledVector(look, 0.13).add(new THREE.Vector3(0, 0.03, 0));
        target[i].q.setFromEuler(new THREE.Euler(0.08, Math.atan2(look.x, look.z), 0, 'YXZ'));
      });
      moving = true;
    },
    update(_elapsed, dt) {
      if (!moving) return;
      const k = 1 - Math.exp(-dt / 110);
      let settled = true;
      for (let i = 0; i < count; i++) {
        current[i].p.lerp(target[i].p, k);
        current[i].q.slerp(target[i].q, k);
        if (current[i].p.distanceToSquared(target[i].p) > 1e-8) settled = false;
        write(i);
      }
      flush();
      moving = !settled;
    },
    dispose() {
      bag.dispose();
    }
  };
}
