import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, TitleStrategy, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';

import { routes } from './app.routes';
import { SiteTitleStrategy } from './services/site-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Restores scroll on back/forward so the page reopens where the user left it.
    provideRouter(routes, withInMemoryScrolling({
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled'
    })),
    { provide: TitleStrategy, useExisting: SiteTitleStrategy },
    provideHttpClient(),
    // No incremental hydration (the site has no @defer hydrate triggers):
    // with it, the prerendered page carries two inline event-replay
    // scripts, which the CSP's script-src 'self' rightly blocks.
    provideClientHydration(withNoIncrementalHydration())
  ]
};
