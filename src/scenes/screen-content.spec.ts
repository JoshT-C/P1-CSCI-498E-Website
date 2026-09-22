import {
  CURATED_PROJECTS,
  STACK,
  TERMINAL,
  TERMINAL_PROMPT
} from '../app/services/content/projects';
import {
  SCREEN_MAX_COLS,
  buildScreenLines,
  type ScreenSection
} from './screen-content';

const SECTIONS: readonly ScreenSection[] = [
  'hero',
  'work',
  'stack',
  'about',
  'contact'
];

describe('screen-content', () => {
  it('returns the TERMINAL copy verbatim for the static sections', () => {
    expect(buildScreenLines('hero')).toEqual(TERMINAL.hero);
    expect(buildScreenLines('about')).toEqual(TERMINAL.about);
    expect(buildScreenLines('contact')).toEqual(TERMINAL.contact);
  });

  it('composes the work screen from the given project titles', () => {
    const lines = buildScreenLines('work', ['alpha', 'beta']);
    expect(lines).toEqual([
      { prompt: TERMINAL_PROMPT, text: 'ls ~/projects' },
      { text: 'alpha' },
      { text: 'beta' }
    ]);
  });

  it('falls back to the curated titles before the fetch resolves', () => {
    const lines = buildScreenLines('work');
    expect(lines).toHaveLength(CURATED_PROJECTS.length + 1);
    expect(lines[1]).toEqual({ text: CURATED_PROJECTS[0].title });
    expect(lines[2]).toEqual({ text: CURATED_PROJECTS[1].title });
  });

  it('composes the stack screen from the measured model rows', () => {
    const lines = buildScreenLines('stack');
    expect(lines[0]).toEqual({ prompt: TERMINAL_PROMPT, text: 'ai list' });
    expect(lines).toHaveLength(STACK.models.length + 1);
    STACK.models.forEach((m, i) => {
      expect(lines[i + 1].text).toContain(m.name);
      expect(lines[i + 1].text).toContain(m.speed);
    });
  });

  it('keeps every line of every section within the column budget', () => {
    for (const section of SECTIONS) {
      // a title at the full budget must still fit
      const lines = buildScreenLines(section, ['x'.repeat(SCREEN_MAX_COLS)]);
      for (const line of lines) {
        const width = (line.prompt ?? '').length + line.text.length;
        expect(width).toBeLessThanOrEqual(SCREEN_MAX_COLS);
      }
    }
  });

  it('always starts with a prompt command line', () => {
    for (const section of SECTIONS) {
      const first = buildScreenLines(section)[0];
      expect(first.prompt).toBe(TERMINAL_PROMPT);
      expect(first.text.length).toBeGreaterThan(0);
    }
  });
});
