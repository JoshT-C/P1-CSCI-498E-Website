import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import type { SiteSection } from '../config/site.config';
import { SceneSyncService } from './scene-sync.service';

/** A command the shell knows. */
export interface ShellCommand {
  readonly name: CommandName;
  /** What `help` says it does. */
  readonly summary: string;
  /** Other spellings that run it. */
  readonly aliases: readonly string[];
  /** The page section it shows (drives the header and the VT100's screen). */
  readonly section: SiteSection | null;
}

export type CommandName = 'help' | 'projects' | 'ai-stack' | 'about' | 'contact' | 'whoami' | 'clear' | 'exit';

export const COMMANDS: readonly ShellCommand[] = [
  { name: 'projects', summary: 'what I have built, and my GitHub repos', aliases: ['ls', 'work'], section: 'work' },
  { name: 'ai-stack', summary: 'the models I host and how fast they run', aliases: ['stack', 'models', 'ai'], section: 'stack' },
  { name: 'about', summary: 'school, the Minecraft servers, work so far', aliases: ['cat about.txt'], section: 'about' },
  { name: 'contact', summary: 'email and GitHub', aliases: ['finger', 'mail'], section: 'contact' },
  { name: 'whoami', summary: 'name, pronouns, status', aliases: [], section: null },
  { name: 'help', summary: 'this list', aliases: ['?', 'man'], section: null },
  { name: 'clear', summary: 'clear the screen', aliases: ['cls'], section: null },
  { name: 'exit', summary: 'log out and step back into the room', aliases: ['logout', 'quit'], section: 'hero' }
];

/** The command a section's link (#work, #stack, …) runs. */
export const SECTION_COMMAND: Readonly<Record<string, CommandName>> = {
  work: 'projects',
  stack: 'ai-stack',
  about: 'about',
  contact: 'contact'
};

export type Parsed = CommandName | 'unknown' | 'empty';

/** Which command a line of input names: case and extra spaces ignored,
 *  aliases resolved. */
export function parseCommand(raw: string): Parsed {
  const line = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!line) return 'empty';
  const hit = COMMANDS.find(c => c.name === line || c.aliases.includes(line));
  return hit ? hit.name : 'unknown';
}

/** One command and its output in the scrollback. */
export interface Entry {
  readonly id: number;
  readonly input: string;
  readonly command: Parsed;
}

/** Everything the server render prints, so the page's HTML holds every
 *  section for search engines and readers without JavaScript. */
const FULL_SESSION: readonly CommandName[] = ['help', 'projects', 'ai-stack', 'about', 'contact'];

/**
 * The guest session behind the glass: the scrollback, the line being typed
 * and its history. Components render it; this owns what a command does.
 */
@Injectable({ providedIn: 'root' })
export class ShellService {
  private readonly sync = inject(SceneSyncService);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private nextId = 0;
  readonly entries = signal<readonly Entry[]>([]);
  /** The prompt's text. */
  readonly input = signal('');
  /** Bumped to ask the view to focus the prompt. */
  readonly focusRequest = signal(0);
  private readonly history: string[] = [];
  private historyAt = 0;
  private typing = 0;

  constructor() {
    if (!this.isBrowser) {
      for (const name of FULL_SESSION) this.push(name, name);
      return;
    }
    this.push('help', 'help');
    this.document.addEventListener('click', this.onLinkClick);
    // a section link (#about) opens the session on that command
    const hash = this.document.defaultView?.location.hash.replace(/^#/, '') ?? '';
    const deep = SECTION_COMMAND[hash];
    if (deep) this.run(deep, { record: false });
  }

  /** Run a line: add it and its output to the scrollback. */
  run(raw: string, opts: { record?: boolean } = {}): void {
    const command = parseCommand(raw);
    if (opts.record !== false && command !== 'empty') {
      this.history.push(raw.trim());
      this.historyAt = this.history.length;
    }
    this.input.set('');
    if (command === 'clear') {
      this.entries.set([]);
      return;
    }
    this.push(raw.trim(), command);
    const section = COMMANDS.find(c => c.name === command)?.section;
    if (section) this.sync.setActiveSection(section);
    if (command === 'exit') this.leave();
  }

  /** Put a command on the prompt without running it (a click in `help`). */
  fill(name: string): void {
    this.input.set(name);
    this.focusRequest.update(n => n + 1);
  }

  /** Type a command onto the prompt a character at a time, then run it
   *  (the header links). Instant under reduced motion. */
  typeAndRun(name: CommandName): void {
    const w = this.document.defaultView;
    // a beat first: a station panel closing on the same click still holds
    // the page's scroll lock until its effect runs
    w?.setTimeout(() => this.enter(), 50);
    const reduced = w?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? true;
    const id = ++this.typing;
    if (!w || reduced) {
      this.run(name);
      return;
    }
    let i = 0;
    const step = (): void => {
      if (id !== this.typing) return; // a newer command took over
      i++;
      this.input.set(name.slice(0, i));
      if (i < name.length) w.setTimeout(step, 45);
      else w.setTimeout(() => id === this.typing && this.run(name), 160);
    };
    w.setTimeout(step, 250);
  }

  /** Any link to a section (#about: the header, a README, a floppy's
   *  panel) types and runs that section's command instead. Without
   *  JavaScript the href jumps to the server-rendered section. */
  private readonly onLinkClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const link = (event.target as Element | null)?.closest?.('a[href^="#"]');
    const command = link ? SECTION_COMMAND[link.getAttribute('href')!.slice(1)] : undefined;
    if (!command) return;
    event.preventDefault();
    this.typeAndRun(command);
  };

  /** Arrow keys: step through earlier lines. */
  recall(delta: -1 | 1): void {
    if (!this.history.length) return;
    this.historyAt = Math.min(Math.max(this.historyAt + delta, 0), this.history.length);
    this.input.set(this.history[this.historyAt] ?? '');
  }

  /** Tab: finish a command name when the start is unambiguous. */
  complete(): void {
    const start = this.input().trim().toLowerCase();
    if (!start) return;
    const hits = COMMANDS.map(c => c.name).filter(n => n.startsWith(start));
    if (hits.length === 1) this.input.set(hits[0]);
  }

  /** Scroll the page to the session: it ends the page, and in 3D the end
   *  of the page is the camera through the glass. */
  enter(): void {
    const w = this.document.defaultView;
    const reduced = w?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? true;
    w?.scrollTo({ top: this.document.documentElement.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
    this.focusRequest.update(n => n + 1);
  }

  /** `exit`: back up the page, out through the glass into the room. The
   *  prompt lets go of the keyboard, so keys work the page again. */
  private leave(): void {
    (this.document.activeElement as HTMLElement | null)?.blur?.();
    const w = this.document.defaultView;
    const reduced = w?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? true;
    w?.setTimeout(() => w.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }), 400);
  }

  private push(input: string, command: Parsed): void {
    this.entries.update(list => [...list, { id: this.nextId++, input, command }]);
  }
}
