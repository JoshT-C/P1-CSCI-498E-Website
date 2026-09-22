import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RevealDirective } from '../../directives/reveal.directive';
import { TERMINAL } from '../../services/content/projects';
import { SCREEN_MAX_COLS } from '../../../scenes/screen-content';
import {
  createTerminal,
  type ScreenSnapshot,
  type Terminal
} from '../../../scenes/screen-text';

interface TermLineEl {
  line: HTMLDivElement;
  prompt: HTMLSpanElement;
  text: HTMLSpanElement;
}

function createHeroTerminal(platformId: object): Terminal {
  const reduced =
    isPlatformBrowser(platformId) &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return createTerminal({
    maxLines: 10,
    maxCols: SCREEN_MAX_COLS,
    charsPerSecond: 45,
    linePauseMs: 320,
    static: reduced
  });
}

/**
 * The hero terminal card. The template prerenders TERMINAL.hero in full —
 * that is the no-JS experience. When JS runs, the same screen is cleared and
 * retyped by the shared pure screen-text machine (static under reduced
 * motion), so both modes show identical output from one source.
 *
 * The typing runs in a rAF loop that stops once the queue is idle; the caret
 * blink after that is a CSS animation, so nothing ticks per frame.
 */
@Component({
  selector: 'app-hero',
  imports: [RevealDirective],
  templateUrl: './hero.html'
})
export class HeroComponent implements AfterViewInit, OnDestroy {
  /** The static (no-JS) render of the screen lines. */
  readonly terminalLines = TERMINAL.hero;

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly term = createHeroTerminal(this.platformId);
  private io: IntersectionObserver | null = null;
  private screen: HTMLDivElement | null = null;
  private readonly pool: TermLineEl[] = [];
  private caret: HTMLSpanElement | null = null;
  private raf = 0;
  private lastNow = 0;
  private started = false;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.screen = this.el.nativeElement.querySelector('.term__screen');
    if (!this.screen) return;

    // JS takes over the prerendered screen: clear it and build the caret.
    this.screen.replaceChildren();
    this.caret = document.createElement('span');
    this.caret.className = 'term__caret';

    if ('IntersectionObserver' in window) {
      // Start typing when the hero first scrolls into view; on a deep link
      // the queue waits, and a mid-session 3D downgrade lands on a card
      // that types itself when seen.
      this.io = new IntersectionObserver(
        entries => {
          if (entries.some(e => e.isIntersecting)) {
            this.io?.disconnect();
            this.start();
          }
        },
        { threshold: 0.2 }
      );
      this.io.observe(this.el.nativeElement);
    } else {
      this.start();
    }
  }

  ngOnDestroy(): void {
    // Runs on the SSR/prerender server too, where rAF does not exist; the
    // browser-only rAF/io were never started there (ngAfterViewInit bails).
    if (!isPlatformBrowser(this.platformId)) return;
    this.io?.disconnect();
    cancelAnimationFrame(this.raf);
  }

  private start(): void {
    if (this.started || !this.screen) return;
    this.started = true;
    this.term.setSection('hero', this.terminalLines);
    const snap = this.term.snapshot();
    if (snap.idle) {
      // reduced-motion: one full frame, no loop
      this.paint(snap);
      return;
    }
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private readonly loop = (now: number): void => {
    const dt = Math.min(now - this.lastNow, 100);
    this.lastNow = now;
    const snap = this.term.tick(dt);
    if (snap) {
      this.paint(snap);
      if (snap.idle) return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private paint(snap: ScreenSnapshot): void {
    const screen = this.screen!;
    for (let i = this.pool.length; i < snap.lines.length; i++) {
      const line = document.createElement('div');
      line.className = 'term__line';
      const prompt = document.createElement('span');
      prompt.className = 'term__prompt';
      const text = document.createElement('span');
      line.append(prompt, text);
      screen.append(line);
      this.pool.push({ line, prompt, text });
    }
    for (let i = 0; i < snap.lines.length; i++) {
      this.pool[i].prompt.textContent = snap.lines[i].prompt;
      this.pool[i].text.textContent = snap.lines[i].text;
    }
    const target = this.pool[snap.caretLine];
    if (target && this.caret && this.caret.parentElement !== target.line) {
      target.line.append(this.caret);
    }
    // First paint: the screen becomes visible (html.js hides it until then).
    screen.classList.add('is-typing');
  }
}
