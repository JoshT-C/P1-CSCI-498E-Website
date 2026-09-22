import {
  createTerminal,
  type ScreenLine,
  type Terminal
} from './screen-text';

const LINES: readonly ScreenLine[] = [
  { prompt: 'u@h:~$', text: 'cat /etc/whoami' },
  { text: 'Joshua T-C' },
  { prompt: 'u@h:~$', text: 'echo hi' }
];

function fastTerminal(extra: Partial<Parameters<typeof createTerminal>[0]> = {}): Terminal {
  return createTerminal({
    maxLines: 14,
    maxCols: 40,
    charsPerSecond: 1000, // one char per ms — tests stay fast
    linePauseMs: 100,
    caretPeriodMs: 1000,
    ...extra
  });
}

describe('screen-text', () => {
  it('types the full queue and lands idle on the last line', () => {
    const term = fastTerminal();
    term.setSection('hero', LINES);
    let sawPartial = false;
    for (let i = 0; i < 300; i++) {
      const snap = term.tick(1);
      if (snap && snap.lines.length > 0 && snap.lines.length < 3) sawPartial = true;
    }
    const s = term.snapshot();
    expect(sawPartial).toBe(true);
    // A line with a prompt carries the separating space in its text portion.
    expect(s.lines).toEqual([
      { prompt: 'u@h:~$', text: ' cat /etc/whoami' },
      { prompt: '', text: 'Joshua T-C' },
      { prompt: 'u@h:~$', text: ' echo hi' }
    ]);
    expect(s.caretLine).toBe(2);
    expect(s.caretVisible).toBe(true);
  });

  it('returns null while nothing visible changes', () => {
    const term = fastTerminal({ charsPerSecond: 100, caretPeriodMs: 1000 });
    term.setSection('hero', LINES);
    term.tick(2); // first emit after setSection (needsEmit), no char typed yet
    // 100 cps × 5 ms = 0.5 char, clock still in the first half of the blink
    expect(term.tick(5)).toBeNull();
  });

  it('never emits a line wider than maxCols', () => {
    const long: readonly ScreenLine[] = [
      { prompt: 'u@h:~$', text: 'x'.repeat(200) },
      { text: 'y'.repeat(97) }
    ];
    const term = fastTerminal({ maxCols: 40, maxLines: 14 });
    term.setSection('work', long);
    for (let i = 0; i < 2500; i++) term.tick(1);
    const s = term.snapshot();
    for (const line of s.lines) {
      expect(line.prompt.length + line.text.length).toBeLessThanOrEqual(40);
    }
    // 'u@h:~$ ' + 200 x's = 207 chars → ceil(207/40) = 6 lines; 97 y's → 3 lines
    expect(s.lines.length).toBe(9);
  });

  it('hard-wraps keeping the prompt coloring on the first chunk only', () => {
    const term = fastTerminal({ maxCols: 8, maxLines: 14 });
    term.setSection('x', [{ prompt: 'ab:~$', text: 'cdef' }]);
    for (let i = 0; i < 200; i++) term.tick(1);
    const s = term.snapshot();
    // 'ab:~$ cdef' (10 chars) → 8-col chunks 'ab:~$ cd' + 'ef'
    expect(s.lines).toEqual([
      { prompt: 'ab:~$', text: ' cd' },
      { prompt: '', text: 'ef' }
    ]);
  });

  it('truncates to maxLines with a trailing ellipsis line', () => {
    const many: readonly ScreenLine[] = Array.from({ length: 20 }, (_, i) => ({
      text: `line ${i}`
    }));
    const term = fastTerminal({ maxLines: 4, maxCols: 40 });
    term.setSection('stack', many);
    for (let i = 0; i < 4000; i++) term.tick(1);
    const s = term.snapshot();
    expect(s.lines.length).toBe(4);
    expect(s.lines[3].text).toBe('…');
  });

  it('section switch interrupts and clears the previous queue', () => {
    const term = fastTerminal({ charsPerSecond: 10 });
    term.setSection('hero', LINES);
    for (let i = 0; i < 5; i++) term.tick(1); // a few ms in
    term.setSection('contact', [{ text: 'github.com/JoshT-C' }]);
    const s = term.tick(1);
    expect(s).not.toBeNull();
    expect(s!.lines.length).toBeLessThanOrEqual(1);
    for (const line of s!.lines!) {
      expect(line.text).not.toContain('whoami');
    }
    // 10 cps × 2000 ms = 20 chars ≥ 18
    for (let i = 0; i < 2000; i++) term.tick(1);
    expect(term.snapshot().lines).toEqual([{ prompt: '', text: 'github.com/JoshT-C' }]);
  });

  it('a repeat of the same section+content is a no-op', () => {
    const term = fastTerminal();
    term.setSection('hero', LINES);
    term.tick(1);
    const v = term.snapshot().version;
    term.setSection('hero', LINES);
    const s = term.tick(1);
    if (s) {
      // at most one new change (the next character) advanced the version
      expect(s.version).toBeLessThanOrEqual(v + 1);
    }
    const first = term.snapshot().lines[0];
    expect(first.prompt.length + first.text.length).toBeGreaterThan(0);
  });

  it('static mode renders the full frame on the first tick', () => {
    const term = fastTerminal({ static: true });
    term.setSection('hero', LINES);
    const s = term.tick(0);
    expect(s).not.toBeNull();
    expect(s!.lines).toHaveLength(3);
    expect(s!.lines[2].text).toBe(' echo hi');
    expect(s!.caretVisible).toBe(true);
    // nothing ever changes after that
    expect(term.tick(100)).toBeNull();
    expect(term.tick(600)).toBeNull();
  });

  it('caret blinks on a half-period schedule', () => {
    const term = fastTerminal({ charsPerSecond: 1 });
    term.setSection('hero', LINES);
    term.tick(1); // clock ≈ 0 → on
    expect(term.snapshot().caretVisible).toBe(true);
    // advance just past the half period
    let flipped = false;
    for (let i = 0; i < 600; i++) {
      term.tick(1);
      if (term.snapshot().caretVisible === false) {
        flipped = true;
        break;
      }
    }
    expect(flipped).toBe(true);
  });

  it('pauses between lines before typing the next one', () => {
    const term = fastTerminal({ charsPerSecond: 1000, linePauseMs: 100 });
    term.setSection('hero', LINES);
    // first line is 22 chars; 16 ticks is mid-line
    for (let i = 0; i < 16; i++) term.tick(1);
    expect(term.snapshot().lines.length).toBe(1);
    // 6 more ticks finish line 1 (the caret moves to an empty second line),
    // then a 100 ms pause: 90 more stays inside it — line 2 still empty
    for (let i = 0; i < 90; i++) term.tick(1);
    let s = term.snapshot();
    expect(s.lines.length).toBe(2);
    expect(s.lines[1].prompt + s.lines[1].text).toBe('');
    // after the pause the second line is fully typed (starts at 122, 10 chars)
    for (let i = 0; i < 30; i++) term.tick(1);
    s = term.snapshot();
    expect(s.lines[1].text).toBe('Joshua T-C');
  });

  it('survives NaN, negative, and huge dt values', () => {
    const term = fastTerminal();
    term.setSection('hero', LINES);
    expect(() => {
      term.tick(NaN);
      term.tick(-50);
      term.tick(1e9);
    }).not.toThrow();
    const s = term.snapshot();
    for (const line of s.lines) {
      expect(Number.isFinite(line.text.length + line.prompt.length)).toBe(true);
      expect(line.prompt.length + line.text.length).toBeLessThanOrEqual(40);
    }
  });

  it('handles an empty queue', () => {
    const term = fastTerminal();
    term.setSection('x', []);
    const s = term.tick(1);
    expect(s).not.toBeNull();
    expect(s!.lines).toEqual([]);
    expect(s!.caretLine).toBe(0);
  });
});
