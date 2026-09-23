/**
 * Shared fixtures for the end-to-end suite.
 *
 * Every test gets, automatically:
 *  - a console guard: any console message (error, warning, log, info),
 *    uncaught exception, CSP violation or failed request fails the test,
 *    unless the test declares it expected with `guard.allow(/pattern/)`;
 *  - a GitHub API stand-in with a fixed repo list, so no test depends on
 *    the network or the anonymous rate limit (tests that need a failure
 *    register their own route, which takes precedence);
 *  - the one-time login skipped, unless the test opts in with
 *    `test.use({ boot: true })`.
 */
import { test as base, expect, type Page } from '@playwright/test';

export type Tier = 'room' | 'desk' | 'css';

/**
 * Machines differ in speed, and the room renders in software on CI, so
 * every time limit and observation window here goes through t(): 1x by
 * default, 2x on CI, or E2E_TIME_SCALE for a slower machine. Tests wait for
 * states, not for time, wherever the outcome is something that happens;
 * fixed windows remain only where the check is that something does NOT
 * happen, or where the timing is the scenario itself (two quick clicks).
 */
export const TIME_SCALE = Number(process.env['E2E_TIME_SCALE'] ?? (process.env['CI'] ? 2 : 1));
export const t = (ms: number): number => Math.round(ms * TIME_SCALE);

export const EMAIL = 'joshua_t-c@outlook.com';

/** What the GitHub API stand-in returns for the repo list. */
export const REPOS = [
  repo(1, 'JoshT-C', 'Config files for my GitHub profile.', null, '2026-08-08T00:00:00Z'),
  repo(2, 'minecraft-at-mines-panel', 'On-demand game servers for the club.', 'TypeScript', '2026-07-01T00:00:00Z'),
  repo(3, 'a-fork', 'Forked, so the site must hide it.', 'Go', '2026-06-01T00:00:00Z', { fork: true }),
  repo(4, 'JoshT-C.github.io', 'The previous site: hidden, shown as a curated entry instead.', 'TypeScript', '2026-05-01T00:00:00Z')
];

function repo(id: number, name: string, description: string, language: string | null, updated: string, extra: object = {}) {
  return {
    id, name, full_name: `JoshT-C/${name}`, description, html_url: `https://github.com/JoshT-C/${name}`,
    homepage: null, language, topics: [], stargazers_count: id, forks_count: 0,
    created_at: '2024-01-01T00:00:00Z', updated_at: updated, pushed_at: updated,
    archived: false, fork: false, private: false, ...extra
  };
}

/** Messages the browser writes to the page console itself, not the site. */
const BROWSER_NOISE = [
  /classified as a bounce tracker/i,
  // Firefox's notes on the test harness's own page.evaluate() code
  /debugger eval code/
];

export interface Guard {
  /** Declare console output matching `pattern` expected in this test. */
  allow(pattern: RegExp): void;
}

export interface ShellState {
  portal: string | null;
  station: string | null;
  tier: string | null;
  tierReason: string | null;
  render: string | null;
  shellVisible: boolean;
  canvasOpacity: number | null;
  bootVisible: boolean;
  commands: string[];
  input: string | null;
  focused: string;
  current: string | null;
  scrollY: number;
  maxScroll: number;
}

export class Site {
  constructor(readonly page: Page) {}

