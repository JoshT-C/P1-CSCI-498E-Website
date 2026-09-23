/**
 * Security. The page checks run everywhere; the header and method checks
 * need the real nginx (E2E_NGINX=1 with E2E_BASE_URL pointing at it — the
 * CI container job does this), since the local static server sends none.
 */
import { test, expect } from './support';

const nginx = !!process.env['E2E_NGINX'];

test.describe('the page', () => {
  test('no inline script: the only scripts are the bundle and a JSON data block', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const [, attrs, body] of scripts) {
      const executable = !/type="application\/json"/.test(attrs) && body.trim().length > 0;
      expect(executable, `inline script: ${attrs} ${body.slice(0, 60)}`).toBe(false);
    }
    expect(html).not.toMatch(/\son[a-z]+="/i); // no inline event handlers
  });

  test('no plain-http references in the page or its bundle', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const main = html.match(/src="(main-[^"]+\.js)"/)![1];
    const js = await (await request.get(`/${main}`)).text();
    for (const [name, text] of [['page', html], ['bundle', js]] as const) {
      // w3.org namespace URIs are identifiers, not requests
      const hits = [...text.matchAll(/http:\/\/[^\s"'`)]+/g)].map(m => m[0]).filter(u => !u.startsWith('http://www.w3.org/'));
      expect(hits, name).toEqual([]);
    }
  });

  test('a full visit raises no CSP violation (the guard checks every test)', async ({ site }) => {
    await site.open({ tier: 'room' });
    await site.enterShell();
    for (const command of ['projects', 'ai-stack', 'about', 'contact']) await site.run(command);
  });
});

test.describe('nginx', () => {
  test.skip(!nginx, 'needs the real nginx: E2E_NGINX=1 E2E_BASE_URL=…');

  const REQUIRED: Record<string, RegExp> = {
    'content-security-policy': /default-src 'none'/,
    'strict-transport-security': /max-age=\d{7,}/,
    'x-content-type-options': /^nosniff$/,
    'x-frame-options': /^DENY$/,
    'referrer-policy': /strict-origin-when-cross-origin/,
    'permissions-policy': /camera=\(\)/,
    'cross-origin-opener-policy': /same-origin/,
    'cross-origin-resource-policy': /same-origin/
  };

  for (const path of ['/', '/index.html', '/deep/link', '/favicon.ico', '/no-such-file.js']) {
    test(`every security header on ${path}`, async ({ request }) => {
      const res = await request.get(path);
      const headers = res.headers();
      for (const [name, pattern] of Object.entries(REQUIRED)) {
        expect(headers[name], `${name} on ${path}`).toMatch(pattern);
      }
    });
  }

  test('the CSP allows no inline script, no eval, and no framing', async ({ request }) => {
    const csp = (await request.get('/')).headers()['content-security-policy'];
    const directives = Object.fromEntries(csp.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    expect(directives['script-src']).not.toContain("'unsafe-eval'");
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['require-trusted-types-for']).toEqual(["'script'"]);
  });

  test('the server does not name its version', async ({ request }) => {
    const server = (await request.get('/')).headers()['server'] ?? '';
    expect(server).not.toMatch(/\d/);
  });

  test('only GET and HEAD are answered', async ({ request }) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await request.fetch('/', { method });
      expect(res.status(), method).toBe(405);
    }
  });

  test('dotfiles are never served', async ({ request }) => {
    for (const path of ['/.git/config', '/.env', '/.htaccess']) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });

  test('hashed build files are cached for good; the page is revalidated', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const main = html.match(/src="(main-[^"]+\.js)"/)![1];
    expect((await request.get(`/${main}`)).headers()['cache-control']).toContain('immutable');
    expect((await request.get('/')).headers()['cache-control']).toBe('no-cache');
  });
});
