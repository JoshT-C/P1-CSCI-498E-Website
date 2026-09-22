/**
 * The lines the terminal screen types for each section.
 *
 * `work` and `stack` are composed from the same content constants the page
 * renders (CURATED_PROJECTS / STACK), so the screen can never drift from the
 * page; everything else is the hand-written TERMINAL copy. All of it is
 * secret-scanned via content/projects.spec.ts.
 *
 * Keep every line to 36 columns or fewer: the screen-text machine will
 * truncate longer ones, but the copy should fit on its own (the spec
 * enforces this).
 */
import {
  CURATED_PROJECTS,
  STACK,
  TERMINAL,
  TERMINAL_PROMPT,
  type TerminalLine
} from '../app/services/content/projects';

/** The five sections the screen mirrors, in page order. */
export type ScreenSection = 'hero' | 'work' | 'stack' | 'about' | 'contact';

/** Column budget shared by the DOM card and the 3D screen. */
export const SCREEN_MAX_COLS = 36;

export function buildScreenLines(
  section: ScreenSection,
  workTitles: readonly string[] = []
): readonly TerminalLine[] {
  switch (section) {
    case 'hero':
      return TERMINAL.hero;
    case 'about':
      return TERMINAL.about;
    case 'contact':
      return TERMINAL.contact;
    case 'work': {
      // Before the GitHub fetch resolves there are no titles yet — the
      // curated entries stand in so the screen is never empty.
      const titles =
        workTitles.length > 0 ? workTitles : CURATED_PROJECTS.map(p => p.title);
      return [
        { prompt: TERMINAL_PROMPT, text: 'ls ~/projects' },
        ...titles.map(title => ({ text: title }))
      ];
    }
    case 'stack':
      return [
        { prompt: TERMINAL_PROMPT, text: 'ai list' },
        ...STACK.models.map(m => ({
          text: `${m.name.padEnd(19)}  ${m.speed}`
        }))
      ];
  }
}
