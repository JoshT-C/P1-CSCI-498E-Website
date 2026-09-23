/**
 * Failures outside the site's control: the GitHub API, the room's model
 * files, WebGL, fonts, storage, the network. Each must leave a working
 * page and an honest message, never a blank or a crash.
 */
import { test, expect } from './support';

test.describe('GitHub API', () => {
  test('a server error shows why, and retry recovers', async ({ site, page, guard }) => {
    guard.allow(/api\.github\.com.*50\d|Failed to load resource/i);
    let fail = true;
    await page.route('https://api.github.com/**', route =>
      fail
        ? route.fulfill({ status: 502, body: 'bad gateway' })
        : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects');
    await expect(site.lastEntry().locator('.tty__err')).toContainText('GitHub is having problems');
    fail = false;
    await site.lastEntry().getByRole('button', { name: '[retry]' }).click();
    await expect(site.lastEntry()).toContainText('0 repositories');
  });

  test('the rate limit is named as such', async ({ site, page, guard }) => {
    guard.allow(/api\.github\.com.*403|Failed to load resource/i);
    await page.route('https://api.github.com/**', route => route.fulfill({ status: 403, body: '{"message":"API rate limit exceeded"}' }));
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects');
    await expect(site.lastEntry().locator('.tty__err')).toContainText('rate limit');
  });

  test('no network to GitHub says so', async ({ site, page, guard }) => {
    guard.allow(/request failed: https:\/\/api\.github\.com|NetworkError|Failed to load resource|Cross-Origin Request Blocked/i);
    await page.route('https://api.github.com/**', route => route.abort('internetdisconnected'));
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects');
    await expect(site.lastEntry().locator('.tty__err')).toContainText('Could not reach GitHub');
  });

  test('while the request is out, the output says it is fetching', async ({ site, page }) => {
    await page.route('https://api.github.com/**', () => {
      // never answered: the request stays in flight for this test
    });
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects');
    await expect(site.lastEntry().getByRole('status')).toContainText('fetching from api.github.com');
    await expect(site.lastEntry().locator('.tty__ls li')).toHaveCount(2); // curated work shows regardless
  });
});

test.describe('the room', () => {
  test('the room model missing: the lighter room loads instead', async ({ site, page, guard }) => {
    guard.allow(/room\.glb|room failed to load|Failed to load resource|404/i);
    await page.route('**/assets/room/room.glb', route => route.fulfill({ status: 404, body: '' }));
    await site.open({ tier: 'room' });
    await site.require3d();
    await expect.poll(async () => (await site.state()).tier, { timeout: 20_000 }).toBe('desk');
    await expect(page.locator('.scene-host canvas')).toBeAttached();
  });

  test('both room models missing: the flat page, with everything readable', async ({ site, page, guard }) => {
    guard.allow(/room(-lite)?\.glb|room failed to load|Failed to load resource|404/i);
    await page.route(/\/assets\/room\/room(-lite)?\.glb$/, route => route.fulfill({ status: 404, body: '' }));
    await site.open({ tier: 'room' });
    await expect.poll(async () => (await site.state()).render, { timeout: 30_000 }).toBe('css');
    expect((await site.state()).tierReason).toBe('scene-load-fail');
    await site.enterShell();
    await site.run('about');
    await expect(site.lastEntry()).toContainText('Colorado School of Mines');
  });

  test('a corrupt model file is a failure like a missing one', async ({ site, page, guard }) => {
    guard.allow(/room(-lite)?\.glb|room failed to load|glTF|JSON|Unexpected|invalid|Failed to load resource/i);
    await page.route(/\/assets\/room\/room(-lite)?\.glb$/, route =>
      route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: 'not a model' })
    );
    await site.open({ tier: 'room' });
    await expect.poll(async () => (await site.state()).render, { timeout: 30_000 }).toBe('css');
  });

  test('no WebGL at all: the flat page from the start', async ({ site, page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await site.open();
    const s = await site.state();
    expect(s.render).toBe('css');
    expect(s.tierReason).toBe('no-webgl');
    await expect(page.locator('.scene-host canvas')).toHaveCount(0);
  });
});

test.describe('the page itself', () => {
  test('fonts blocked: the page still renders in the fallback monospace', async ({ site, page, guard }) => {
    guard.allow(/woff2|downloadable font|Failed to load resource|request failed/i);
    await page.route('**/*.woff2', route => route.abort('failed'));
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('whoami');
    await expect(site.lastEntry()).toContainText('metaphysical exile');
  });

  test('storage blocked (private mode): nothing throws', async ({ site, page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        }
      });
    });
    await site.open({ tier: 'room' });
    await site.enterShell();
    await site.run('contact');
    await expect(site.lastEntry()).toContainText('joshua_t-c');
  });

  test('offline after loading: the shell still answers from what it has', async ({ site, context, guard }) => {
    guard.allow(/request failed|NetworkError|Failed to load resource/i);
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects'); // loads the repo list while online
    await expect(site.lastEntry()).toContainText('minecraft-at-mines-panel');
    await context.setOffline(true);
    await site.run('about');
    await site.run('projects'); // answered from the session cache
    await expect(site.lastEntry()).toContainText('minecraft-at-mines-panel');
    await context.setOffline(false);
  });

  test('an unknown path serves the page (single-page fallback)', async ({ page }) => {
    const res = await page.goto('/some/deep/path');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Joshua');
  });

  test('a missing file is a 404, not the page', async ({ request }) => {
    const res = await request.get('/no-such-file.js');
    expect(res.status()).toBe(404);
  });
});
