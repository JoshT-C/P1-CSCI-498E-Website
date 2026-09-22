/**
 * The CRT all-in-one, built from three.js primitives.
 *
 * Draw-call budget (plan: ≤6): static parts are merged so the whole rig is
 * four draw calls — chassis (merged), keyboard (merged), screen plane,
 * floor disc. No shadow maps, no per-frame geometry work.
 *
 * Dimensions come from camera-path.ts, which is the single source for the
 * machine's physical constants.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHASSIS_CENTER, CRT, SCREEN_CENTER } from './camera-path';

export interface Machine {
  readonly group: THREE.Group;
  /** Disposes every geometry and material this machine created. The screen
   *  texture is NOT disposed here — the TextScreen owns it. */
  dispose(): void;
}

function placed(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number
): THREE.BufferGeometry {
  geometry.translate(x, y, z);
  return geometry;
}

function buildChassis(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // main cabinet
    placed(
      new THREE.BoxGeometry(CRT.width, CRT.height, CRT.depth),
      0,
      CHASSIS_CENTER.y,
      0
    ),
    // bezel framing the screen, proud of the front face
    placed(
      new THREE.BoxGeometry(CRT.screen.width + 0.36, CRT.screen.height + 0.36, 0.16),
      0,
      SCREEN_CENTER.y,
      CRT.depth / 2 + 0.04
    ),
    // power button
    placed(
      new THREE.CylinderGeometry(0.05, 0.05, 0.05, 20).rotateX(Math.PI / 2),
      CRT.width / 2 - 0.28,
      CHASSIS_CENTER.y - CRT.height / 2 + 0.32,
      CRT.depth / 2 + 0.02
    ),
    // stand + base
    placed(new THREE.BoxGeometry(1.15, CRT.standHeight, 0.45), 0, CRT.standHeight / 2, 0),
    placed(new THREE.BoxGeometry(1.7, 0.06, 1.0), 0, 0.03, 0.08)
  ];
  return mergeGeometries(parts)!;
}

function buildKeyboard(): THREE.BufferGeometry {
  const slabZ = CRT.depth / 2 + 0.62;
  const parts: THREE.BufferGeometry[] = [
    placed(new THREE.BoxGeometry(1.9, 0.09, 0.85), 0, 0.045, slabZ)
  ];
  // four rows of keys + a spacebar, slightly staggered like a real board
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 11; col++) {
      parts.push(
        placed(
          new THREE.BoxGeometry(0.11, 0.045, 0.085),
          (col - 5) * 0.152 + row * 0.03,
          0.1125,
          slabZ + (row - 1.75) * 0.14
        )
      );
    }
  }
  parts.push(
    placed(new THREE.BoxGeometry(1.05, 0.045, 0.085), 0, 0.1125, slabZ + 2.25 * 0.14)
  );
  return mergeGeometries(parts)!;
}

export function createMachine(screenTexture: THREE.Texture): Machine {
  const group = new THREE.Group();

  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x23261f,
    roughness: 0.8,
    metalness: 0.2
  });
  const keyboardMat = new THREE.MeshStandardMaterial({
    color: 0x1b1e19,
    roughness: 0.9,
    metalness: 0.1
  });
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0e110d,
    roughness: 0.95,
    metalness: 0
  });

  const chassisGeom = buildChassis();
  const keyboardGeom = buildKeyboard();
  const screenGeom = new THREE.PlaneGeometry(CRT.screen.width, CRT.screen.height);
  screenGeom.translate(0, SCREEN_CENTER.y, CRT.depth / 2 + 0.13);
  const floorGeom = new THREE.CircleGeometry(9, 48);
  floorGeom.rotateX(-Math.PI / 2);
  floorGeom.translate(0, 0, 0.4);

  group.add(new THREE.Mesh(chassisGeom, chassisMat));
  group.add(new THREE.Mesh(keyboardGeom, keyboardMat));
  group.add(new THREE.Mesh(screenGeom, screenMat));
  group.add(new THREE.Mesh(floorGeom, floorMat));

  function dispose(): void {
    chassisGeom.dispose();
    keyboardGeom.dispose();
    screenGeom.dispose();
    floorGeom.dispose();
    chassisMat.dispose();
    keyboardMat.dispose();
    screenMat.dispose();
    floorMat.dispose();
    group.clear();
  }

  return { group, dispose };
}
