/**
 * The scroll-watcher tuning, decided once so every observer agrees.
 */

/**
 * The middle 10% strip of the viewport (45% shaved off top and bottom). A
 * section is "active" (for the nav and the CRT screen) while it crosses
 * this strip, which is where the reader is looking.
 */
export const SECTION_BAND: IntersectionObserverInit = { rootMargin: '-45% 0px -45% 0px' };
