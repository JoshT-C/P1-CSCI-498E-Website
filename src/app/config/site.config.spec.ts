import { SECTION_DOM_ID, SITE_SECTIONS } from './site.config';

describe('site.config', () => {
  it('lists the five sections, in order, without duplicates', () => {
    expect(SITE_SECTIONS).toEqual(['hero', 'work', 'stack', 'about', 'contact']);
    expect(new Set(SITE_SECTIONS).size).toBe(SITE_SECTIONS.length);
  });

  it('renders every section under a DOM id', () => {
    for (const section of SITE_SECTIONS) {
      expect(SECTION_DOM_ID[section].length, `DOM id for ${section}`).toBeGreaterThan(0);
    }
  });

  it('maps hero to the page-top anchor', () => {
    expect(SECTION_DOM_ID.hero).toBe('top');
  });
});
