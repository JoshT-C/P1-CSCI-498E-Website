/**
 * The shell: commands, their output, and the prompt's keys. Most tests run
 * on the flat page (the shell is the same component there, and loads
 * faster); the 3D group covers going through the glass and back.
 */
import { test, expect, EMAIL } from './support';

test.describe('shell commands', () => {
  test.beforeEach(async ({ site }) => {
    await site.open({ tier: 'css' });
    await site.enterShell();
  });

  test('starts at help, listing every command as a button', async ({ site, page }) => {
    expect((await site.state()).commands).toEqual(['help']);
    const names = await page.locator('.shell__help .shell__cmd').allTextContents();
    expect(names.map(n => n.trim())).toEqual(['projects', 'ai-stack', 'about', 'contact', 'whoami', 'help', 'clear', 'exit']);
  });

  test('projects: the curated work, then the GitHub repos without forks or hidden ones', async ({ site }) => {
    await site.run('projects');
    const out = site.lastEntry();
    await expect(out.locator('.tty__ls li')).toHaveCount(2);
    await expect(out.locator('.tty__repos')).toContainText('minecraft-at-mines-panel');
    await expect(out.locator('.tty__repos')).not.toContainText('a-fork');
    await expect(out.locator('.tty__repos')).not.toContainText('JoshT-C.github.io');
    await expect(out).toContainText('2 repositories');
  });

  test('ai-stack: all four backends, one of them loaded', async ({ site }) => {
    await site.run('ai-stack');
    const rows = site.lastEntry().locator('tbody tr:not(.tty__desc)');
    await expect(rows).toHaveCount(4);
    await expect(site.lastEntry().locator('tr[aria-current="true"]')).toHaveCount(1);
  });

  test('about and whoami', async ({ site }) => {
    await site.run('about');
    await expect(site.lastEntry()).toContainText('Colorado School of Mines');
    await expect(site.lastEntry()).toContainText('700 members');
    await site.run('whoami');
    await expect(site.lastEntry()).toContainText('any / all');
  });

  test('contact: the email as a mailto link, and GitHub', async ({ site }) => {
    await site.run('contact');
    await expect(site.lastEntry().locator(`a[href="mailto:${EMAIL}"]`)).toBeVisible();
    await expect(site.lastEntry().locator('a[href="https://github.com/JoshT-C"]')).toBeVisible();
  });

  test('aliases, case and spacing', async ({ site }) => {
    await site.run('ls');
    await expect(site.lastEntry().locator('.tty__ls')).toBeVisible();
    await site.run('  MODELS  ');
    await expect(site.lastEntry().locator('tbody')).toBeVisible();
    await site.run('cat   about.txt');
    await expect(site.lastEntry()).toContainText('Colorado School of Mines');
  });

  test('an unknown command says so, and offers help', async ({ site, page }) => {
    await site.run('rm -rf /');
    await expect(site.lastEntry().locator('.tty__err')).toHaveText('rm -rf /: command not found.');
    await site.lastEntry().getByRole('button', { name: 'help' }).click();
    await expect(page.locator('#shell-input')).toHaveValue('help');
  });

  test('an empty line prints a bare prompt, as a terminal does', async ({ site, page }) => {
    await page.locator('#shell-input').press('Enter');
    await expect.poll(async () => (await site.state()).commands).toEqual(['help', '']);
  });

  test('clicking a command in help fills the prompt without running it; Enter runs it', async ({ site, page }) => {
    await page.locator('.shell__help .shell__cmd', { hasText: 'contact' }).click();
    await expect(page.locator('#shell-input')).toHaveValue('contact');
    await expect(page.locator('#shell-input')).toBeFocused();
    expect((await site.state()).commands).toEqual(['help']);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await site.state()).commands).toEqual(['help', 'contact']);
  });

  test('Tab finishes a unique command name and leaves an ambiguous one', async ({ page }) => {
    const input = page.locator('#shell-input');
    await input.fill('pro');
    await input.press('Tab');
    await expect(input).toHaveValue('projects');
    await input.fill('a'); // about, ai-stack
    await input.press('Tab');
    await expect(input).toHaveValue('a');
    await expect(input).toBeFocused();
  });

  test('the arrows recall earlier commands', async ({ site, page }) => {
    await site.run('about');
    await site.run('contact');
    const input = page.locator('#shell-input');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('contact');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('about');
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    await expect(input).toHaveValue('');
  });

  test('clear and Ctrl+L empty the screen', async ({ site, page }) => {
    await site.run('about');
    await site.run('clear');
    await expect.poll(async () => (await site.state()).commands).toEqual([]);
    await site.run('contact');
    await page.locator('#shell-input').press('Control+l');
    await expect.poll(async () => (await site.state()).commands).toEqual([]);
  });

  test('typing anywhere on the screen lands on the prompt', async ({ page }) => {
    await page.locator('#shell-input').blur();
    await page.keyboard.type('abo');
    await expect(page.locator('#shell-input')).toHaveValue('abo');
    await expect(page.locator('#shell-input')).toBeFocused();
  });

  test('the header marks the section of the last command', async ({ site }) => {
    await site.run('ai-stack');
    await expect.poll(async () => (await site.state()).current).toBe('#stack');
    await site.run('about');
    await expect.poll(async () => (await site.state()).current).toBe('#about');
  });

  test('a new command scrolls the log so its prompt line is at the top', async ({ site, page }) => {
    await site.run('projects');
    await site.run('ai-stack');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const log = document.querySelector('.shell__log')!;
          const entry = [...document.querySelectorAll('.shell__entry')].pop()!;
          return Math.abs(entry.getBoundingClientRect().top - log.getBoundingClientRect().top);
        })
      )
      .toBeLessThan(40);
  });

  test('clicking the log puts the caret back on the prompt', async ({ site, page }) => {
    await site.run('about');
    await page.locator('#shell-input').blur();
    await site.lastEntry().locator('p').nth(1).click();
    await expect(page.locator('#shell-input')).toBeFocused();
  });
});

