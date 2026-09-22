#!/usr/bin/env node
/**
 * Browser audit: the site in a real Chromium, failing on what visitors
 * would feel.
 *
 * Pass 1 (desktop, 3D expected): console errors, uncaught exceptions,
 * failed requests, HTTP >= 400, CSP violations, render mode, and the
 * screen mirroring the section in view as the page scrolls through all
 * five sections. Screenshots land in verification/.
 *
 * Pass 2 (?no3d=1, CSS fallback): render mode, no canvas, the terminal
 * card types in full, the stack bars are visible, zero console errors.
 *
 * Headless WebGL runs on SwiftShader and is slow: a CLEAN LOGGED
 * runtime-fps downgrade in pass 1 is a documented pass-with-note. An
 * unexplained css mode is a failure.
 *
 * GitHub API failures (network / rate limit) are environment, not site
 * bugs — they are reported as notes, never as failures.
 *
 * Usage: node scripts/audit-browser.mjs [url]
 * No URL given: uses http://localhost:4200 if something is serving there,
 * otherwise serves dist/jtc-site/browser on a free port itself (run
 * `npm run build` first). Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'jtc-site', 'browser');
const BROWSER = join(
  homedir(),
  '.cache',
  'ms-playwright',
  'chromium-1208',
  'chrome-linux64',
  'chrome'
);
const VERIFICATION = join(ROOT, 'verification');

const SECTION_IDS = ['top', 'work', 'stack', 'about', 'contact'];
const SECTION_KEYS = {
  top: 'hero',
  work: 'work',
  stack: 'stack',
  about: 'about',
  contact: 'contact'
};
const CLEAN_DOWNGRADES = new Set([
  'runtime-fps',
  'context-lost',
  'webgl-fail',
  'scene-load-fail',
  'no-webgl',
  'low-memory',
  'low-cores'
]);

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function freshBag() {
  return {
    consoleErrors: [],
    consoleWarnings: [],
    sceneLog: [],
    pageErrors: [],
    requestFailed: [],
    http400: [],
    csp: [],
    envNotes: []
  };
}

async function attach(page, bag) {
  await page.addInitScript(() => {
    window.__csp = [];
    window.addEventListener('securitypolicyviolation', e => {
      window.__csp.push(
        `${e.effectiveDirective || e.violatedDirective || '?'}: ${e.blockedURI || ''}`
      );
    });
  });
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') bag.consoleErrors.push(text);
    else if (msg.type() === 'warning') bag.consoleWarnings.push(text);
    else if (msg.type() === 'info' && text.includes('[scene]')) bag.sceneLog.push(text);
  });
  page.on('pageerror', err => bag.pageErrors.push(String(err)));
  page.on('requestfailed', req => {
    const url = req.url();
    const why = req.failure()?.errorText ?? 'unknown';
    if (url.includes('api.github.com')) bag.envNotes.push(`github api failed: ${why}`);
    else bag.requestFailed.push(`${req.method()} ${url} — ${why}`);
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      const url = res.url();
      if (url.includes('api.github.com')) bag.envNotes.push(`github api ${res.status()}`);
      else bag.http400.push(`${res.status()} ${url}`);
    }
  });
}

async function readCsp(page) {
  return (await page.evaluate(() => window.__csp ?? [])) ?? [];
}

function bagFailures(bag, pass) {
  let ok = true;
  ok = record(`${pass}: no uncaught exceptions`, bag.pageErrors.length === 0,
    bag.pageErrors.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no console errors`, bag.consoleErrors.length === 0,
    bag.consoleErrors.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no failed requests`, bag.requestFailed.length === 0,
    bag.requestFailed.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no HTTP >= 400`, bag.http400.length === 0,
    bag.http400.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no CSP violations`, bag.csp.length === 0,
    bag.csp.slice(0, 3).join(' | ')) && ok;
  for (const w of bag.consoleWarnings.slice(0, 3)) {
    console.log(`  [warn] ${pass}: ${w.slice(0, 300)}`);
  }
  return ok;
}

/** Some headless builds cannot shape glyphs at all: even a system-`monospace`
 *  test canvas comes back blank while the DOM text is present and visible.
 *  Detect that once up front and note it, so blank screenshots in the
 *  verification/ folder are never mistaken for a site defect. */
