import { SECTION_BAND } from './observer.options';

describe('observer.options', () => {
  it('marks a section active across the middle 10% strip of the viewport', () => {
    expect(SECTION_BAND).toEqual({ rootMargin: '-45% 0px -45% 0px' });
  });
});
