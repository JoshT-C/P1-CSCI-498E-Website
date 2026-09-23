/** The room's stations: panels, deep links, the floppy shelf, the keyboard. */
import { test, expect } from './support';

const STATIONS = [
  { id: 'rack', title: 'Homelab' },
  { id: 'floppies', title: 'Projects not on GitHub' },
  { id: 'whiteboard', title: 'Architecture' },
  { id: 'laptop', title: 'Laptop' }
];

test.describe('stations (3D)', () => {
  test.beforeEach(async ({ site }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
  });

  for (const { id, title } of STATIONS) {
    test(`${id}: opens its panel and link, and Esc returns to the room`, async ({ site, page }) => {
      await page.locator('.station-link', { hasText: id }).click();
      const panel = page.locator('dialog.station-panel');
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('heading', { level: 2 })).toHaveText(title);
      await expect(page).toHaveURL(new RegExp(`#${id}`));
      expect((await site.state()).station).toBe(id);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      // Chromium fires the dialog's close event a task after it hides
      await expect.poll(async () => (await site.state()).station).toBeNull();
      await expect.poll(() => new URL(page.url()).hash).toBe('');
    });
  }

  test('the back-to-room button closes the panel', async ({ site, page }) => {
    await page.locator('.station-link', { hasText: 'rack' }).click();
    await page.getByRole('button', { name: 'Back to the room' }).click();
    await expect(page.locator('dialog.station-panel')).toBeHidden();
    expect((await site.state()).station).toBeNull();
  });

  test('the page cannot scroll under an open panel', async ({ site, page }) => {
    await page.locator('.station-link', { hasText: 'whiteboard' }).click();
    await expect(page.locator('dialog.station-panel')).toBeVisible();
    const before = (await site.state()).scrollY;
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(400);
    expect((await site.state()).scrollY).toBe(before);
  });

  test('keyboard: a station opens on Enter, focus starts on the way back, Esc returns', async ({ page }) => {
    await page.locator('.station-link', { hasText: 'laptop' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Back to the room' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.station-panel')).toBeHidden();
  });

  test('the disk buttons are laid out as the shelf: back row first', async ({ page }) => {
    await page.locator('.station-link', { hasText: 'floppies' }).click();
    await expect(page.locator('.floppy-chip')).toHaveCount(6);
    const chips = (await page.locator('.floppy-chip').allTextContents()).map(t => t.trim());
    expect(chips).toEqual(['bench', 'laptop-stack', 'previous-site', 'ai-stack', 'claude-local', 'delegation']);
  });

  test('picking a disk shows it and puts it in the link', async ({ page }) => {
    await page.locator('.station-link', { hasText: 'floppies' }).click();
    await page.locator('.floppy-chip', { hasText: 'bench' }).click();
    await expect(page.locator('.floppy-chip', { hasText: 'bench' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.floppy-detail__title')).toHaveText('Benchmark method');
    await expect(page).toHaveURL(/#floppies\/bench$/);
  });
});

test.describe('station deep links (3D)', () => {
  test('#rack opens the rack', async ({ site, page }) => {
    await site.open({ tier: 'room', hash: 'rack' });
    await site.require3d();
    await expect(page.locator('dialog.station-panel').getByRole('heading', { level: 2 })).toHaveText('Homelab');
  });

  test('#floppies/<id> opens on that disk; an unknown disk falls back to the first', async ({ site, page }) => {
    await site.open({ tier: 'room', hash: 'floppies/delegation' });
    await site.require3d();
    await expect(page.locator('.floppy-chip', { hasText: 'delegation' })).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => {
      location.hash = 'floppies/no-such-disk';
    });
    await expect(page.locator('.floppy-chip', { hasText: 'ai-stack' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('an unknown hash is ignored', async ({ site, page }) => {
    await site.open({ tier: 'room', hash: 'not-a-station' });
    await site.require3d();
    await expect(page.locator('dialog.station-panel')).toBeHidden();
    expect((await site.state()).station).toBeNull();
  });
});

test.describe('stations (flat)', () => {
  test('panels work without the room too', async ({ site, page }) => {
    await site.open({ tier: 'css' });
    await page.locator('.station-link', { hasText: 'rack' }).click();
    await expect(page.locator('dialog.station-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.station-panel')).toBeHidden();
  });
});
