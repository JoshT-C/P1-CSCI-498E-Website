import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Static prerender of the single page. Runtime GitHub data arrives after
 * hydration; the prerendered shell ships with the curated content only.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
