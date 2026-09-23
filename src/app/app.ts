import { Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from './components/header/header';
import { FooterComponent } from './components/footer/footer';
import { SceneCanvasComponent } from './components/scene-canvas/scene-canvas';
import { StationPanelComponent } from './components/station-panel/station-panel';
import { HoverLabelComponent } from './components/hover-label/hover-label';
import { BootComponent } from './components/boot/boot';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, SceneCanvasComponent, FooterComponent, StationPanelComponent, HoverLabelComponent, BootComponent],
  templateUrl: './app.html'
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
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
