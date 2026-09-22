import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { STACK } from '../../services/content/projects';
import { SceneSyncService } from '../../services/scene-sync.service';
import { RevealDirective } from '../../directives/reveal.directive';

@Component({
  selector: 'app-ai-stack',
  imports: [RevealDirective],
  templateUrl: './ai-stack.html'
})
export class AiStackComponent implements AfterViewInit, OnDestroy {
  private readonly sync = inject(SceneSyncService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private rowObserver?: IntersectionObserver;
  private readonly rowRatios = new Map<HTMLElement, number>();

  readonly STACK = STACK;
  /** The interactive default is what the machine runs day to day. */
  readonly activeModel = signal(0);

  ngAfterViewInit(): void {
    if (!this.isBrowser || !('IntersectionObserver' in window)) return;

    const rows = this.el.nativeElement.querySelectorAll<HTMLElement>('[model-index]');
    this.rowObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          this.rowRatios.set(entry.target as HTMLElement, entry.intersectionRatio);
        }
        let best = -1;
        let bestRatio = 0.25;
        this.rowRatios.forEach((ratio, row) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = Number(row.dataset['modelIndex'] ?? -1);
          }
        });
        if (best >= 0) {
          this.activeModel.set(best);
          this.sync.setActiveModelIndex(best);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-20% 0px -20% 0px' }
    );
    rows.forEach(row => this.rowObserver?.observe(row));
  }

  ngOnDestroy(): void {
    this.rowObserver?.disconnect();
  }
}