  /** Load the page. `tier` forces one with ?tier= (3D tests use 'room');
   *  resolves once the tier is decided and, in 3D, the scene has started
   *  (or stepped down). */
  async open(opts: { tier?: Tier; query?: string; hash?: string } = {}): Promise<void> {
    const params = new URLSearchParams(opts.query ?? '');
    if (opts.tier === 'css') params.set('no3d', '1');
    else if (opts.tier) params.set('tier', opts.tier);
    const q = params.toString();
    await this.page.goto(`/${q ? `?${q}` : ''}${opts.hash ? `#${opts.hash}` : ''}`);
    await this.page.waitForFunction(() => document.documentElement.dataset['render'] !== undefined);
    if (opts.tier && opts.tier !== 'css') await this.sceneStarted();
  }

  /** Wait until the 3D scene has drawn and reported where the camera is,
   *  or the page has stepped down to flat. */
  async sceneStarted(): Promise<void> {
    await this.page.waitForFunction(
      () => document.documentElement.dataset['render'] === 'css' || document.documentElement.dataset['portal'] !== undefined,
      null,
      { timeout: t(30_000) }
    );
  }

  /** Skip the test when this browser cannot run WebGL at all (the page
   *  stepped down for a missing capability, not for a site fault). */
  async require3d(): Promise<void> {
    const s = await this.state();
    const missing = ['no-webgl', 'webgl-fail'].includes(s.tierReason ?? '');
    base.skip(s.render !== '3d' && missing, `no WebGL in this browser (${s.tierReason})`);
    expect(s.render, `the page stepped down: ${s.tierReason}`).toBe('3d');
  }

  /** Scroll to the end of the page: through the glass in 3D, the shell
   *  when flat. */
  async enterShell(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // the page scrolls smoothly and the shell fades in: wait for both to end
    await expect
      .poll(async () => {
        const s = await this.state();
        return s.scrollY === s.maxScroll && s.shellVisible && (s.render !== '3d' || s.portal === 'in');
      }, { timeout: t(15_000) })
      .toBe(true);
  }

  /** Type a line at the prompt and press Enter. */
  async run(line: string): Promise<void> {
    const before = (await this.state()).commands.length;
    const input = this.page.locator('#shell-input');
    await input.click();
    await input.fill('');
    await this.page.keyboard.type(line);
    await this.page.keyboard.press('Enter');
    if (line.trim().toLowerCase() !== 'clear') {
      await expect.poll(async () => (await this.state()).commands.length).toBeGreaterThan(before);
    }
  }

  /** The last entry in the scrollback (its prompt line and output). */
  lastEntry() {
    return this.page.locator('.shell__entry').last();
  }

  /** Wait for the shell to be fully on screen (it fades in over 450 ms). */
  async shellShown(): Promise<void> {
    await expect.poll(async () => (await this.state()).shellVisible, { timeout: t(15_000) }).toBe(true);
  }

  async state(): Promise<ShellState> {
    return this.page.evaluate(() => {
      const root = document.documentElement;
      const shell = document.getElementById('shell');
      const cs = shell ? getComputedStyle(shell) : null;
      const host = document.querySelector('.scene-host');
      return {
        portal: root.dataset['portal'] ?? null,
        station: root.dataset['station'] ?? null,
        tier: root.dataset['tier'] ?? null,
        tierReason: root.dataset['tierReason'] ?? null,
        render: root.dataset['render'] ?? null,
        shellVisible: !!cs && cs.visibility === 'visible' && Number(cs.opacity) > 0.5,
        canvasOpacity: host ? Number(getComputedStyle(host).opacity) : null,
        bootVisible: !!document.querySelector('.boot'),
        commands: [...document.querySelectorAll('.shell__entry > .tty__cmd')].map(p => (p.textContent ?? '').split('$').pop()!.trim()),
        input: (document.getElementById('shell-input') as HTMLInputElement | null)?.value ?? null,
        focused: document.activeElement?.id ?? '',
        current: document.querySelector('.site-nav a[aria-current="true"]')?.getAttribute('href') ?? null,
        scrollY: Math.round(window.scrollY),
        maxScroll: document.documentElement.scrollHeight - window.innerHeight
      };
    });
  }

  /** Is anything on screen? False is the black screen: no shell, and the
   *  room's canvas hidden or gone, with no login overlay either. */
  async somethingOnScreen(): Promise<boolean> {
    const s = await this.state();
    if (s.render !== '3d') return true;
    return s.shellVisible || s.bootVisible || (s.canvasOpacity ?? 0) > 0.5 || s.portal !== 'in';
  }
}

export const test = base.extend<{ site: Site; guard: Guard; boot: boolean; webgl: boolean; githubMock: void; noWebgl: void }>({
  boot: [false, { option: true }],
  /** false: the page cannot create a WebGL context (the no-WebGL projects). */
  webgl: [true, { option: true }],

  noWebgl: [
    async ({ page, webgl }, use) => {
      if (!webgl) {
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
            if (/webgl/i.test(type)) return null;
            return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
          } as typeof HTMLCanvasElement.prototype.getContext;
        });
      }
      await use();
    },
    { auto: true }
  ],

  guard: [
    async ({ page }, use, testInfo) => {
      const allowed: RegExp[] = [];
      const seen: string[] = [];
      const note = (line: string): void => {
        if (!BROWSER_NOISE.some(re => re.test(line)) && !allowed.some(re => re.test(line))) seen.push(line);
      };
      await page.addInitScript(() => {
        const w = window as unknown as { __csp: string[] };
        w.__csp = [];
        window.addEventListener('securitypolicyviolation', e =>
          w.__csp.push(`csp ${e.effectiveDirective}: ${e.blockedURI}`)
        );
      });
      page.on('console', msg => {
        if (msg.type() !== 'debug') note(`console.${msg.type()}: ${msg.text()}`);
      });
      page.on('pageerror', err => note(`uncaught: ${err.message}`));
      page.on('requestfailed', req => {
        const why = req.failure()?.errorText ?? '';
        // navigating away aborts requests in flight; not a fault
        if (!/abort|cancel/i.test(why)) note(`request failed: ${req.url()} (${why})`);
      });
      await use({ allow: re => allowed.push(re) });
      const csp = await page
        .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
        .catch(() => [] as string[]);
      for (const line of csp) note(line);
      // A browser with no WebGL here (Firefox in a GPU-less container) says
      // so itself when the page probes for it; the page then steps down, as
      // designed. Those lines are the environment's, and only then excused.
      const reason = await page.evaluate(() => document.documentElement.dataset['tierReason'] ?? '').catch(() => '');
      if (reason === 'no-webgl' || reason === 'webgl-fail') {
        const env = /WebGL|THREE\.WebGLRenderer/;
        for (let i = seen.length - 1; i >= 0; i--) if (env.test(seen[i])) seen.splice(i, 1);
      }
      if (seen.length && testInfo.status === testInfo.expectedStatus) {
        expect(seen, 'the console, CSP and network must stay clean').toEqual([]);
      }
    },
    { auto: true }
  ],

  githubMock: [
    async ({ page }, use) => {
      await page.route('https://api.github.com/**', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REPOS) })
      );
      await use();
    },
    { auto: true }
  ],

  site: async ({ page, boot }, use) => {
    if (!boot) {
      await page.addInitScript(() => {
        try {
          sessionStorage.setItem('tty-booted', '1');
        } catch {
          // storage blocked: the login may play; tests that care opt in
        }
      });
    }
    await use(new Site(page));
  }
});

export { expect };
