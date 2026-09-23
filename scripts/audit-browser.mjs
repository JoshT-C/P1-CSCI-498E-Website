#!/usr/bin/env node
/**
 * Browser audit: the site in a real browser, failing on what visitors
 * would feel.
 *
 * Every pass fails on uncaught exceptions, console errors, failed
 * requests, HTTP >= 400 and CSP violations.
 *
 * Pass 1 (desktop 1440x900, 3D expected): the room loads without the
 *   session showing through it; a station opens its panel, locks the
 *   page and closes on Esc; scrolling to the end goes through the glass
 *   to the shell, which fills the screen and ends the page; the shell
 *   starts at `help`, runs typed commands, reports unknown ones, puts a
 *   clicked command on the prompt without running it, runs a header
 *   link's command, and `exit` walks back out to the room.
 * Pass 2 (?no3d=1, flat): no canvas, the intro's terminal card types in
 *   full, and the shell under it runs commands.
 * Pass 3 (JavaScript off): the server-rendered HTML carries every section
 *   and the contact email, for search engines and readers without JS.
 * Pass 4 (phone 375x812, touch): the header's four links fit on screen
 *   and nothing scrolls sideways.
 *
 * A 3D pass that ends in a clean, logged downgrade (a slow headless GPU)
 * skips its 3D-only checks with a note; an unexplained flat page fails.
 * GitHub API failures (network, rate limit) are environment, not site
 * bugs: reported as notes, never as failures.
 *
 * Usage: node scripts/audit-browser.mjs [url]
 * No URL given: uses http://localhost:4200 if something is serving there,
 * otherwise serves dist/jtc-site/browser on a free port itself (run
 * `npm run build` first). AUDIT_BROWSER=chromium switches from Firefox.
 * Exits non-zero on any failure. Screenshots land in verification/.
 */
import { chromium, firefox } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { serveDist } from './serve-dist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERIFICATION = join(ROOT, 'verification');
const EMAIL = 'joshua_t-c@outlook.com';
const SECTION_IDS = ['work', 'stack', 'about', 'contact'];

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
function note(text) {
  console.log(`  [note] ${text}`);
}

/** Messages the browser itself writes to the page console, not the site. */
const BROWSER_NOISE = [/classified as a bounce tracker/i];

function freshBag() {
  return {
    consoleErrors: [],
    consoleOther: [],
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
      window.__csp.push(`${e.effectiveDirective || e.violatedDirective || '?'}: ${e.blockedURI || ''}`);
    });
  });
  // the console must stay silent: errors, warnings, logs and info all count
  page.on('console', msg => {
    const text = msg.text();
    if (BROWSER_NOISE.some(re => re.test(text))) return;
    if (msg.type() === 'error') bag.consoleErrors.push(text);
    else if (msg.type() !== 'debug') bag.consoleOther.push(`${msg.type()}: ${text}`);
  });
  page.on('pageerror', err => bag.pageErrors.push(String(err)));
  page.on('requestfailed', req => {
    const url = req.url();
    const why = req.failure()?.errorText ?? 'unknown';
    if (url.includes('api.github.com')) bag.envNotes.push(`github api failed: ${why}`);
    // a navigation away (exit, a new pass) aborts in-flight requests
    else if (!/abort/i.test(why)) bag.requestFailed.push(`${req.method()} ${url} — ${why}`);
  });
  page.on('response', res => {
    if (res.status() < 400) return;
    const url = res.url();
    if (url.includes('api.github.com')) bag.envNotes.push(`github api ${res.status()}`);
    else bag.http400.push(`${res.status()} ${url}`);
  });
}

async function finishPass(page, bag, pass) {
  if (page) bag.csp = (await page.evaluate(() => window.__csp ?? []).catch(() => [])) ?? [];
  let ok = true;
  ok = record(`${pass}: no uncaught exceptions`, bag.pageErrors.length === 0, bag.pageErrors.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no console errors`, bag.consoleErrors.length === 0, bag.consoleErrors.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: nothing else in the console`, bag.consoleOther.length === 0, bag.consoleOther.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no failed requests`, bag.requestFailed.length === 0, bag.requestFailed.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no HTTP >= 400`, bag.http400.length === 0, bag.http400.slice(0, 3).join(' | ')) && ok;
  ok = record(`${pass}: no CSP violations`, bag.csp.length === 0, bag.csp.slice(0, 3).join(' | ')) && ok;
  for (const n of bag.envNotes) note(n);
  return ok;
}

