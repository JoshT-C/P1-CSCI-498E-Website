#!/usr/bin/env node
/**
 * A minimal static server for the prerendered build, for the browser audit
 * and the Playwright suite when no nginx is running. It serves files and the
 * single-page fallback only: none of nginx's headers, limits or caching —
 * those are checked against the real nginx (e2e/security.spec.ts with
 * E2E_NGINX=1, and the CI container job).
 *
 * Usage: node scripts/serve-dist.mjs [port]   (default 4400; 0 = any free port)
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'jtc-site', 'browser');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const isFile = path => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** Serve `root` on `port`; resolves to { url, server }. */
export function serveDist({ port = 4400, root = DIST, host = '127.0.0.1' } = {}) {
  if (!existsSync(root)) throw new Error(`${root} missing — run \`npm run build\` first`);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = join(root, path);
    if (!(file === root || file.startsWith(root + sep))) {
      res.writeHead(403).end();
      return;
    }
    const hit = [file, join(file, 'index.html')].find(isFile);
    if (hit) {
      res.writeHead(200, { 'Content-Type': MIME[hit.slice(hit.lastIndexOf('.'))] ?? 'application/octet-stream' });
      createReadStream(hit).pipe(res);
      return;
    }
    // a missing file is a 404; an extensionless path is a page (SPA fallback)
    if (/\.[a-z0-9]+$/i.test(path)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    createReadStream(join(root, 'index.html')).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ url: `http://${host}:${server.address().port}`, server }));
  });
}

// run directly (the URL form, so Windows paths compare too)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await serveDist({ port: Number(process.argv[2] ?? 4400) });
  console.log(`serving ${DIST} at ${url}`);
}
