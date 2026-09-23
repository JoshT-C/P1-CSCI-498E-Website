import { Component, DestroyRef, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { type ProjectData, describeGitHubError, GitHubService } from '../../services/github.service';
import {
  CURATED_PROJECTS, GITHUB_USERNAME, HIDDEN_REPOS, MAX_GRID_PROJECTS
} from '../../services/content/projects';
import { SceneSyncService } from '../../services/scene-sync.service';

export interface GridState {
  status: 'loading' | 'error' | 'ready';
  projects: ProjectData[];
  error?: string;
}

@Component({
  selector: 'app-work',
  imports: [CommonModule],
  templateUrl: './work.html'
})
export class WorkComponent implements OnInit {
  private readonly github = inject(GitHubService);
  private readonly sync = inject(SceneSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private gridSubscription?: { unsubscribe(): void };

  readonly curated = CURATED_PROJECTS;
  readonly limit = MAX_GRID_PROJECTS;
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
      .getPublicRepositories(GITHUB_USERNAME)
      .pipe(
        map(projects =>
          projects
            .filter(p => !HIDDEN_REPOS.has(p.title))
            .slice(0, MAX_GRID_PROJECTS)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: projects => {
          this.grid.set({ status: 'ready', projects });
          // the 3D screen mirrors these titles in `ls ~/projects`
          this.sync.setWorkProjects(projects.map(p => p.title));
        },
        error: error =>
          this.grid.set({
            status: 'error',
            projects: [],
            error: describeGitHubError(error)
          })
      });
  }


}
