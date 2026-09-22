import type { Routes } from '@angular/router';

/**
 * The site is one page of sections; the router exists for the document title
 * and for the wildcard so any deep link lands on the page rather than a 404
 * (nginx's SPA fallback hands those to index.html, the router takes it from there).
 */
export const routes: Routes = [
  {
    path: '',
    title: 'Home',
    loadComponent: () => import('./home/home').then(m => m.HomeComponent)
  },
  { path: '**', redirectTo: '' }
];
