/**
 * Orders of events a quick or unlucky visitor can produce, and states a
 * healthy production page should not reach but must survive: a lost GPU
 * context mid-session, a tier swap under the reader, links fired while a
 * command is still being typed.
 *
 * The black-screen guard samples every animation frame: at no point may
 * the page show neither the shell, nor the login, nor the room.
 */
import { test, expect, type Site } from './support';
import type { Page } from '@playwright/test';

/** Start sampling for the black screen; returns a function that stops and
 *  reports any frames where nothing was on screen. */
async function watchForBlack(page: Page): Promise<() => Promise<number[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __black: number[]; __watch: boolean };
    w.__black = [];
    w.__watch = true;
    const tick = (): void => {
      if (!w.__watch) return;
      const root = document.documentElement;
      const shell = document.getElementById('shell');
      const host = document.querySelector('.scene-host');
      const shellShown = !!shell && getComputedStyle(shell).visibility === 'visible' && Number(getComputedStyle(shell).opacity) > 0.05;
      const canvasShown = !!host?.querySelector('canvas') && Number(getComputedStyle(host).opacity) > 0.05;
      const boot = !!document.querySelector('.boot');
      const flat = root.dataset['render'] !== '3d';
      // mid-scroll between the room and the shell is the glass itself (the
      // canvas fades out as the shell fades in), so either one counts
      if (!flat && !shellShown && !canvasShown && !boot) w.__black.push(Math.round(performance.now()));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return async () =>
    page.evaluate(() => {
      const w = window as unknown as { __black: number[]; __watch: boolean };
      w.__watch = false;
      return w.__black;
    });
}

async function openRoom(site: Site): Promise<void> {
  await site.open({ tier: 'room' });
  await site.require3d();
}

