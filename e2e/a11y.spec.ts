/** Structure, names and keyboard paths; and the phone layout (@phone). */
import { test, expect } from './support';

test.describe('accessibility', () => {
  test('landmarks, one h1, and a working skip link', async ({ site, page, browserName }) => {
    await site.open({ tier: 'css' });
    // Safari on macOS tabs to links only with Option held (its default)
    const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.keyboard.press(tab);
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('the shell: a named prompt, a live log, a labelled region', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await expect(page.getByRole('textbox', { name: 'guest@t-c:~$' })).toBeAttached();
    await expect(page.getByRole('log')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByRole('region', { name: 'Terminal session' })).toBeAttached();
  });

  test('every button and link has a name', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await site.enterShell();
    await site.run('projects');
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('a, button')]
        .filter(el => !(el as HTMLElement).innerText.trim() && !el.getAttribute('aria-label'))
        .map(el => el.outerHTML.slice(0, 80))
    );
    expect(unnamed).toEqual([]);
  });

  test('a station panel is a named modal dialog', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await page.locator('.station-link', { hasText: 'rack' }).click();
    const dialog = page.getByRole('dialog', { name: 'Homelab' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.station-link', { hasText: 'rack' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keyboard only: from the station list into the shell and back out', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await page.locator('.station-link', { hasText: 'terminal' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#shell')).toBeInViewport();
    await page.locator('#shell-input').focus();
    await page.keyboard.type('about');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await site.state()).commands.at(-1)).toBe('about');
  });
});

test.describe('phone', () => {
  test('@phone the header fits: four links on screen, nothing scrolls sideways', async ({ site, page }) => {
    await site.open();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      links: [...document.querySelectorAll('.site-nav a')].map(a => {
        const b = a.getBoundingClientRect();
        return b.left >= 0 && b.right <= window.innerWidth;
      })
    }));
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(layout.links).toEqual([true, true, true, true]);
  });

  test('@phone the shell is reachable and usable', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await page.locator('.site-nav a[href="#contact"]').click();
    await expect.poll(async () => (await site.state()).commands.at(-1)).toBe('contact');
    await expect(page.locator('#shell-input')).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('@phone a station panel fits the screen', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await page.locator('.station-link', { hasText: 'floppies' }).click();
    const vw = page.viewportSize()!.width;
    // measured once the panel has finished sliding in
    await expect
      .poll(async () => {
        const box = await page.locator('dialog.station-panel').boundingBox();
        return !!box && box.x >= 0 && box.x + box.width <= vw + 1;
      })
      .toBe(true);
  });
});
