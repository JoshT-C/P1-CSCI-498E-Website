/**
 * Getting into the shell: header links, section deep links, links inside
 * output and panels, the terminal station, and the way back out.
 */
import { test, expect, t } from './support';

const LINKS = [
  { href: '#work', command: 'projects' },
  { href: '#stack', command: 'ai-stack' },
  { href: '#about', command: 'about' },
  { href: '#contact', command: 'contact' }
];

test.describe('header links', () => {
  for (const { href, command } of LINKS) {
    test(`3D, from the room: ${href} dives in and runs ${command}`, async ({ site, page }) => {
      await site.open({ tier: 'room' });
      await site.require3d();
      await page.locator(`.site-nav a[href="${href}"]`).click();
      await expect.poll(async () => (await site.state()).commands.at(-1), { timeout: t(15_000) }).toBe(command);
      await site.shellShown();
      const s = await site.state();
      expect(s.portal).toBe('in');
      expect(s.current).toBe(href);
    });
  }

  test('flat: a header link scrolls to the shell and runs its command', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await page.locator('.site-nav a[href="#about"]').click();
    await expect.poll(async () => (await site.state()).commands.at(-1)).toBe('about');
    await expect(page.locator('#shell')).toBeInViewport();
  });

  test('inside the shell: a header link runs its command in place', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await site.enterShell();
    await page.locator('.site-nav a[href="#contact"]').click();
    await expect.poll(async () => (await site.state()).commands).toEqual(['help', 'contact']);
  });
});

test.describe('deep links to sections', () => {
  for (const { href, command } of LINKS) {
    test(`${href} opens the page in the shell on ${command}`, async ({ site }) => {
      await site.open({ tier: 'room', hash: href.slice(1) });
      await expect.poll(async () => (await site.state()).commands).toEqual(['help', command]);
      const s = await site.state();
      if (s.render === '3d') await expect.poll(async () => (await site.state()).portal).toBe('in');
      await site.shellShown();
    });
  }
});

test.describe('links inside the site', () => {
  test('the ai-stack README link in projects runs ai-stack', async ({ site }) => {
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects');
    await site.lastEntry().getByRole('link', { name: /ai-stack: the models/ }).click();
    await expect.poll(async () => (await site.state()).commands.at(-1)).toBe('ai-stack');
  });

  test("a floppy panel's section link closes the panel and runs the command", async ({ site, page }) => {
    await site.open({ tier: 'room', hash: 'floppies/ai-stack' });
    await page.locator('.station-panel a.prompt-link').click();
    await expect(page.locator('dialog.station-panel')).toBeHidden();
    await expect.poll(async () => (await site.state()).commands.at(-1), { timeout: t(15_000) }).toBe('ai-stack');
    await site.shellShown();
  });

  test('the terminal station goes through the glass', async ({ site, page }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
    await page.locator('.station-link', { hasText: 'terminal' }).click();
    await expect.poll(async () => (await site.state()).portal, { timeout: t(15_000) }).toBe('in');
    await site.shellShown();
  });

  test('the name in the header returns to the top of the page', async ({ site, page }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
    await site.enterShell();
    await page.locator('.site-header .brand').click();
    await expect.poll(async () => (await site.state()).scrollY, { timeout: t(15_000) }).toBe(0);
    await expect.poll(async () => (await site.state()).portal).toBe('out');
  });

  test('outside links are https and carry rel=noopener', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects');
    const external = page.locator('a[href^="http"]');
    const count = await external.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const link = external.nth(i);
      const href = (await link.getAttribute('href'))!;
      expect(href.startsWith('https://'), href).toBe(true);
      expect(await link.getAttribute('rel'), href).toContain('noopener');
    }
  });
});