test.describe('orders of events', () => {
  test('exit, then a link at once: ends in the shell on that command', async ({ site, page }) => {
    await openRoom(site);
    await site.enterShell();
    const stop = await watchForBlack(page);
    await site.run('exit');
    await page.locator('.site-nav a[href="#stack"]').click();
    await page.waitForTimeout(2500);
    const s = await site.state();
    expect(s.commands.at(-1)).toBe('ai-stack');
    expect(s.portal).toBe('in');
    expect(s.shellVisible).toBe(true);
    expect(await stop()).toEqual([]);
  });

  test('two header links in quick succession: the second wins, the first is dropped', async ({ site, page }) => {
    await openRoom(site);
    await site.enterShell();
    await page.locator('.site-nav a[href="#stack"]').click();
    await page.locator('.site-nav a[href="#about"]').click();
    await expect.poll(async () => (await site.state()).commands.at(-1)).toBe('about');
    await page.waitForTimeout(800);
    expect((await site.state()).commands).toEqual(['help', 'about']);
  });

  test('ai-stack in every order from the report: never a black screen', async ({ site, page }) => {
    await openRoom(site);
    const stop = await watchForBlack(page);
    // from the room, twice, then via help, then the README link, then out and back
    const count = async () => (await site.state()).commands.length;
    await page.locator('.site-nav a[href="#stack"]').click();
    await expect.poll(async () => (await site.state()).commands.at(-1), { timeout: 15_000 }).toBe('ai-stack');
    await site.shellShown();
    let n = await count();
    await page.locator('.site-nav a[href="#stack"]').click();
    await expect.poll(count, { timeout: 15_000 }).toBe(n + 1);
    // the newest help: clicking a scrolled-away entry makes Playwright
    // scroll the page itself, which a reader's click never does
    await site.run('help');
    n = await count();
    await site.lastEntry().locator('.shell__cmd', { hasText: 'ai-stack' }).click();
    await page.keyboard.press('Enter');
    await expect.poll(count, { timeout: 15_000 }).toBe(n + 1);
    await site.run('projects');
    await site.lastEntry().getByRole('link', { name: /ai-stack: the models/ }).click();
    await site.run('exit');
    await page.waitForTimeout(300);
    await page.locator('.site-nav a[href="#stack"]').click();
    await expect.poll(async () => (await site.state()).portal, { timeout: 15_000 }).toBe('in');
    await page.waitForTimeout(1500);
    expect(await stop(), 'frames with nothing on screen').toEqual([]);
    expect((await site.state()).shellVisible).toBe(true);
  });

  test('a station opened by link while in the shell, then closed, returns to the shell', async ({ site, page }) => {
    await openRoom(site);
    await site.enterShell();
    await page.evaluate(() => {
      location.hash = 'rack';
    });
    await expect(page.locator('dialog.station-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await site.state()).portal).toBe('in');
    await site.shellShown();
  });

  test('scrolling hard back and forth across the glass settles consistently', async ({ site, page }) => {
    await openRoom(site);
    const stop = await watchForBlack(page);
    await page.mouse.move(900, 500);
    for (let i = 0; i < 12; i++) {
      await page.evaluate(i => window.scrollTo(0, i % 2 ? document.documentElement.scrollHeight : document.documentElement.scrollHeight * 0.6), i);
      await page.waitForTimeout(60);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => (await site.state()).portal).toBe('in');
    await page.waitForTimeout(600);
    expect((await site.state()).shellVisible).toBe(true);
    expect(await stop()).toEqual([]);
  });

  test('a resize in the shell keeps the page at the shell', async ({ site, page }) => {
    await openRoom(site);
    await site.enterShell();
    await page.setViewportSize({ width: 1100, height: 700 });
    await site.enterShell();
  });

  test('reloading in the shell never lands on a black screen', async ({ site, page }) => {
    await openRoom(site);
    await site.enterShell();
    await page.reload();
    await site.sceneStarted();
    await page.waitForTimeout(1500);
    expect(await site.somethingOnScreen()).toBe(true);
  });
});

test.describe('states production should not reach', () => {
  test('the GPU context is lost in the shell: the shell stays, the room steps down', async ({ site, page, guard }) => {
    guard.allow(/Context Lost|WebGL context was lost|context lost/i);
    await openRoom(site);
    await site.enterShell();
    const stop = await watchForBlack(page);
    await page.evaluate(() => {
      const canvas = document.querySelector('.scene-host canvas') as HTMLCanvasElement;
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext;
      gl.getExtension('WEBGL_lose_context')!.loseContext();
    });
    await expect.poll(async () => (await site.state()).tier).toBe('desk');
    await site.sceneStarted();
    await page.waitForTimeout(1500);
    expect(await stop(), 'frames with nothing on screen').toEqual([]);
    const s = await site.state();
    expect(s.portal).toBe('in');
    expect(s.shellVisible).toBe(true);
  });

  test('the GPU context is lost in the room: the lighter room takes over', async ({ site, page, guard }) => {
    guard.allow(/Context Lost|WebGL context was lost|context lost/i);
    await openRoom(site);
    await page.evaluate(() => {
      const canvas = document.querySelector('.scene-host canvas') as HTMLCanvasElement;
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext;
      gl.getExtension('WEBGL_lose_context')!.loseContext();
    });
    await expect.poll(async () => (await site.state()).tier).toBe('desk');
    await expect(page.locator('.scene-host canvas')).toBeAttached({ timeout: 20_000 });
  });

  test('leaving the glass while the login plays ends the login', async ({ site, page }) => {
    await page.addInitScript(() => sessionStorage.removeItem('tty-booted'));
    await openRoom(site);
    await site.enterShell();
    await expect(page.locator('.boot')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.boot')).toHaveCount(0, { timeout: 2_000 });
  });

  test('a link clicked before the app has started still works once it has', async ({ site, page }) => {
    // hold the app's bundle back, click the server-rendered link, let go
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    await page.route(/\/main-[A-Z0-9]+\.js$/, async route => {
      await held;
      await route.continue();
    });
    // 'commit': the load event itself waits on the held bundle. No query
    // string: with <base href="/">, '#about' on '/?x' is a different URL,
    // so a click before the app starts reloads (production has no query)
    await page.goto('/', { waitUntil: 'commit' });
    await page.locator('.site-nav a[href="#about"]').click();
    release();
    await page.waitForFunction(() => document.documentElement.dataset['render'] !== undefined);
    // the native jump landed on the server-rendered section; the app then
    // opens the shell on that section
    await expect.poll(async () => (await site.state()).commands.at(-1), { timeout: 15_000 }).toBe('about');
  });
});
