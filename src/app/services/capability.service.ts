import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

export type RenderStyle = '3d' | 'css';

/**
 * Everything decide3D needs, lifted out of the browser so the decision is a
 * pure, table-testable function.
 */
export interface CapabilityProbe {
  no3d: boolean;
  reducedMotion: boolean;
  webgl: boolean;
  mobile: boolean;
  deviceMemory: number | undefined;
  hardwareConcurrency: number | undefined;
}

export interface CapabilityDecision {
  render: RenderStyle;
  reason: string;
}

/**
 * The 3D gate, as a pure function.
 *
 * Order matters: cheap, certain signals first. A user who asked for no 3D
 * gets it no matter what their GPU is; a reduced-motion preference beats
 * hardware capability because motion, not fidelity, is the problem there.
 */
export function decide3D(probe: CapabilityProbe): CapabilityDecision {
  if (probe.no3d) {
    return { render: 'css', reason: 'user-override' };
  }
  if (probe.reducedMotion) {
    return { render: 'css', reason: 'reduced-motion' };
  }
  if (!probe.webgl) {
    return { render: 'css', reason: 'no-webgl' };
  }
  if (probe.mobile) {
    return { render: 'css', reason: 'mobile' };
  }
  if (probe.deviceMemory !== undefined && probe.deviceMemory <= 4) {
    return { render: 'css', reason: 'low-memory' };
  }
  if (probe.hardwareConcurrency !== undefined && probe.hardwareConcurrency <= 4) {
    return { render: 'css', reason: 'low-cores' };
  }
  return { render: '3d', reason: 'ok' };
}

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
}

@Injectable({ providedIn: 'root' })
export class CapabilityService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** How the page is rendering right now. CSS is the default: on the server,
   *  before detection, and after a runtime downgrade, the CSS fallback is
   *  what a visitor sees. */
  readonly render = signal<RenderStyle>('css');
  readonly reason = signal('server');

  constructor() {
    if (this.isBrowser) {
      this.evaluate();
    }
  }

  evaluate(): void {
    if (!this.isBrowser) return;
    const w = this.document.defaultView;
    if (!w) return;

    const probe: CapabilityProbe = {
      no3d: new URLSearchParams(w.location.search).has('no3d'),
      reducedMotion: w.matchMedia('(prefers-reduced-motion: reduce)').matches,
      webgl: this.hasWebgl(),
      mobile: /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)
        && w.matchMedia('(pointer: coarse)').matches,
      deviceMemory: (navigator as NavigatorWithHints).deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency
    };

    this.apply(decide3D(probe));
  }

  /** Runtime self-downgrade: the scene measured its own frame times and lost
   *  the budget. Swap to the CSS fallback for the rest of the visit. */
  downgrade(reason: string): void {
    if (this.render() === 'css') return;
    this.apply({ render: 'css', reason });
  }

  private apply(decision: CapabilityDecision): void {
    this.render.set(decision.render);
    this.reason.set(decision.reason);
    this.document.documentElement.dataset['render'] = decision.render;
    console.info('[scene] render mode:', decision.render, `(${decision.reason})`);
  }

  private hasWebgl(): boolean {
    try {
      const canvas = this.document.createElement('canvas');
      return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }
}
