/**
 * The site's sections, in order, and the DOM id each one renders under in
 * the server-rendered page. The shell's commands map onto them (the header
 * marks the current one, the VT100's screen mirrors it); the scene reads
 * the section keys. One list, so they agree.
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
