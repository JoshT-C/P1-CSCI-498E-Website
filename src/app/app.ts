import { Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser, ViewportScroller } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from './components/header/header';
import { SceneCanvasComponent } from './components/scene-canvas/scene-canvas';
import { StationPanelComponent } from './components/station-panel/station-panel';
import { HoverLabelComponent } from './components/hover-label/hover-label';
import { BootComponent } from './components/boot/boot';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, SceneCanvasComponent, StationPanelComponent, HoverLabelComponent, BootComponent],
  templateUrl: './app.html'
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    // The router scrolls hash links itself, ignoring CSS scroll-margin:
    // give it the fixed header's height so a section's first line is not
    // left under the header.
    if (this.isBrowser) {
      inject(ViewportScroller).setOffset(() => [0, document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0]);
    }

    // A client-side route change moves focus to the page — the same courtesy
    // a link click already gives the keyboard user.
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd && event.url !== '/'),
      takeUntilDestroyed()
    ).subscribe(() => {
      if (!this.isBrowser) return;
      document.getElementById('main-content')?.focus();
    });
  }
}
