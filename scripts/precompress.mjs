#!/usr/bin/env node
/**
 * Writes a .gz beside every compressible file in the build, at maximum
 * compression, for nginx's gzip_static: served as-is, no CPU per request.
 * Runs as part of `npm run build`. The first visit drops from about 2.5 MB
 * to about 1.1 MB: the JavaScript to ~30 %, and even the room's models
 * (meshopt geometry, WebP textures) to about half.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, constants } from 'node:zlib';
import { DIST } from './serve-dist.mjs';

const COMPRESSIBLE = /\.(?:html|js|mjs|css|json|svg|txt|ico|glb)$/;
const MIN_BYTES = 1024;

let before = 0;
let after = 0;
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!COMPRESSIBLE.test(name)) continue;
    const data = readFileSync(path);
    if (data.length < MIN_BYTES) continue;
    const gz = gzipSync(data, { level: constants.Z_BEST_COMPRESSION });
    if (gz.length >= data.length * 0.95) continue; // not worth a second copy
    writeFileSync(`${path}.gz`, gz);
    before += data.length;
    after += gz.length;
  }
};
walk(DIST);
console.log(`precompress: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB gzip`);
