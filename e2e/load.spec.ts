/** First load: what every visitor sees before they touch anything. */
import { test, expect, EMAIL } from './support';

test.describe('first load', () => {
  test('names the page and the person', async ({ site, page }) => {
    await site.open();
    await expect(page).toHaveTitle(/Joshua T-C/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Colorado School of Mines/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Joshua');
  });

  test('3D: the room loads, with the intro pane and all five stations', async ({ site, page }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
    await expect(page.locator('.scene-host canvas')).toBeAttached();
    await expect(page.locator('.intro__panel')).toBeVisible();
    await expect(page.locator('.station-link')).toHaveCount(5);
    const s = await site.state();
    expect(s.portal).toBe('out');
    expect(s.shellVisible).toBe(false);
  });

  test('3D: the session never shows over the room while the page loads', async ({ site, page }) => {
    // sample every frame from the first paint: in 3D the shell must stay
    // hidden until the camera is through the glass
    await page.addInitScript(() => {
      const w = window as unknown as { __flash: number[] };
      w.__flash = [];
      const sample = (): void => {
        const shell = document.getElementById('shell');
        const root = document.documentElement;
        // before the stylesheet has loaded nothing is painted (it is render-
        // blocking), though scripts and frames already run: not a flash
        const styled = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].every(l => !!l.sheet);
        if (styled && shell && root.dataset['render'] === '3d' && root.dataset['portal'] !== 'in') {
          const cs = getComputedStyle(shell);
          const box = shell.getBoundingClientRect();
          if (cs.visibility === 'visible' && cs.opacity !== '0' && box.top < innerHeight && box.bottom > 0) {
            w.__flash.push(Math.round(performance.now()));
          }
        }
        if (performance.now() < 8000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await site.open({ tier: 'room' });
    await site.require3d();
    await page.waitForTimeout(1500);
    const flashes = await page.evaluate(() => (window as unknown as { __flash: number[] }).__flash);
    expect(flashes, 'shell visible over the room at these times (ms)').toEqual([]);
  });

  test('flat (?no3d=1): no canvas, and the intro card types itself out', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    expect((await site.state()).render).toBe('css');
    await expect(page.locator('.scene-host canvas')).toHaveCount(0);
    await expect(page.locator('.term__screen')).toContainText('metaphysical exile', { timeout: 20_000 });
  });

  test('reduced motion: the flat page, typed card shown at once', async ({ site, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await site.open();
    const s = await site.state();
    expect(s.render).toBe('css');
    expect(s.tierReason).toBe('reduced-motion');
    await expect(page.locator('.term__screen')).toContainText('metaphysical exile', { timeout: 2_000 });
  });

  test('the page makes no request anywhere but itself and the GitHub API', async ({ site, page }) => {
    const origins = new Set<string>();
    page.on('request', req => origins.add(new URL(req.url()).origin));
    await site.open({ tier: 'room' });
    await site.enterShell();
    await site.run('projects');
    const self = new URL(page.url()).origin;
    expect([...origins].filter(o => o !== self && o !== 'https://api.github.com')).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  // Chromium, with scripts off, refuses the page's module preloads as a
  // CSP matter: its policy, not the site's
  test.beforeEach(({ guard }) => guard.allow(/request failed: .*\.js \(csp\)/));

  test('the server-rendered page carries every section, the name and the email', async ({ page }) => {
    await page.goto('/');
    for (const id of ['work', 'stack', 'about', 'contact']) {
      await expect(page.locator(`#${id}`), `#${id}`).toBeAttached();
    }
    await expect(page.locator(`a[href="mailto:${EMAIL}"]`).first()).toBeAttached();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Joshua');
  });

  test('header links are plain anchors to those sections', async ({ page }) => {
    await page.goto('/');
    for (const id of ['work', 'stack', 'about', 'contact']) {
      await expect(page.locator(`.site-nav a[href="#${id}"]`)).toHaveCount(1);
    }
  });
});
