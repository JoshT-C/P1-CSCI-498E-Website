/**
 * A pure typed-terminal state machine.
 *
 * No DOM, no three, no clock source — the caller advances it with tick(dtMs)
 * and reads the result. The same machine drives the 3D screen texture
 * (bootstrap) and the DOM terminal card (hero) so both render identical
 * output from the same line queues.
 *
 * Model: each section is a queue of display lines. Lines type out at a
 * fixed character rate with a short pause before each line after the first.
 * Switching sections interrupts and clears the queue. Output is hard-wrapped
 * and truncated to maxCols/maxLines so the screen can never overflow.
 */

/** One line of input: optional prompt (accent-colored) + output text. */
export interface ScreenLine {
  readonly prompt?: string;
  readonly text: string;
}

/** One line as rendered: the typed-so-far portions. */
export interface ScreenLineState {
  /** The typed portion of the prompt (accent color). */
  readonly prompt: string;
  /** The typed portion of the output text (ink color). */
  readonly text: string;
}

export interface ScreenSnapshot {
  /** Rendered lines in order; the last may be partial. */
  readonly lines: readonly ScreenLineState[];
  /** Index into `lines` where the block caret sits. */
  readonly caretLine: number;
  /** Caret blink phase (always true in static mode). */
  readonly caretVisible: boolean;
  /** True once the queue is fully typed and the caret rests on the last line. */
  readonly idle: boolean;
  /** Monotonic counter, bumped on every visible change. */
  readonly version: number;
}

export interface ScreenTextOptions {
  /** Hard cap on rendered lines; longer queues truncate with a trailing '…' line. */
  readonly maxLines: number;
  /** Hard cap on columns per line (prompt + text combined). */
  readonly maxCols: number;
  /** Typing speed, characters per second. */
  readonly charsPerSecond: number;
  /** Pause before each line after the first, in ms. */
  readonly linePauseMs: number;
  /** Caret blink period; the caret is visible for the first half. Default 1000 ms. */
  readonly caretPeriodMs?: number;
  /** Reduced-motion mode: full frame on first tick, caret frozen on. */
  readonly static?: boolean;
}

export interface Terminal {
  /**
   * Switch the screen. A repeat of the same section+content is a no-op;
   * otherwise the queue is cleared and the new one starts typing from the
   * top (fresh prompt, guaranteed fit).
   */
  setSection(section: string, lines: readonly ScreenLine[]): void;
  /** Advance the clock; returns a snapshot when something visible changed, else null. */
  tick(dtMs: number): ScreenSnapshot | null;
  /** The current state, always a fresh object. */
  snapshot(): ScreenSnapshot;
}

interface DisplayLine {
  /** Portion rendered in the accent color (the prompt). */
  readonly accent: string;
  /** Portion rendered in ink (the output). */
  readonly plain: string;
}

const DEFAULT_CARET_PERIOD_MS = 1000;
/** Defensive clamp so one stalled frame cannot type an unbounded burst. */
const MAX_TICK_MS = 1000;

function buildQueue(
  lines: readonly ScreenLine[],
  maxLines: number,
  maxCols: number
): DisplayLine[] {
  const queue: DisplayLine[] = [];
  for (const line of lines) {
    const accent = line.prompt ?? '';
    const plain = accent ? accent + ' ' + line.text : line.text;
    const accentLen = accent.length;
    let start = 0;
    while (start < plain.length) {
      const end = Math.min(start + maxCols, plain.length);
      const chunk = plain.slice(start, end);
      const split = Math.min(end, accentLen) - start;
      queue.push({
        accent: split > 0 ? chunk.slice(0, split) : '',
        plain: split > 0 ? chunk.slice(split) : chunk
      });
      start = end;
    }
  }
  if (queue.length > maxLines) {
    queue.length = maxLines - 1;
    queue.push({ accent: '', plain: '…' });
  }
  return queue;
}

export function createTerminal(options: ScreenTextOptions): Terminal {
  const maxLines = Math.max(1, Math.floor(options.maxLines));
  const maxCols = Math.max(1, Math.floor(options.maxCols));
  const cps = Math.max(1, options.charsPerSecond);
  const linePauseMs = Math.max(0, options.linePauseMs);
  const caretPeriodMs = Math.max(20, options.caretPeriodMs ?? DEFAULT_CARET_PERIOD_MS);
  const isStatic = options.static === true;

  const st = {
    queue: [] as DisplayLine[],
    lineIdx: 0, // line currently typing; === queue.length when idle
    charCount: 0,
    acc: 0,
    pauseUntil: 0,
    clock: 0,
    key: null as string | null,
    version: 0,
    started: false,
    caretVisible: true,
    needsEmit: false
  };

  function snapshot(): ScreenSnapshot {
    const lines: ScreenLineState[] = [];
    for (let i = 0; i < st.queue.length; i++) {
      const d = st.queue[i];
      if (i < st.lineIdx) {
        lines.push({ prompt: d.accent, text: d.plain });
      } else if (i === st.lineIdx) {
        const a = Math.min(st.charCount, d.accent.length);
        const p = Math.min(Math.max(st.charCount - d.accent.length, 0), d.plain.length);
        lines.push({ prompt: d.accent.slice(0, a), text: d.plain.slice(0, p) });
      } else {
        break;
      }
    }
    const caretLine =
      st.queue.length === 0 ? 0 : Math.min(st.lineIdx, st.queue.length - 1);
    return {
      lines,
      caretLine,
      caretVisible: st.caretVisible,
      idle: st.lineIdx >= st.queue.length,
      version: st.version
    };
  }

  return {
    setSection(section, lines) {
      const key =
        section +
        '\u0000' +
        lines.map(l => (l.prompt ?? '') + '\u0001' + l.text).join('\u0001');
      if (st.started && key === st.key) return;

      st.key = key;
      st.queue = buildQueue(lines, maxLines, maxCols);
      st.lineIdx = isStatic ? st.queue.length : 0;
      st.charCount = 0;
      st.acc = 0;
      st.pauseUntil = 0; // the command line types immediately
      st.clock = 0;
      st.caretVisible = true;
      st.started = true;
      st.needsEmit = true;
      st.version += 1;
    },

    tick(dtMs) {
      if (!st.started) return null;
      let dt = dtMs;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      else if (dt > MAX_TICK_MS) dt = MAX_TICK_MS;
      st.clock += dt;

      let changed = st.needsEmit;
      st.needsEmit = false;

      if (!isStatic) {
        const visible = st.clock % caretPeriodMs < caretPeriodMs / 2;
        if (visible !== st.caretVisible) {
          st.caretVisible = visible;
          changed = true;
        }
      }

      if (st.lineIdx < st.queue.length && st.clock >= st.pauseUntil) {
        st.acc += (dt * cps) / 1000;
        const line = st.queue[st.lineIdx];
        const lineTotal = line.accent.length + line.plain.length;
        while (st.acc >= 1 && st.charCount < lineTotal) {
          st.charCount += 1;
          st.acc -= 1;
          changed = true;
        }
        if (st.charCount >= lineTotal) {
          st.lineIdx += 1;
          st.charCount = 0;
          st.acc = 0;
          if (st.lineIdx < st.queue.length) st.pauseUntil = st.clock + linePauseMs;
          changed = true; // the caret moved down a line
        }
      }

      if (!changed) return null;
      st.version += 1;
      return snapshot();
    },

    snapshot
  };
}
