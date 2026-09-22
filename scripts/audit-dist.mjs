#!/usr/bin/env node
/**
 * Post-build audit of the static bundle that will actually ship.
 *
 * Walks dist/jtc-site/browser and applies the same secret patterns the
 * content tests gate on (src/app/services/content/projects.spec.ts), plus
 * two bundle-specific checks: no non-localhost http:// references and no
 * .map files (sourcemaps must not ship).
 *
 * Usage: node scripts/audit-dist.mjs [distDir]
 * Exits non-zero on any finding.
 */
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.argv[2] ?? join(ROOT, 'dist', 'jtc-site', 'browser');

// Same patterns as projects.spec.ts — keep the two in sync.
const PATTERNS = [
  ['internal-hostname', /lopyhupis/i],
  ['private-ip', /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
  [
    'private-range',
    /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/
  ],
  // bare ":8080" — URL literals are stripped first so "https://" cannot trip it
  ['bare-port', /(?<![\w.]):\d{2,5}\b/],
  [
    'credential-shape',
    /(?:sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9_-]{20,}|\bapi[_-]?key\b|\.env\b|proxmox)/i
  ]
];
// http:// references that are not localhost and not XML namespaces
const HTTP_RE = /http:\/\/(?!localhost(?::\d+)?\/|127\.0\.0\.1(?::\d+)?\/|www\.w3\.org\/)[^\s"'`<>)]+/g;

const SCANNED = new Set(['.html', '.js', '.mjs', '.css']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function ext(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

const findings = [];
let scannedFiles = 0;
let mapFiles = 0;

for (const file of walk(distDir)) {
  const name = file.slice(distDir.length + 1);
  if (ext(file) === '.map') {
    mapFiles += 1;
    findings.push([name, 'sourcemap', file]);
    continue;
  }
  if (!SCANNED.has(ext(file))) continue;
  scannedFiles += 1;
  const text = readFileSync(file, 'utf8');

  for (const [label, re] of PATTERNS) {
    const scrubbed = text.replace(/https?:\/\/\S+/g, '');
    for (const m of scrubbed.matchAll(new RegExp(re.source, re.flags + 'g'))) {
      findings.push([name, label, m[0]]);
    }
  }
  for (const m of text.matchAll(HTTP_RE)) {
    findings.push([name, 'insecure-http', m[0]]);
  }
}

console.log(`audit-dist: scanned ${scannedFiles} files under ${distDir}`);
if (findings.length === 0) {
  console.log('audit-dist: clean — no secrets, no http:// origins, no sourcemaps');
} else {
  for (const [file, label, sample] of findings.slice(0, 40)) {
    const shown = sample.length > 80 ? sample.slice(0, 80) + '…' : sample;
    console.error(`  ${label}: ${file} → ${shown}`);
  }
  if (findings.length > 40) {
    console.error(`  …and ${findings.length - 40} more`);
  }
  process.exitCode = 1;
}
