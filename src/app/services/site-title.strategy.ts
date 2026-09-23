import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const SITE_NAME = 'Joshua T-C';

/**
 * Suffixes every route title with the site name, so each page has a distinct
 * <title> (WCAG 2.4.2) while tabs and history entries stay recognisable.
 */
@Injectable({ providedIn: 'root' })
export class SiteTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `${pageTitle} · ${SITE_NAME}` : SITE_NAME);
  }
}
