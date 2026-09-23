import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * End-to-end suite (e2e/). Runs the production build.
 *
 *   npm run e2e                         Firefox, against dist/ served locally
 *   E2E_BROWSERS=chromium,firefox       both engines (CI runs both)
 *   E2E_BASE_URL=http://127.0.0.1:8080  an already-running server, e.g. the
 *   E2E_NGINX=1                         nginx container; enables the header
 *                                       checks in security.spec.ts
 *
 * Tests tagged @phone run only in the phone projects; the rest run on
 * desktop. `npm run build` first when serving dist/.
 */
const external = process.env['E2E_BASE_URL'];
const port = 4400;
const engines = (process.env['E2E_BROWSERS'] ?? 'firefox').split(',').map(s => s.trim());

const engine = {
  firefox: {
    browserName: 'firefox' as const,
    // headless Firefox keeps WebGL off without a GPU unless told otherwise
    launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true } }
  },
  chromium: {
    browserName: 'chromium' as const,
    // software WebGL on GPU-less runners
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  }
};

const projects: Project[] = engines.flatMap(name => {
  const e = engine[name as keyof typeof engine];
  if (!e) throw new Error(`E2E_BROWSERS: unknown engine '${name}'`);
  return [
    {
      name: `desktop-${name}`,
      grepInvert: /@phone/,
      use: { ...e, viewport: { width: 1440, height: 900 } }
    },
    {
      name: `phone-${name}`,
      grep: /@phone/,
      use: {
        ...e,
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        // Firefox has no mobile emulation mode
        isMobile: name === 'chromium',
        deviceScaleFactor: 2,
        userAgent: name === 'chromium' ? devices['Pixel 7'].userAgent : undefined
      }
    }
  ];
});

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
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
