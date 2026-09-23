import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HERO_TYPING } from '../../config/terminal.config';
import { TERMINAL } from '../../services/content/projects';
import { SITE_META } from '../../services/content/site';
import { SceneSyncService, type StationId } from '../../services/scene-sync.service';
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
    ...HERO_TYPING,
    static: reduced
  });
}

interface StationEntry {
  readonly id: StationId;
  readonly key: string;
  readonly name: string;
  readonly what: string;
}

/** Spine fraction by which the plate has faded out. */
const FADE_UNTIL = 0.28;

/** The station nav: every prop in the room, reachable without a pointer. */
const STATIONS: readonly StationEntry[] = [
  { id: 'terminal', key: '01', name: 'terminal', what: 'projects, AI stack, about, contact' },
  { id: 'rack', key: '02', name: 'rack', what: 'machines and models' },
  { id: 'floppies', key: '03', name: 'floppies', what: 'projects not on GitHub' },
  { id: 'whiteboard', key: '04', name: 'whiteboard', what: 'architecture diagrams' },
  { id: 'laptop', key: '05', name: 'laptop', what: 'second inference machine' }
];

/**
 * The intro: the name plate and the station nav over the room. In the 3D
 * tiers this section is a long scroll run with a sticky stage — scrolling
 * through it walks the camera to the desk and through the glass.
 *
 * In the CSS tier it also shows the terminal card. The template prerenders TERMINAL.hero in full —
 * that is the no-JS experience. When JS runs, the same screen is cleared and
 * retyped by the shared pure screen-text machine (static under reduced
 * motion), so both modes show identical output from one source.
 *
 * The typing runs in a rAF loop that stops once the queue is idle; the caret
 * blink after that is a CSS animation, so nothing ticks per frame.
 */
@Component({
  selector: 'app-hero',
  templateUrl: './hero.html'
})
export class HeroComponent implements AfterViewInit, OnDestroy {
  /** The static (no-JS) render of the screen lines. */
  readonly terminalLines = TERMINAL.hero;
  readonly meta = SITE_META;
  readonly stations = STATIONS;

  private readonly sync = inject(SceneSyncService);
  readonly station = this.sync.station;

  open(id: StationId): void {
    this.sync.openStation(id);
  }

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
  private fadeRaf = 0;
  private section: HTMLElement | null = null;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.section = this.el.nativeElement.querySelector('.intro');
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.onScroll();
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
    cancelAnimationFrame(this.fadeRaf);
    window.removeEventListener('scroll', this.onScroll);
  }

  /** The plate and nav fade over the first stretch of the walk to the desk
   *  (done when the room stops being pickable). One style write per frame
   *  while scrolling; nothing when idle. */
  private readonly onScroll = (): void => {
    if (this.fadeRaf) return;
    this.fadeRaf = requestAnimationFrame(() => {
      this.fadeRaf = 0;
      const el = this.section;
      if (!el) return;
      const run = Math.max(el.offsetHeight - window.innerHeight, 1);
      const p = (window.scrollY - el.offsetTop) / run;
      const fade = 1 - Math.min(Math.max(p / FADE_UNTIL, 0), 1);
      el.style.setProperty('--intro-fade', fade.toFixed(3));
      el.style.setProperty('--intro-visibility', fade === 0 ? 'hidden' : 'visible');
    });
  };

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
