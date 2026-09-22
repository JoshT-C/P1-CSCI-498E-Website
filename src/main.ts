import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';

// Scroll-reveal hides content until JS confirms it can animate it back in.
// Only claim that contract when IntersectionObserver actually exists —
// otherwise the html.js gate in styles.css never hides anything.
if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js');
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
