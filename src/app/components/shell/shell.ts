import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  untracked,
  viewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AboutComponent } from '../about/about';
import { AiStackComponent } from '../ai-stack/ai-stack';
import { ContactComponent } from '../contact/contact';
import { WorkComponent } from '../work/work';
import { SESSION_PROMPT, SITE_META } from '../../services/content/site';
import { SceneSyncService } from '../../services/scene-sync.service';
import { COMMANDS, SECTION_COMMAND, ShellService, type Parsed } from '../../services/shell.service';

/**
 * The guest session: a scrollback of commands and their output over a
 * prompt. It fills the screen past the glass (and below the intro in the
 * flat tier); its own log scrolls, and scrolling up past the log's top
 * scrolls the page back out into the room.
 *
 * The server renders every section into the scrollback so the page's HTML
 * carries all of it; the browser starts over at `help`, so hydration is
 * skipped for this component rather than matched.
 */
@Component({
  selector: 'app-shell',
  imports: [WorkComponent, AiStackComponent, AboutComponent, ContactComponent],
  templateUrl: './shell.html',
  host: { ngSkipHydration: 'true' }
})
export class ShellComponent {
  private readonly shell = inject(ShellService);
  private readonly sync = inject(SceneSyncService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly isServer = !isPlatformBrowser(inject(PLATFORM_ID));

  private readonly log = viewChild.required<ElementRef<HTMLElement>>('log');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  readonly entries = this.shell.entries;
  readonly input = this.shell.input;
  readonly commands = COMMANDS;
  readonly prompt = SESSION_PROMPT;
  readonly meta = SITE_META;

  /** The shell is on screen: past the glass in 3D, scrolled to when flat. */
  private onScreen = false;

  constructor() {
    if (this.isServer) return;

    // a new command: bring its prompt line to the top of the log, so its
    // output reads from the start
    let seen = -1;
    effect(() => {
      const list = this.entries();
      const last = list[list.length - 1];
      if (!last || last.id === seen) return;
      const first = seen === -1;
      seen = last.id;
      if (first) return;
      afterNextRender(() => this.reveal(last.id), { injector: this.injector });
    });

    let lastRequest = untracked(this.shell.focusRequest);
    effect(() => {
      const n = this.shell.focusRequest();
      if (n === lastRequest) return;
      lastRequest = n;
      afterNextRender(() => this.focus(), { injector: this.injector });
    });

    afterNextRender(() => {
      this.watch();
      // a section link (#contact) opened the page: the browser jumped to
      // the server-rendered section, which this render replaced; go in
      if (SECTION_COMMAND[window.location.hash.slice(1)]) this.shell.enter();
    });
  }

  anchorFor(command: Parsed): string | null {
    return Object.keys(SECTION_COMMAND).find(k => SECTION_COMMAND[k] === command) ?? null;
  }

  /** A click in `help`: the prompt takes the name and the keyboard at
   *  once, in the DOM as well as the state, so an Enter pressed straight
   *  after runs it (waiting a render let a fast Enter hit the button). */
  fill(name: string): void {
    this.shell.fill(name);
    this.field().nativeElement.value = name;
    this.focus();
  }

  submit(event: Event): void {
    event.preventDefault();
    this.shell.run(this.field().nativeElement.value);
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.shell.recall(event.key === 'ArrowUp' ? -1 : 1);
      this.caretToEnd();
    } else if (event.key === 'Tab' && this.input().trim()) {
      event.preventDefault(); // only when there is something to finish
      this.shell.complete();
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      this.shell.run('clear', { record: false });
    }
  }

  /** A click on the log's text (not a link or button, not a selection)
   *  puts the caret back on the prompt, as clicking a terminal does. The
   *  keyboard's way there is the keydown handler in watch(): typing
   *  anywhere lands on the prompt. */
  private clickLog(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('a, button, input')) return;
    if (window.getSelection()?.toString()) return;
    this.focus();
  }

  private reveal(id: number): void {
    const log = this.log().nativeElement;
    const el = log.querySelector<HTMLElement>(`[data-entry="${id}"]`);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    log.scrollTo({ top: el.offsetTop - 8, behavior: reduced ? 'auto' : 'smooth' });
  }

  private focus(): void {
    this.field().nativeElement.focus({ preventScroll: true });
    this.caretToEnd();
  }

  private caretToEnd(): void {
    const el = this.field().nativeElement;
    afterNextRender(() => el.setSelectionRange(el.value.length, el.value.length), { injector: this.injector });
  }

  /** Track whether the shell is on screen; when it arrives, the prompt
   *  takes the keyboard (not on touch screens, where that would raise the
   *  on-screen keyboard unasked), and typing anywhere lands on it. */
  private watch(): void {
    const section = this.host.nativeElement.querySelector('#shell');
    if (!section || !('IntersectionObserver' in window)) return;
    const visible = (): boolean =>
      this.onScreen && (document.documentElement.dataset['render'] !== '3d' || this.sync.portal());
    const io = new IntersectionObserver(
      ([entry]) => {
        const was = visible();
        this.onScreen = entry.isIntersecting;
        if (!was && visible() && !window.matchMedia('(pointer: coarse)').matches) this.focus();
      },
      { threshold: 0.6 }
    );
    io.observe(section);
    // in 3D the shell is laid out before the portal; focus when it opens
    const stop = effect(
      () => {
        if (this.sync.portal() && this.onScreen && !window.matchMedia('(pointer: coarse)').matches) {
          untracked(() => this.focus());
        }
      },
      { injector: this.injector }
    );
    const onKeydown = (e: KeyboardEvent): void => {
      if (!visible() || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if (document.querySelector('.boot')) return; // the key skips the login instead
      const t = e.target as Element | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      // the key goes into the input itself, not only the state: the next
      // key arrives natively before a render would write the state back,
      // and Chromium lost the first character that way
      e.preventDefault();
      const el = this.field().nativeElement;
      el.value += e.key;
      this.shell.input.set(el.value);
      this.focus();
    };
    document.addEventListener('keydown', onKeydown);
    const log = this.log().nativeElement;
    const onClick = (e: MouseEvent): void => this.clickLog(e);
    log.addEventListener('click', onClick);
    this.injector.get(DestroyRef).onDestroy(() => {
      io.disconnect();
      stop.destroy();
      document.removeEventListener('keydown', onKeydown);
      log.removeEventListener('click', onClick);
    });
  }
}
