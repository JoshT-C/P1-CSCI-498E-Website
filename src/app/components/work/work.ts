import {
  AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, OnInit, PLATFORM_ID, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { type ProjectData, describeGitHubError, GitHubService } from '../../services/github.service';
import {
  CURATED_PROJECTS, GITHUB_USERNAME, HIDDEN_REPOS, MAX_GRID_PROJECTS
} from '../../services/content/projects';
import { SceneSyncService } from '../../services/scene-sync.service';
import { RevealDirective } from '../../directives/reveal.directive';

export interface GridState {
  status: 'loading' | 'error' | 'ready';
  projects: ProjectData[];
  error?: string;
}

@Component({
  selector: 'app-work',
  imports: [CommonModule, RevealDirective],
  templateUrl: './work.html'
})
export class WorkComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly github = inject(GitHubService);
  private readonly sync = inject(SceneSyncService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private gridSubscription?: { unsubscribe(): void };
  private curatedObserver?: IntersectionObserver;
  private readonly curatedRatios = new Map<HTMLElement, number>();

  readonly curated = CURATED_PROJECTS;
  readonly username = GITHUB_USERNAME;
  readonly grid = signal<GridState>({ status: 'loading', projects: [] });

  ngOnInit(): void {
    // Prerender ships the loading skeleton; the real request happens
    // client-side after hydration.
    if (this.isBrowser) {
      this.load();
    }
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    this.gridSubscription?.unsubscribe();
    this.grid.set({ status: 'loading', projects: [] });
    this.gridSubscription = this.github
      .getPublicRepositories(GITHUB_USERNAME, { fallbackOnError: false })
      .pipe(
        map(projects =>
          projects
            .filter(p => !HIDDEN_REPOS.has(p.title))
            .slice(0, MAX_GRID_PROJECTS)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: projects => this.grid.set({ status: 'ready', projects }),
        error: error =>
          this.grid.set({
            status: 'error',
            projects: [],
            error: describeGitHubError(error)
          })
      });
  }

  /**
   * Reports which curated card is in view so the 3D work rig (and anything
   * else listening) can track the reader. The card with the largest
   * intersection ratio wins; none above 25% means -1.
   */
  ngAfterViewInit(): void {
    if (!this.isBrowser || !('IntersectionObserver' in window)) return;

    const cards = this.el.nativeElement.querySelectorAll<HTMLElement>('[work-index]');
    this.curatedObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          this.curatedRatios.set(entry.target as HTMLElement, entry.intersectionRatio);
        }
        let best = -1;
        let bestRatio = 0.25;
        this.curatedRatios.forEach((ratio, card) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = Number(card.dataset['workIndex'] ?? -1);
          }
        });
        this.sync.setActiveWorkIndex(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-15% 0px -15% 0px' }
    );
    cards.forEach(card => this.curatedObserver?.observe(card));
  }

  ngOnDestroy(): void {
    this.curatedObserver?.disconnect();
  }
}
