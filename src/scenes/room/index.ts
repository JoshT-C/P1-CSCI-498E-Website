/**
 * The room: the baked GLB from art/room/, brought to life.
 *
 * Static geometry arrives as one mesh per lightmap atlas (baked_room,
 * baked_desk, baked_lab) whose texture already holds albedo and light
 * together — it is drawn unlit and untone-mapped, exactly as baked. The
 * named 'live' objects get runtime materials:
 *   crt_glass            the CRT shader, fed by the typed terminal
 *   screen_monitor_mid|big, screen_laptop   canvases from the site's content
 *   whiteboard_surface   the architecture diagrams, in marker
 *   tape_*               label-maker text from the object's extras
 *   led_*                emissive, some flickering with fake traffic
 *   hit_*                invisible pick volumes (extras: station, item)
 * The floppies are built in code and stood on the riser in their cubby.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { FLOPPIES } from '../../app/services/content/homelab';
import { createGlassMaterial, createPersistence } from '../shaders/crt';
import { TEXTURE_H, TEXTURE_W } from '../text-screen';
import { createFloppies, type Floppies } from './floppies';
import { Bag } from './kit';
import { paintDiagramMonitor, paintLaptop, paintLabel, paintStackMonitor } from './screens';
import { rng } from './textures';
import { paintWhiteboard, type WhiteboardView } from './whiteboard';

export type Tier = 'room' | 'desk';

export interface Room {
  readonly group: THREE.Group;
  readonly floppies: Floppies;
  readonly hitboxes: readonly THREE.Object3D[];
  /** CRT warm-up, 0 → 1. */
  setPower(power: number): void;
  /** Redraw the whiteboard for what is selected. */
  setWhiteboard(view: WhiteboardView): void;
  /** Per frame: phosphor persistence, shader clocks, LED traffic. */
  update(renderer: THREE.WebGLRenderer, elapsed: number, dt: number): void;
  dispose(): void;
}

export const ROOM_URL: Record<Tier, string> = {
  room: 'assets/room/room.glb',
  desk: 'assets/room/room-lite.glb'
};

/** How bright the live surfaces sit against the bake. Screens are light
 *  sources; the whiteboard and tapes are lit only by them. */
const SCREEN_GAIN = 1.1;
const LIT_BY_SCREENS = new THREE.Color(0.2, 0.22, 0.27);

/**
 * Make V increase upward on a live plane, so an ordinary (flipY) canvas
 * texture reads right way up. Planes arrive from the export with either
 * orientation depending on how they were built, so this measures instead
 * of assuming: compare V at the plane's highest and lowest vertex in world
 * space, and flip only when the top samples the lower V.
 */
function orientUp(mesh: THREE.Mesh): void {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!uv) return;
  mesh.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  let top = { y: -Infinity, v: 0 };
  let bottom = { y: Infinity, v: 0 };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (v.y > top.y) top = { y: v.y, v: uv.getY(i) };
    if (v.y < bottom.y) bottom = { y: v.y, v: uv.getY(i) };
  }
  if (top.v >= bottom.v) return;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;
}

