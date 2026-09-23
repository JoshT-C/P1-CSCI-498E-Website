import { AfterViewInit, Component, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HeroComponent } from '../components/hero/hero';
import { WorkComponent } from '../components/work/work';
import { AiStackComponent } from '../components/ai-stack/ai-stack';
import { AboutComponent } from '../components/about/about';
import { ContactComponent } from '../components/contact/contact';
import { SceneSyncService } from '../services/scene-sync.service';
import { SECTION_DOM_ID, SITE_SECTIONS } from '../config/site.config';
import { SECTION_BAND } from '../config/observer.options';

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
    const targets = SITE_SECTIONS
      .map(section => document.getElementById(SECTION_DOM_ID[section]))
      .filter((el): el is HTMLElement => el !== null);
    this.sectionObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const section = SITE_SECTIONS.find(s => SECTION_DOM_ID[s] === entry.target.id);
          if (!section) continue;
          this.sync.setActiveSection(section);
          document.body.dataset['activeSection'] = section;
        }
      },
      SECTION_BAND
    );
    for (const target of targets) {
      this.sectionObserver.observe(target);
    }
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
  }
}
