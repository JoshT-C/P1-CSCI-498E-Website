import { AfterViewInit, Component, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HeroComponent } from '../components/hero/hero';
import { WorkComponent } from '../components/work/work';
import { AiStackComponent } from '../components/ai-stack/ai-stack';
import { AboutComponent } from '../components/about/about';
import { ContactComponent } from '../components/contact/contact';
import { SceneSyncService } from '../services/scene-sync.service';

/** DOM id → the section key the screen mirrors. */
const SECTION_BY_ID: Record<string, string> = {
  top: 'hero',
  work: 'work',
  stack: 'stack',
  about: 'about',
  contact: 'contact'
};

@Component({
  selector: 'app-home',
  imports: [HeroComponent, WorkComponent, AiStackComponent, AboutComponent, ContactComponent],
  templateUrl: './home.html'
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  private readonly sync = inject(SceneSyncService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private sectionObserver: IntersectionObserver | null = null;

  /**
   * One observer over all five sections: a 10% center band of the viewport
   * decides which section the terminal screen mirrors. The last section to
   * intersect the band wins; when the band is empty the previous value is
   * kept, so the screen never clears mid-scroll. Also mirrored to
   * body[data-active-section] as an audit/debug hook.
   */
  ngAfterViewInit(): void {
    if (!this.isBrowser || !('IntersectionObserver' in window)) return;
    const targets = Object.keys(SECTION_BY_ID)
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    this.sectionObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const section = SECTION_BY_ID[entry.target.id];
          if (!section) continue;
          this.sync.setActiveSection(section);
          document.body.dataset['activeSection'] = section;
        }
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    for (const target of targets) {
      this.sectionObserver.observe(target);
    }
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
  }
}