async function launchBrowser() {
  if (process.env.AUDIT_BROWSER === 'chromium') {
    const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
    try {
      return await chromium.launch({ headless: true, args });
    } catch (err) {
      // sandboxed environments (containers) may need --no-sandbox
      console.log(`  launch retry with --no-sandbox (${String(err).slice(0, 80)}…)`);
      return chromium.launch({ headless: true, args: [...args, '--no-sandbox'] });
    }
  }
  return firefox.launch({ headless: true, firefoxUserPrefs: { 'webgl.force-enabled': true } });
}

/** A URL given, or :4200 if something serves there, or the dist served
 *  here (scripts/serve-dist.mjs). */
async function target() {
  if (process.argv[2]) return { url: process.argv[2].replace(/\/$/, ''), server: null };
  const devUrl = 'http://localhost:4200';
  try {
    await fetch(devUrl, { signal: AbortSignal.timeout(1500) });
    return { url: devUrl, server: null };
  } catch {
    return serveDist({ port: 0 });
  }
}

/** The shell's state, as the checks read it. */
const shellState = page =>
  page.evaluate(() => {
    const shell = document.getElementById('shell');
    const box = shell?.getBoundingClientRect();
    return {
      portal: document.documentElement.dataset.portal ?? null,
      station: document.documentElement.dataset.station ?? null,
      visible: shell ? getComputedStyle(shell).visibility === 'visible' && getComputedStyle(shell).opacity !== '0' : false,
      commands: [...document.querySelectorAll('.shell__entry > .tty__cmd')].map(p => p.textContent.split('$').pop().trim()),
      input: document.getElementById('shell-input')?.value ?? null,
      focused: document.activeElement?.id ?? '',
      current: document.querySelector('.site-nav a[aria-current="true"]')?.getAttribute('href') ?? null,
      scrollY: Math.round(window.scrollY),
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      shellBottom: box ? Math.round(box.bottom) : null,
      viewport: window.innerHeight
    };
  });

