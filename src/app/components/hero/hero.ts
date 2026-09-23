import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal
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
  { id: 'terminal', key: '01', name: 'terminal', what: 'log in and read' },
  { id: 'rack', key: '02', name: 'rack', what: 'machines, models' },
  { id: 'floppies', key: '03', name: 'floppies', what: 'more projects' },
  { id: 'whiteboard', key: '04', name: 'whiteboard', what: 'diagrams' },
  { id: 'laptop', key: '05', name: 'laptop', what: 'second machine' }
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
 * The typing runs in a rAF loop that stops once the queue is idle, and
 * writes each frame to a signal the template renders; the caret blink after
 * that is a CSS animation, so nothing ticks per frame.
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
  /** The typed screen, once JS has taken over; null shows the static lines. */
  readonly typed = signal<ScreenSnapshot | null>(null);
  private raf = 0;
  private lastNow = 0;
  private started = false;
  private fadeRaf = 0;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.onScroll();

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
      // queried each time: hydration can replace the section after init
      const el = this.el.nativeElement.querySelector('.intro') as HTMLElement | null;
      if (!el) return;
      const run = Math.max(el.offsetHeight - window.innerHeight, 1);
      const p = (window.scrollY - el.offsetTop) / run;
      const fade = 1 - Math.min(Math.max(p / FADE_UNTIL, 0), 1);
      el.style.setProperty('--intro-fade', fade.toFixed(3));
      el.style.setProperty('--intro-visibility', fade === 0 ? 'hidden' : 'visible');
    });
  };

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.term.setSection('hero', this.terminalLines);
    const snap = this.term.snapshot();
    if (snap.idle) {
      // reduced-motion: one full frame, no loop
      this.typed.set(snap);
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
      this.typed.set(snap);
      if (snap.idle) return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}