async function canRasterizeText(browser) {
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<canvas id="c" width="200" height="40"></canvas>');
    const bright = await page.evaluate(() => {
      const g = document.getElementById('c').getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, 200, 40);
      g.font = '16px monospace';
      g.fillStyle = '#fff';
      g.fillText('HELLO', 10, 10);
      const d = g.getImageData(0, 0, 200, 40).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
      return n;
    });
    await context.close();
    return bright > 0;
  } catch {
    return true; // unknown — only note a limitation we can actually confirm
  }
}

async function launchBrowser() {
  const baseArgs = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
  try {
    return await chromium.launch({ executablePath: BROWSER, headless: true, args: baseArgs });
  } catch (err) {
    // sandboxed environments (containers) may need --no-sandbox
    console.log(`  launch retry with --no-sandbox (${String(err).slice(0, 80)}…)`);
    return chromium.launch({
      executablePath: BROWSER,
      headless: true,
      args: [...baseArgs, '--no-sandbox']
    });
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

/** Serves the prerendered dist on a free port so `npm run audit` is
 *  self-contained when nothing is on :4200. Returns the server, or null. */
async function serveDistIfNeeded() {
  if (!process.argv[2]) {
    const devUrl = 'http://localhost:4200';
    try {
      await fetch(devUrl, { signal: AbortSignal.timeout(1500) });
      return { url: devUrl, server: null };
    } catch {
      // nothing serving — fall through to dist
    }
  }
  if (!existsSync(DIST)) {
    throw new Error(`no URL given and ${DIST} missing — run \`npm run build\` first`);
  }
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = join(DIST, path);
    if (!(file === DIST || file.startsWith(DIST + '/'))) {
      res.writeHead(403);
      res.end();
      return;
    }
    const isAsset = path.includes('.') && !path.endsWith('.');
    const hit = [file, join(file, 'index.html')].find(p => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
    if (hit) {
      res.writeHead(200, { 'Content-Type': MIME[hit.slice(hit.lastIndexOf('.'))] ?? 'application/octet-stream' });
      createReadStream(hit).pipe(res);
      return;
    }
    if (isAsset) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    // extensionless route: single-page app, fall back to the prerendered index
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(join(DIST, 'index.html')).pipe(res);
  });
  const url = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${server.address().port}`)
    );
  });
  return { url, server };
}

const { url: AUDIT_URL, server: staticServer } = await serveDistIfNeeded();
mkdirSync(VERIFICATION, { recursive: true });
console.log(`audit-browser: ${AUDIT_URL}`);

const browser = await launchBrowser();
const textRasterizable = await canRasterizeText(browser);
if (!textRasterizable) {
  console.log(
    '  [note] this headless build cannot rasterize text glyphs (a system-' +
      'monospace test canvas renders blank) — text will appear blank in the ' +
      'screenshots below. Environment limitation, not a site defect: the DOM ' +
      'text is present and visible, and the fonts are valid self-hosted woff2.'
  );
}
let exitCode = 0;
let lastBag = null; // surfaced if a pass aborts mid-flight

try {
  // ---- Pass 1: desktop, 3D expected ------------------------------------
  console.log('\nPass 1 — desktop 1440x900, 3D expected');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const bag = freshBag();
    lastBag = bag;
    await attach(page, bag);

    await page.goto(AUDIT_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.render !== undefined,
      null,
      { timeout: 15000 }
    );
    const render = await page.evaluate(
      () => document.documentElement.dataset.render
    );
    if (render === '3d') {
      record('pass 1: render mode is 3d', true);
      await page.waitForSelector('.scene-host canvas', { timeout: 20000 }).catch(() => {
        record('pass 1: canvas mounted', false);
      });
    } else {
      const clean = bag.sceneLog.some(line =>
        [...CLEAN_DOWNGRADES].some(r => line.includes(`(${r})`))
      );
      record(
        'pass 1: render mode is 3d (or a clean logged downgrade)',
        render === 'css' && clean,
        render === 'css'
          ? `css mode — ${clean ? 'clean downgrade logged (pass-with-note): ' + bag.sceneLog.join('; ') : 'UNEXPLAINED — ' + bag.sceneLog.join('; ')}`
          : `got '${render}'`
      );
    }
    // let the scene start (font gate <= 1.5 s) and type a few lines
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(VERIFICATION, 'pass1-hero.png') });

    // scroll through the five sections; the screen must follow
    let sectionsOk = true;
    const seen = [];
    for (const id of SECTION_IDS) {
      const y = await page.evaluate(({ secId, vh }) => {
        const el = document.getElementById(secId);
        if (!el) return null;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return Math.min(Math.max(el.offsetTop - vh * 0.45, 0), max);
      }, { secId: id, vh: 900 });
      if (y === null) {
        sectionsOk = record(`pass 1: section #${id} exists`, false);
        continue;
      }
      await page.evaluate(yy => window.scrollTo(0, yy), y);
      await page.waitForTimeout(900);
      const active = await page.evaluate(() => document.body.dataset.activeSection ?? '');
      const expected = SECTION_KEYS[id];
      seen.push(active);
      sectionsOk = record(`pass 1: screen mirrors ${expected}`, active === expected,
        active === expected ? '' : `body[data-active-section]='${active}'`) && sectionsOk;
      await page.screenshot({ path: join(VERIFICATION, `pass1-${id}.png`) });
    }
    const orderOk =
      JSON.stringify(seen) === JSON.stringify(SECTION_IDS.map(id => SECTION_KEYS[id]));
    record('pass 1: section order hero→work→stack→about→contact', orderOk && sectionsOk,
      seen.join(' → '));

    bag.csp = await readCsp(page);
    exitCode = bagFailures(bag, 'pass 1') ? exitCode : 1;
    for (const note of bag.envNotes) console.log(`  [note] ${note}`);
    await context.close();
  }

  // ---- Pass 2: ?no3d=1, CSS fallback ------------------------------------
  console.log('\nPass 2 — ?no3d=1, CSS fallback');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const bag = freshBag();
    lastBag = bag;
    await attach(page, bag);

    await page.goto(`${AUDIT_URL}${AUDIT_URL.includes('?') ? '&' : '?'}no3d=1`, {
      waitUntil: 'load',
      timeout: 30000
    });
    await page.waitForFunction(
      () => document.documentElement.dataset.render !== undefined,
      null,
      { timeout: 15000 }
    );
    const render = await page.evaluate(() => document.documentElement.dataset.render);
    let ok = record('pass 2: render mode is css', render === 'css', `got '${render}'`);
    ok = record(
      'pass 2: no canvas in the DOM',
      (await page.evaluate(() => !!document.querySelector('.scene-host canvas'))) === false
    ) && ok;
    // the hero terminal card must type itself to completion
    try {
      await page.waitForFunction(
        () =>
          document.querySelector('.term__screen')?.textContent.includes('metaphysical exile') ??
          false,
        null,
        { timeout: 15000 }
      );
      ok = record('pass 2: terminal card typed in full', true) && ok;
    } catch {
      ok = record('pass 2: terminal card typed in full', false) && ok;
    }
    ok =
      record(
        'pass 2: stack bars visible in css mode',
        await page.evaluate(
          () =>
            Array.from(document.querySelectorAll('.stack-bars'))
              .length > 0 &&
            Array.from(document.querySelectorAll('.stack-bars')).every(
              el => el.offsetParent !== null
            )
        )
      ) && ok;
    await page.screenshot({ path: join(VERIFICATION, 'pass2-hero.png') });

    bag.csp = await readCsp(page);
    exitCode = bagFailures(bag, 'pass 2') ? exitCode : 1;
    if (ok === false) exitCode = 1;
    for (const note of bag.envNotes) console.log(`  [note] ${note}`);
    await context.close();
  }
} catch (err) {
  console.error(`\n  [FAIL] audit aborted: ${String(err).slice(0, 400)}`);
  if (lastBag) {
    for (const [label, lines] of [
      ['console errors', lastBag.consoleErrors],
      ['page errors', lastBag.pageErrors],
      ['failed requests', lastBag.requestFailed],
      ['http >= 400', lastBag.http400],
      ['scene log', lastBag.sceneLog]
    ]) {
      for (const line of lines.slice(0, 5)) console.error(`    ${label}: ${line.slice(0, 300)}`);
    }
  }
  exitCode = 1;
} finally {
  await browser.close();
  staticServer?.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\naudit-browser: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  for (const f of failed) console.error(`  failed: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
}
process.exit(exitCode);
