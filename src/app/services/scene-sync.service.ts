import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { FLOPPIES } from './content/homelab';
import { isStationId, type StationId } from '../../scenes/room/layout';

export type { StationId } from '../../scenes/room/layout';

export interface HoverTarget {
  readonly station: StationId;
  readonly x: number;
  readonly y: number;
}

/**
 * The bridge between the DOM and the 3D room.
 *
 * Sections report which one is in view; the scene reports what the pointer
 * is over and whether the camera is through the glass. Stations — the rack,
 * shelf, whiteboard and laptop panels — open from a click in the room, from
 * the station nav, or from a deep link (#rack, #floppies/bench, …); the
 * hash is kept in step so an open station can be shared as a link.
 * The CSS tier uses the same signals, so every panel works without WebGL.
 */
@Injectable({ providedIn: 'root' })
export class SceneSyncService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The section currently in view (hero/work/stack/about/contact). */
  readonly activeSection = signal<string>('hero');
  /** GitHub grid titles, for the screen's `ls ~/projects` output. */
  readonly workProjects = signal<readonly string[]>([]);

  /** The open station panel, or null. */
  readonly station = signal<StationId | null>(null);
  /** The lifted floppy (project id) when the shelf is open. */
  readonly floppy = signal<string | null>(null);
  /** The prop under the pointer, for the room's hover label. */
  readonly hover = signal<HoverTarget | null>(null);
  /** True once the camera has gone through the glass. */
  readonly portal = signal(false);

  constructor() {
    if (!this.isBrowser) return;
    // Mirrored to <html data-station> so CSS can clear the intro chrome.
    effect(() => {
      const station = this.station();
      const root = this.document.documentElement;
      if (station) root.dataset['station'] = station;
      else delete root.dataset['station'];
    });
    const w = this.document.defaultView;
    w?.addEventListener('hashchange', () => this.readHash());
    this.readHash();
  }

  setActiveSection(section: string): void {
    this.activeSection.set(section);
  }

  setWorkProjects(titles: readonly string[]): void {
    this.workProjects.set(titles);
  }

  setHover(target: HoverTarget | null): void {
    const prev = this.hover();
    if (prev?.station === target?.station && prev?.x === target?.x && prev?.y === target?.y) return;
    this.hover.set(target);
  }

  /** Where the running scene's camera is: through the glass (true), in
   *  the room (false), or null when no scene is running. `data-portal` is
   *  only set while a scene runs, because the stylesheet hides the session
   *  on 'out': without a scene nothing would ever show it again. */
  setPortal(inside: boolean | null): void {
    this.portal.set(inside === true);
    if (!this.isBrowser) return;
    const root = this.document.documentElement;
    if (inside === null) delete root.dataset['portal'];
    else root.dataset['portal'] = inside ? 'in' : 'out';
  }

  /** Open a station panel. The terminal is not a panel: it means "go in",
   *  so it scrolls to the session instead. */
  openStation(station: StationId, item: string | null = null): void {
    if (station === 'terminal') {
      this.closeStation();
      const reduced = this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
      // the session ends the page; in 3D the page's end is through the glass
      const w = this.document.defaultView;
      w?.scrollTo({ top: this.document.documentElement.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    const floppy = station === 'floppies' ? (item ?? this.floppy() ?? FLOPPIES[0]?.id ?? null) : null;
    this.station.set(station);
    this.floppy.set(floppy);
    this.writeHash(floppy ? `${station}/${floppy}` : station);
  }

  selectFloppy(id: string): void {
    this.openStation('floppies', id);
  }

  closeStation(): void {
    if (this.station() === null) return;
    this.station.set(null);
    this.floppy.set(null);
    this.writeHash(null);
  }

  private readHash(): void {
    const raw = this.document.defaultView?.location.hash.replace(/^#/, '') ?? '';
    const [head, item] = raw.split('/');
    if (head && head !== 'terminal' && isStationId(head)) {
      const known = item && FLOPPIES.some(f => f.id === item) ? item : null;
      this.station.set(head);
      this.floppy.set(head === 'floppies' ? (known ?? FLOPPIES[0]?.id ?? null) : null);
    } else if (this.station() !== null) {
      this.station.set(null);
      this.floppy.set(null);
    }
  }

  private writeHash(hash: string | null): void {
    const w = this.document.defaultView;
    if (!w) return;
    const url = hash ? `#${hash}` : `${w.location.pathname}${w.location.search}`;
    // replaceState: stations are views of this page, not history entries
    // (Back should leave the site, not step through props).
    w.history.replaceState(w.history.state, '', url);
  }
}
