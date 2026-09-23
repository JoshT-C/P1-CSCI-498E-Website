/**
 * The page's sections, in order, and the DOM id each one renders under.
 * The screen mirrors whichever section is in view; home.ts observes these
 * ids; the scene reads the section keys. One list, so the three agree.
 */
export const SITE_SECTIONS = ['hero', 'work', 'stack', 'about', 'contact'] as const;
export type SiteSection = (typeof SITE_SECTIONS)[number];

export const SECTION_DOM_ID: Readonly<Record<SiteSection, string>> = {
  hero: 'top',
  work: 'work',
  stack: 'stack',
  about: 'about',
  contact: 'contact'
};

/** GitHub API requests give up after this long. */
export const REQUEST_TIMEOUT_MS = 15_000;
