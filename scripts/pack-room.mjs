#!/usr/bin/env node
/**
 * Pack the baked room for the web.
 *
 *   art/out/room.raw.glb  (Blender export: PNG atlases, raw geometry)
 *     -> public/assets/room/room.glb       full tier: 4K WebP atlases
 *     -> public/assets/room/room-lite.glb  desk tier: 1K WebP atlases
 *
 * Geometry is welded, simplified only where lossless, and meshopt-compressed
 * (the runtime decodes it with three's MeshoptDecoder). Atlases go to WebP:
 * lightmaps are smooth gradients, where WebP holds up far better than JPEG.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'art', 'out', 'room.raw.glb');
const OUT = join(ROOT, 'public', 'assets', 'room');

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

mkdirSync(OUT, { recursive: true });

for (const [name, size, quality] of [
  ['room.glb', 4096, 86],
  ['room-lite.glb', 1024, 80]
]) {
  const doc = await io.read(SRC);
  await doc.transform(
    dedup(),
    weld(),
    prune({ keepExtras: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality, resize: [size, size] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  const path = join(OUT, name);
  await io.write(path, doc);
  console.log(`pack-room: ${name} ${(statSync(path).size / 1e6).toFixed(2)} MB`);
}