test.describe('shell through the glass (3D)', () => {
  test('the end of the page is the shell: prompt focused, nothing below it', async ({ site, page }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
    await site.enterShell();
    const s = await site.state();
    expect(s.portal).toBe('in');
    expect(s.scrollY).toBe(s.maxScroll);
    await expect(page.locator('#shell-input')).toBeFocused();
    const bottom = await page.evaluate(() => Math.round(document.getElementById('shell')!.getBoundingClientRect().bottom));
    expect(Math.abs(bottom - page.viewportSize()!.height)).toBeLessThanOrEqual(1);
  });

  test('exit walks back out to the room and lets go of the keyboard', async ({ site }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
    await site.enterShell();
    await site.run('exit');
    await expect.poll(async () => (await site.state()).portal, { timeout: 15_000 }).toBe('out');
    await expect.poll(async () => (await site.state()).scrollY, { timeout: 15_000 }).toBe(0);
    expect((await site.state()).focused).not.toBe('shell-input');
  });

  test('scrolling up from the top of the log leaves the glass', async ({ site, page, browserName }) => {
    test.skip(browserName === 'webkit', "Playwright's Linux WebKit does not scroll the page on synthetic wheel events at all");
    await site.open({ tier: 'room' });
    await site.require3d();
    await site.enterShell();
    await page.mouse.move(700, 400);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await site.state()).portal).toBe('out');
  });
});

test.describe('the one-time login', () => {
  test.use({ boot: true });

  test('plays the first time through the glass, and not again this session', async ({ site, page }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
    await site.enterShell();
    await expect(page.locator('.boot')).toBeVisible();
    await expect(page.locator('.boot')).toHaveCount(0, { timeout: 10_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await site.state()).portal).toBe('out');
    await site.enterShell();
    await page.waitForTimeout(500);
    await expect(page.locator('.boot')).toHaveCount(0);
  });

  test('any key skips it', async ({ site, page }) => {
    await site.open({ tier: 'room' });
    await site.require3d();
    await site.enterShell();
    await expect(page.locator('.boot')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.boot')).toHaveCount(0, { timeout: 2_000 });
  });

  test('never plays under reduced motion', async ({ site, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await site.open();
    await site.enterShell();
    await page.waitForTimeout(800);
    await expect(page.locator('.boot')).toHaveCount(0);
  });
});
