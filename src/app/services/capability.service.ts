import { Injectable, signal, PLATFORM_ID, inject, computed } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

/**
 * How much of the scene this visit gets:
 *  - `room`: the whole room — rack, shelf, whiteboard, shadows, bloom;
 *  - `desk`: the terminal and laptop on the desk only, no post-processing
 *    (phones and modest hardware);
 *  - `css`: no WebGL at all — the designed flat page.
 */
export type Tier = 'room' | 'desk' | 'css';
export type RenderStyle = '3d' | 'css';

/**
 * Everything decideTier needs, lifted out of the browser so the decision is
 * a pure, table-testable function.
 */
export interface CapabilityProbe {
  /** `?tier=` from the URL, if it names a tier. */
  forced: Tier | null;
  no3d: boolean;
  reducedMotion: boolean;
  webgl: boolean;
  mobile: boolean;
  deviceMemory: number | undefined;
  hardwareConcurrency: number | undefined;
}

export interface CapabilityDecision {
  tier: Tier;
  reason: string;
}

const TIERS: readonly Tier[] = ['room', 'desk', 'css'];

export function isTier(value: string | null): value is Tier {
  return value !== null && (TIERS as readonly string[]).includes(value);
}

/**
 * The tier gate, as a pure function.
 *
 * Order matters: cheap, certain signals first. A user who asked for no 3D
 * gets none whatever their GPU; a reduced-motion preference beats hardware,
 * because a camera flying through a room is exactly the motion it asks to
 * avoid. Weak or mobile hardware still gets the desk — 3D, but small.
 */
export function decideTier(probe: CapabilityProbe): CapabilityDecision {
  if (probe.forced) return { tier: probe.forced, reason: 'forced' };
  if (probe.no3d) return { tier: 'css', reason: 'user-override' };
  if (probe.reducedMotion) return { tier: 'css', reason: 'reduced-motion' };
  if (!probe.webgl) return { tier: 'css', reason: 'no-webgl' };
  if (probe.mobile) return { tier: 'desk', reason: 'mobile' };
  if (probe.deviceMemory !== undefined && probe.deviceMemory <= 4) return { tier: 'desk', reason: 'low-memory' };
  if (probe.hardwareConcurrency !== undefined && probe.hardwareConcurrency <= 4) {
    return { tier: 'desk', reason: 'low-cores' };
  }
  return { tier: 'room', reason: 'ok' };
}

/** One step down: room → desk → css. */
export function stepDown(tier: Tier): Tier {
  return tier === 'room' ? 'desk' : 'css';
}

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
}

@Injectable({ providedIn: 'root' })
export class CapabilityService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The current tier. CSS is the default: on the server, before
   *  detection, and after the last downgrade, the flat page is what a
   *  visitor sees. */
  readonly tier = signal<Tier>('css');
  readonly reason = signal('server');
  readonly render = computed<RenderStyle>(() => (this.tier() === 'css' ? 'css' : '3d'));

  constructor() {
    if (this.isBrowser) {
      this.evaluate();
    }
  }

  evaluate(): void {
    if (!this.isBrowser) return;
    const w = this.document.defaultView;
    if (!w) return;

    const params = new URLSearchParams(w.location.search);
    const forced = params.get('tier');
    const probe: CapabilityProbe = {
      forced: isTier(forced) ? forced : null,
      no3d: params.has('no3d'),
      reducedMotion: w.matchMedia('(prefers-reduced-motion: reduce)').matches,
      webgl: this.hasWebgl(),
      mobile: /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) && w.matchMedia('(pointer: coarse)').matches,
      deviceMemory: (navigator as NavigatorWithHints).deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency
    };

    this.apply(decideTier(probe));
  }

  /** Runtime self-downgrade: the scene lost its frame budget, its context,
   *  or failed to load. Step down one tier for the rest of the visit. */
  downgrade(reason: string): void {
    if (this.tier() === 'css') return;
    this.apply({ tier: stepDown(this.tier()), reason });
  }

  private apply(decision: CapabilityDecision): void {
    this.tier.set(decision.tier);
    this.reason.set(decision.reason);
    const root = this.document.documentElement;
    root.dataset['render'] = decision.tier === 'css' ? 'css' : '3d';
    root.dataset['tier'] = decision.tier;
    console.info('[scene] tier:', decision.tier, `(${decision.reason})`);
  }

  private hasWebgl(): boolean {
    try {
      const canvas = this.document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch {
      return false;
    }
  }
}
