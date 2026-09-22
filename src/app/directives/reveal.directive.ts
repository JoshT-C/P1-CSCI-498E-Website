import { Directive, ElementRef, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Fades an element in the first time it scrolls into view.
 *
 * The hidden state only exists in CSS under `html.js` (see the gate in
 * styles.css and the class main.ts adds), so when JS never runs — or the
 * observer is unavailable — the content simply stays visible. There is no
 * "un-hide" step to get wrong. Templates use it as a bare `appReveal`
 * attribute.
 */
@Directive({ selector: '[appReveal]' })
export class RevealDirective implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly observer?: IntersectionObserver;

  constructor() {
    if (!this.isBrowser || !('IntersectionObserver' in window)) return;

    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.observer?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
