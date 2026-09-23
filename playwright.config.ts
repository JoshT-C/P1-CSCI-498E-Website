import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * End-to-end suite (e2e/). Runs the production build.
 *
 *   npm run e2e                         Firefox, against dist/ served locally
 *   E2E_BROWSERS=chromium,firefox,webkit  more engines; `edge` runs Chromium
 *                                       as Microsoft Edge (CI: all three on
 *                                       Linux, WebKit/Safari on macOS, Edge
 *                                       and Firefox on Windows)
 *   E2E_XVFB=1                          Firefox headed, for `xvfb-run`: headless
 *                                       Firefox gets no WebGL without a GPU,
 *                                       headed on Xvfb it renders on llvmpipe
 *   E2E_TIME_SCALE=3                    stretch every time limit (default 1,
 *                                       2 on CI) for a slower machine
 *   E2E_BASE_URL=http://127.0.0.1:8080  an already-running server, e.g. the
 *   E2E_NGINX=1                         nginx container; enables the header
 *                                       checks in security.spec.ts
 *
 * Each engine runs three projects: desktop with WebGL, desktop without it
 * (the fallback path: tests that need the room skip there, the rest must
 * pass on the flat page), and phone (tests tagged @phone only).
 * `npm run build` first when serving dist/.
 */
const external = process.env['E2E_BASE_URL'];
/** Slower machines and CI's software rendering: every limit scales (the
 *  same factor as t() in e2e/support.ts). */
const scale = Number(process.env['E2E_TIME_SCALE'] ?? (process.env['CI'] ? 2 : 1));
const port = 4400;
const engines = (process.env['E2E_BROWSERS'] ?? 'firefox').split(',').map(s => s.trim());

const engine = {
  firefox: {
    browserName: 'firefox' as const,
    launchOptions: {
      headless: !process.env['E2E_XVFB'],
      // Firefox keeps WebGL off on a software renderer unless told otherwise
      firefoxUserPrefs: { 'webgl.force-enabled': true }
    }
  },
  chromium: {
    browserName: 'chromium' as const,
    // software WebGL on GPU-less runners
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  edge: {
    browserName: 'chromium' as const,
    channel: 'msedge',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webkit: {
    browserName: 'webkit' as const,
    launchOptions: {}
  }
};

/** Phone emulation per engine: Firefox has no mobile mode; WebKit poses as
 *  an iPhone, Chromium and Edge as an Android phone. */
const PHONE_UA: Record<string, string | undefined> = {
  chromium: devices['Pixel 7'].userAgent,
  edge: devices['Pixel 7'].userAgent,
  webkit: devices['iPhone 14'].userAgent
};

/** WebGL switched off at the browser level where the engine allows it
 *  (the `webgl: false` fixture also blocks it in the page, for WebKit). */
const NO_WEBGL: Record<string, object> = {
  firefox: { firefoxUserPrefs: { 'webgl.disabled': true } },
  chromium: { args: ['--disable-webgl', '--disable-3d-apis'] },
  edge: { args: ['--disable-webgl', '--disable-3d-apis'] },
  webkit: {}
};

/** The suite's own option (e2e/support.ts). */
interface SuiteOptions {
  webgl: boolean;
}

const projects: Project<SuiteOptions>[] = engines.flatMap(name => {
  const e = engine[name as keyof typeof engine];
  if (!e) throw new Error(`E2E_BROWSERS: unknown engine '${name}'`);
  return [
    {
      name: `desktop-${name}`,
      grepInvert: /@phone/,
      use: { ...e, viewport: { width: 1440, height: 900 } }
    },
    {
      name: `desktop-${name}-nowebgl`,
      grepInvert: /@phone/,
      use: {
        ...e,
        launchOptions: { ...e.launchOptions, ...NO_WEBGL[name] },
        viewport: { width: 1440, height: 900 },
        webgl: false
      }
    },
    {
      name: `phone-${name}`,
      grep: /@phone/,
      use: {
        ...e,
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: name !== 'firefox',
        deviceScaleFactor: 2,
        userAgent: PHONE_UA[name]
      }
    }
  ];
});

export default defineConfig<SuiteOptions>({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : 3,
  timeout: 60_000 * scale,
  expect: { timeout: 10_000 * scale },
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: external
    ? undefined
    : {
        command: `node scripts/serve-dist.mjs ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env['CI']
      },
  projects
});
