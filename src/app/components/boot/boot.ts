import { Component, DestroyRef, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SceneSyncService } from '../../services/scene-sync.service';

const STORAGE_KEY = 'tty-booted';
/** ms between lines; the login name is typed a character at a time. */
const LINE_MS = 150;
const CHAR_MS = 55;
const HOLD_MS = 450;

interface BootLine {
  readonly text: string;
  /** Typed one character at a time instead of appearing whole. */
  readonly typed?: boolean;
}

function lastLogin(now: Date): string {
  const day = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `Last login: ${day} ${time} on ttyS0`;
}

/**
 * The login you see the first time you go through the glass: the terminal's
 * self-test, the serial line coming up, a guest login. It plays once per
 * browser session, is skipped by any key, click, touch or scroll, and never
 * plays under reduced motion. Decorative: screen readers go straight to the
 * session.
 */
@Component({
  selector: 'app-boot',
  host: { 'aria-hidden': 'true' },
  template: `
    @if (visible()) {
      <div class="boot" [class.boot--out]="leaving()">
        @for (line of shown(); track $index) {
          <p>{{ line }}</p>
        }
        <p><span class="tty__cursor"></span></p>
      </div>
    }
  `
})
export class BootComponent {
  private readonly sync = inject(SceneSyncService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly visible = signal(false);
  readonly leaving = signal(false);
  readonly shown = signal<string[]>([]);
  private timers: number[] = [];
  private played = false;
  private skipHandler: (() => void) | null = null;

  constructor() {
    effect(() => {
      if (this.sync.portal() && !this.played) this.play();
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private alreadyBooted(): boolean {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private play(): void {
    this.played = true;
    if (!this.isBrowser || this.alreadyBooted()) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // storage blocked: the boot may replay, which is harmless
    }

    const script: BootLine[] = [
      { text: 'VT100 SELF TEST .......... OK' },
      { text: 'ttyS0  19200 baud  8N1' },
      { text: '' },
      { text: 't-c login: guest', typed: true },
      { text: lastLogin(new Date()) },
      { text: '' }
    ];

    this.visible.set(true);
    this.shown.set([]);
    const skip = (): void => this.finish(0);
    for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart']) {
      window.addEventListener(ev, skip, { once: true, passive: true });
    }
    this.skipHandler = skip;

    let t = 250;
    for (const line of script) {
      if (line.typed) {
        const prefix = line.text.slice(0, line.text.indexOf(':') + 2);
        this.at(t, () => this.shown.update(s => [...s, prefix]));
        for (let i = prefix.length + 1; i <= line.text.length; i++) {
          t += CHAR_MS;
          const partial = line.text.slice(0, i);
          this.at(t, () => this.shown.update(s => [...s.slice(0, -1), partial]));
        }
      } else {
        this.at(t, () => this.shown.update(s => [...s, line.text]));
      }
      t += LINE_MS;
    }
    this.at(t + HOLD_MS, () => this.finish(300));
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private finish(fadeMs: number): void {
    this.stop();
    this.leaving.set(true);
    this.timers.push(
      window.setTimeout(() => {
        this.visible.set(false);
        this.leaving.set(false);
      }, fadeMs)
    );
  }

  private stop(): void {
    for (const id of this.timers.splice(0)) window.clearTimeout(id);
    if (this.skipHandler) {
      for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart']) {
        window.removeEventListener(ev, this.skipHandler);
      }
      this.skipHandler = null;
    }
  }
}
