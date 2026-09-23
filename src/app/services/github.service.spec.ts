import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GitHubService, GitHubRepo } from './github.service';

const API = 'https://api.github.com';

function makeRepo(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    id: 1,
    name: 'sample-repo',
    full_name: 'JoshT-C/sample-repo',
    description: 'A sample repository',
    html_url: 'https://github.com/JoshT-C/sample-repo',
    homepage: null,
    language: 'TypeScript',
    topics: ['angular', 'blog'],
    stargazers_count: 3,
    forks_count: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    pushed_at: new Date().toISOString(),
    archived: false,
    fork: false,
    private: false,
    ...overrides
  };
}

describe('GitHubService', () => {
  let service: GitHubService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(GitHubService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getPublicRepositories', () => {
    it('preserves dashes in repository names', () => {
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects[0].title).toBe('JoshT-C.github.io');
      });

      httpMock.expectOne(`${API}/users/JoshT-C/repos?sort=updated&per_page=100`)
        .flush([makeRepo({ name: 'JoshT-C.github.io' })]);
    });

    it('filters out forks and private repositories', () => {
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects.length).toBe(1);
        expect(projects[0].title).toBe('kept');
      });

      httpMock.expectOne(`${API}/users/JoshT-C/repos?sort=updated&per_page=100`)
        .flush([
          makeRepo({ id: 1, name: 'kept' }),
          makeRepo({ id: 2, name: 'a-fork', fork: true }),
          makeRepo({ id: 3, name: 'a-secret', private: true })
        ]);
    });

    it('sorts repositories by most recently updated', () => {
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects.map(p => p.title)).toEqual(['newer', 'older']);
      });

      httpMock.expectOne(`${API}/users/JoshT-C/repos?sort=updated&per_page=100`)
        .flush([
          makeRepo({ id: 1, name: 'older', updated_at: '2024-01-01T00:00:00Z' }),
          makeRepo({ id: 2, name: 'newer', updated_at: '2025-01-01T00:00:00Z' })
        ]);
    });

    it('derives project status from archive flag and push recency', () => {
      const overOneYearAgo = new Date();
      overOneYearAgo.setFullYear(overOneYearAgo.getFullYear() - 1);

      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        const byTitle = new Map(projects.map(p => [p.title, p.status]));
        expect(byTitle.get('archived-repo')).toBe('archived');
        expect(byTitle.get('stale-repo')).toBe('maintenance');
        expect(byTitle.get('fresh-repo')).toBe('active');
      });

      httpMock.expectOne(`${API}/users/JoshT-C/repos?sort=updated&per_page=100`)
        .flush([
          makeRepo({ id: 1, name: 'archived-repo', archived: true }),
          makeRepo({ id: 2, name: 'stale-repo', pushed_at: overOneYearAgo.toISOString() }),
          makeRepo({ id: 3, name: 'fresh-repo' })
        ]);
    });

    it('surfaces an API error rather than an empty list', () => {
      let failed = false;
      service.getPublicRepositories('JoshT-C').subscribe({
        next: () => {
          throw new Error('expected the request to fail');
        },
        error: () => {
          // The Work section relies on this: a failed fetch must surface as
          // an error with retry, never as an empty "no projects" state.
          failed = true;
        }
      });

      httpMock.expectOne(`${API}/users/JoshT-C/repos?sort=updated&per_page=100`)
        .flush('rate limited', { status: 403, statusText: 'Forbidden' });
      expect(failed).toBe(true);
    });
  });

  // The anonymous GitHub API allows 60 requests/hour, and the page re-renders
  // more often than that. Responses are shared per endpoint for the session.
  describe('response caching', () => {
    const REPOS_URL = `${API}/users/JoshT-C/repos?sort=updated&per_page=100`;

    it('issues one request no matter how many callers subscribe', () => {
      service.getPublicRepositories('JoshT-C').subscribe();
      httpMock.expectOne(REPOS_URL).flush([makeRepo({ name: 'first' })]);

      // A later caller — e.g. a re-render of the grid — reuses the result.
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects[0].title).toBe('first');
      });

      httpMock.expectNone(REPOS_URL);
    });

    it('caches per username rather than globally', () => {
      service.getPublicRepositories('JoshT-C').subscribe();
      httpMock.expectOne(REPOS_URL).flush([]);

      service.getPublicRepositories('someone-else').subscribe();
      httpMock.expectOne(`${API}/users/someone-else/repos?sort=updated&per_page=100`).flush([]);
    });

    it('does not cache failures, so a retry re-requests', () => {
      service.getPublicRepositories('JoshT-C').subscribe({ error: () => undefined });
      httpMock.expectOne(REPOS_URL)
        .flush('rate limited', { status: 403, statusText: 'Forbidden' });

      // A failed request must evict its cache entry, or the retry button
      // would replay the failure forever.
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects[0].title).toBe('recovered');
      });
      httpMock.expectOne(REPOS_URL).flush([makeRepo({ name: 'recovered' })]);
    });
  });
});