/** Type a line at the prompt and press Enter. */
async function runCommand(page, line) {
  await page.focus('#shell-input');
  await page.keyboard.type(line, { delay: 15 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

const { url: AUDIT_URL, server: staticServer } = await target();
const withQuery = q => `${AUDIT_URL}/${AUDIT_URL.includes('?') ? '&' : '?'}${q}`;
mkdirSync(VERIFICATION, { recursive: true });
console.log(`audit-browser: ${AUDIT_URL} (${process.env.AUDIT_BROWSER === 'chromium' ? 'chromium' : 'firefox'})`);

const browser = await launchBrowser();
let exitCode = 0;
let lastBag = null; // surfaced if a pass aborts mid-flight
const fail = ok => {
  if (!ok) exitCode = 1;
  return ok;
};

try {
  // ---- Pass 1: desktop, 3D expected -----------------------------------
  console.log('\nPass 1 — desktop 1440x900, 3D expected');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const bag = freshBag();
    lastBag = bag;
    await attach(page, bag);

    // sample the shell's visibility from the first paint until the scene
    // is up: in 3D the session must never show over the room
    await page.addInitScript(() => {
      window.__shellFlash = [];
      const sample = () => {
        const shell = document.getElementById('shell');
        const root = document.documentElement;
        if (shell && root.dataset.render === '3d' && root.dataset.portal !== 'in') {
          const cs = getComputedStyle(shell);
          const box = shell.getBoundingClientRect();
          if (cs.visibility === 'visible' && cs.opacity !== '0' && box.top < innerHeight && box.bottom > 0) {
            window.__shellFlash.push(Math.round(performance.now()));
          }
        }
        if (performance.now() < 6000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await page.goto(AUDIT_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.dataset.render !== undefined, null, { timeout: 15000 });
    let is3d = (await page.evaluate(() => document.documentElement.dataset.render)) === '3d';
    if (is3d) {
      fail(record('pass 1: render mode is 3d', true));
      is3d = fail(record('pass 1: canvas mounted',
        await page.waitForSelector('.scene-host canvas', { timeout: 20000 }).then(() => true, () => false)));
      await page.waitForFunction(() => document.documentElement.dataset.portal !== undefined, null, { timeout: 20000 }).catch(() => {});
    } else {
      const reason = await page.evaluate(() => document.documentElement.dataset.tierReason ?? '');
      const clean = CLEAN_DOWNGRADES.has(reason);
      fail(record('pass 1: render mode is 3d (or a clean, recorded downgrade)', clean,
        clean ? `flat — downgraded for ${reason}` : `UNEXPLAINED flat page (reason '${reason}')`));
    }
    await page.waitForTimeout(2500);

    if (is3d) {
      const flashes = await page.evaluate(() => window.__shellFlash);
      fail(record('pass 1: the session never shows over the room while loading', flashes.length === 0,
        flashes.length ? `visible at ${flashes.slice(0, 3).join(', ')} ms` : ''));
      await page.screenshot({ path: join(VERIFICATION, 'pass1-room.png') });

      // a station: panel, scroll lock, Esc
      await page.click('.station-link:has-text("rack")');
      await page.waitForTimeout(2500);
      let s = await shellState(page);
      const panelOpen = await page.evaluate(() => document.querySelector('.station-panel')?.open ?? false);
      fail(record('pass 1: the rack station opens its panel', panelOpen && s.station === 'rack'));
      await page.screenshot({ path: join(VERIFICATION, 'pass1-rack.png') });
      const before = s.scrollY;
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(400);
      s = await shellState(page);
      fail(record('pass 1: the page does not scroll under an open panel', s.scrollY === before, `moved ${s.scrollY - before}px`));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      s = await shellState(page);
      fail(record('pass 1: Esc closes the panel and returns to the room', s.station === null));

      // the dive: to the end of the page, through the glass
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(3500);
      await page.keyboard.press('Escape'); // skip the first-visit login
      await page.waitForTimeout(800);
      s = await shellState(page);
      fail(record('pass 1: the end of the page is through the glass', s.portal === 'in' && s.visible));
      fail(record('pass 1: the shell ends the page (nothing to scroll past)',
        s.scrollY === s.maxScroll && Math.abs(s.shellBottom - s.viewport) <= 1,
        `scroll ${s.scrollY}/${s.maxScroll}, shell bottom ${s.shellBottom} of ${s.viewport}`));
      fail(record('pass 1: the prompt has the keyboard', s.focused === 'shell-input', `focused: ${s.focused || 'none'}`));
    } else {
      note('pass 1: 3D-only checks skipped (flat page); the shell checks below still run');
      await page.evaluate(() => document.getElementById('shell')?.scrollIntoView());
      await page.waitForTimeout(800);
    }

    // the shell
    let s = await shellState(page);
    fail(record('pass 1: the session starts at help', JSON.stringify(s.commands) === '["help"]', s.commands.join(', ')));
    await page.screenshot({ path: join(VERIFICATION, 'pass1-shell-help.png') });

    await runCommand(page, 'about');
    s = await shellState(page);
    fail(record('pass 1: a typed command runs', s.commands.at(-1) === 'about' && s.input === ''));
    fail(record('pass 1: the header marks the command\'s section', s.current === '#about', `current: ${s.current}`));
    await page.screenshot({ path: join(VERIFICATION, 'pass1-shell-about.png') });

    await runCommand(page, 'sudo make me a sandwich');
    const unknown = await page.evaluate(() => document.querySelector('.shell__entry:last-child .tty__err')?.textContent ?? '');
    fail(record('pass 1: an unknown command says so', unknown.includes('command not found'), unknown));

    const count = s.commands.length + 1;
    await page.click('.shell__help .shell__cmd:has-text("projects")');
    await page.waitForTimeout(400);
    s = await shellState(page);
    fail(record('pass 1: clicking a command in help fills the prompt without running it',
      s.input === 'projects' && s.commands.length === count, `prompt '${s.input}', ${s.commands.length} entries`));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    s = await shellState(page);
    fail(record('pass 1: Enter runs the filled command', s.commands.at(-1) === 'projects'));

    await page.click('.site-nav a[href="#contact"]');
    await page.waitForTimeout(2500);
    s = await shellState(page);
    fail(record('pass 1: a header link types and runs its command', s.commands.at(-1) === 'contact' && s.current === '#contact'));
    const mail = await page.evaluate(email => !!document.querySelector(`#shell a[href="mailto:${email}"]`), EMAIL);
    fail(record('pass 1: contact shows the email', mail));
    await page.screenshot({ path: join(VERIFICATION, 'pass1-shell-contact.png') });

    if (is3d) {
      await runCommand(page, 'exit');
      await page.waitForTimeout(6000);
      s = await shellState(page);
      fail(record('pass 1: exit walks back out to the room', s.portal === 'out' && s.scrollY === 0 && !s.visible,
        `portal ${s.portal}, scroll ${s.scrollY}`));
    }

    fail(await finishPass(page, bag, 'pass 1'));
    await context.close();
  }

  // ---- Pass 2: ?no3d=1, flat ------------------------------------------
  console.log('\nPass 2 — ?no3d=1, flat');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const bag = freshBag();
    lastBag = bag;
    await attach(page, bag);
    await page.goto(withQuery('no3d=1'), { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.dataset.render !== undefined, null, { timeout: 15000 });
    const render = await page.evaluate(() => document.documentElement.dataset.render);
    fail(record('pass 2: render mode is flat', render === 'css', `got '${render}'`));
    fail(record('pass 2: no canvas in the DOM', !(await page.evaluate(() => !!document.querySelector('.scene-host canvas')))));
    const typed = await page
      .waitForFunction(() => document.querySelector('.term__screen')?.textContent.includes('metaphysical exile') ?? false, null, { timeout: 15000 })
      .then(() => true, () => false);
    fail(record('pass 2: the intro\'s terminal card types in full', typed));
    await page.screenshot({ path: join(VERIFICATION, 'pass2-flat-intro.png') });

    await page.click('.site-nav a[href="#stack"]');
    await page.waitForTimeout(2500);
    const s = await shellState(page);
    fail(record('pass 2: the shell runs a header link\'s command', s.commands.at(-1) === 'ai-stack' && s.visible));
    await page.screenshot({ path: join(VERIFICATION, 'pass2-flat-shell.png') });
    fail(await finishPass(page, bag, 'pass 2'));
    await context.close();
  }

  // ---- Pass 3: JavaScript off -----------------------------------------
  console.log('\nPass 3 — JavaScript off');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const page = await context.newPage();
    const bag = freshBag();
    lastBag = bag;
    page.on('response', res => {
      if (res.status() >= 400) bag.http400.push(`${res.status()} ${res.url()}`);
    });
    await page.goto(AUDIT_URL, { waitUntil: 'load', timeout: 30000 });
    const found = await page.evaluate(ids => ids.filter(id => document.getElementById(id)), SECTION_IDS);
    fail(record('pass 3: every section is in the HTML', found.length === SECTION_IDS.length, `found: ${found.join(', ')}`));
    const html = await page.content();
    fail(record('pass 3: the email is in the HTML', html.includes(EMAIL)));
    fail(record('pass 3: the name is in the HTML', html.includes('Joshua')));
    fail(record('pass 3: no HTTP >= 400', bag.http400.length === 0, bag.http400.slice(0, 3).join(' | ')));
    await context.close();
  }

  // ---- Pass 4: phone ----------------------------------------------------
  console.log('\nPass 4 — phone 375x812, touch');
  {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: process.env.AUDIT_BROWSER === 'chromium' // Firefox has no mobile emulation
    });
    const page = await context.newPage();
    const bag = freshBag();
    lastBag = bag;
    await attach(page, bag);
    await page.goto(AUDIT_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      links: [...document.querySelectorAll('.site-nav a')].map(a => {
        const b = a.getBoundingClientRect();
        return b.left >= 0 && b.right <= window.innerWidth;
      })
    }));
    fail(record('pass 4: nothing scrolls sideways', layout.overflow <= 0, `${layout.overflow}px too wide`));
    fail(record('pass 4: all four header links are on screen', layout.links.length === 4 && layout.links.every(Boolean)));
    await page.screenshot({ path: join(VERIFICATION, 'pass4-phone.png') });
    fail(await finishPass(page, bag, 'pass 4'));
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
      ['other console', lastBag.consoleOther]
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
for (const f of failed) console.error(`  failed: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
process.exit(exitCode);