function canvasTexture(canvas: HTMLCanvasElement, bag: Bag, anisotropy = 4): THREE.CanvasTexture {
  const tex = bag.add(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export async function loadRoom(tier: Tier, screenSource: THREE.Texture, signal: AbortSignal): Promise<Room> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(ROOM_URL[tier]);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  const bag = new Bag();
  const group = gltf.scene;
  const hitboxes: THREE.Object3D[] = [];
  const flicker: THREE.Mesh[] = [];
  let glass: THREE.ShaderMaterial | null = null;
  let boardTex: THREE.CanvasTexture | null = null;
  let boardView = '';
  const persistence = createPersistence(screenSource, TEXTURE_W, TEXTURE_H);
  bag.add(persistence);

  const screens: Record<string, () => HTMLCanvasElement> = {
    screen_monitor_big: paintStackMonitor,
    screen_monitor_mid: paintDiagramMonitor,
    screen_laptop: paintLaptop
  };

  group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj;
    const name = mesh.name;
    const old = mesh.material as THREE.MeshStandardMaterial;
    const swap = (mat: THREE.Material): void => {
      bag.add(mat);
      old.dispose();
      mesh.material = mat;
    };
    bag.add(mesh.geometry);

    if (name.startsWith('baked_')) {
      const map = old.map;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 8;
        bag.add(map);
      }
      swap(new THREE.MeshBasicMaterial({ map, toneMapped: false }));
    } else if (name.startsWith('hit_')) {
      mesh.visible = false;
      mesh.userData['station'] = mesh.userData['station'] ?? name.slice(4).split('_')[0];
      hitboxes.push(mesh);
    } else if (name === 'crt_glass') {
      orientUp(mesh);
      glass = createGlassMaterial(persistence.texture, TEXTURE_W, TEXTURE_H);
      swap(glass);
    } else if (name in screens) {
      orientUp(mesh);
      const tex = canvasTexture(screens[name](), bag);
      swap(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(SCREEN_GAIN, SCREEN_GAIN, SCREEN_GAIN) }));
    } else if (name === 'whiteboard_surface') {
      orientUp(mesh);
      boardTex = canvasTexture(paintWhiteboard({ kind: 'models' }), bag, 8);
      boardView = 'models';
      swap(new THREE.MeshBasicMaterial({ map: boardTex, color: LIT_BY_SCREENS, toneMapped: false }));
    } else if (name.startsWith('tape_')) {
      orientUp(mesh);
      const text = String(mesh.userData['label'] ?? '');
      // print at the tape's own proportions: its two in-plane extents
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
      const [long, short] = [size.x, size.y, size.z].sort((a, b) => b - a);
      const tex = canvasTexture(paintLabel(text, long / Math.max(short, 1e-6)), bag);
      swap(new THREE.MeshBasicMaterial({ map: tex, color: LIT_BY_SCREENS.clone().multiplyScalar(1.6), toneMapped: false }));
    } else if (name.startsWith('led_')) {
      // emissive colour × strength from the bake material, pushed past 1 so
      // the bloom pass picks the LEDs up
      const c = old.emissive ? old.emissive.clone() : new THREE.Color(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: c.multiplyScalar(2.2), toneMapped: false });
      swap(mat);
      if (name.startsWith('led_switch') || name.startsWith('led_tenG') || name.startsWith('led_das')) flicker.push(mesh);
    } else if (name.startsWith('glow_')) {
      // soft emitters (keyboard underglow): a faint tint, not a lamp
      const c = old.emissive ? old.emissive.clone() : new THREE.Color(0.8, 0.85, 1);
      swap(new THREE.MeshBasicMaterial({ color: c.multiplyScalar(0.35), toneMapped: false }));
    } else {
      mesh.material = old;
    }
  });

  // posed in world space on the riser anchors (floppy_row0/1)
  const floppies = createFloppies(FLOPPIES.map(f => ({ id: f.id, label: f.label })));
  group.add(floppies.group);
  hitboxes.push(...(floppies.hitboxes ?? []));

  // Port LEDs blink with traffic: each is a few-Hz random process, updated
  // at ~12 Hz so it never costs more than a colour write.
  const r = rng(91);
  const base = flicker.map(m => (m.material as THREE.MeshBasicMaterial).color.clone());
  let acc = 0;

  return {
    group,
    floppies,
    hitboxes,
    setPower(power) {
      if (glass) glass.uniforms['uPower'].value = power;
    },
    setWhiteboard(view) {
      const key = JSON.stringify(view);
      if (!boardTex || key === boardView) return;
      boardView = key;
      boardTex.image = paintWhiteboard(view);
      boardTex.needsUpdate = true;
    },
    update(renderer, elapsed, dt) {
      persistence.update(renderer, dt);
      if (glass) {
        glass.uniforms['uMap'].value = persistence.texture;
        glass.uniforms['uTime'].value = elapsed;
      }
      floppies.update?.(elapsed, dt);
      acc += dt;
      if (acc < 80) return;
      acc = 0;
      flicker.forEach((m, i) => {
        const on = r() > 0.3;
        (m.material as THREE.MeshBasicMaterial).color.copy(base[i]).multiplyScalar(on ? 1 : 0.15);
      });
    },
    dispose() {
      floppies.dispose();
      bag.dispose();
    }
  };
}
