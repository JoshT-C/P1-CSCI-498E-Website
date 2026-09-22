import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GitHubService, GitHubRepo, GitHubUser } from './github.service';

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

    it('returns an empty list by default on API errors', () => {
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects).toEqual([]);
      });

      httpMock.expectOne(`${API}/users/JoshT-C/repos?sort=updated&per_page=100`)
        .flush('rate limited', { status: 403, statusText: 'Forbidden' });
    });

    it('rethrows when the caller opts out of the empty-list fallback', () => {
      let failed = false;
      service.getPublicRepositories('JoshT-C', { fallbackOnError: false }).subscribe({
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
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects).toEqual([]);
      });
      httpMock.expectOne(REPOS_URL)
        .flush('rate limited', { status: 403, statusText: 'Forbidden' });

      // A failed request must evict its cache entry, or the retry button
      // would replay the failure forever.
      service.getPublicRepositories('JoshT-C').subscribe(projects => {
        expect(projects[0].title).toBe('recovered');
      });
      httpMock.expectOne(REPOS_URL).flush([makeRepo({ name: 'recovered' })]);
    });

    it('shares the profile endpoint across subscribers', () => {
      const profile: Partial<GitHubUser> = {
        login: 'JoshT-C', name: 'Joshua', bio: '', blog: '', location: '',
        avatar_url: 'https://avatars.example/1', public_repos: 1,
        followers: 0, following: 0, created_at: '2022-06-01T00:00:00Z'
      };

      service.getUserProfile('JoshT-C').subscribe();
      httpMock.expectOne(`${API}/users/JoshT-C`).flush(profile);
      service.getUserProfile('JoshT-C').subscribe();
      httpMock.expectNone(`${API}/users/JoshT-C`);
    });
  });

  describe('getUserProfile', () => {
    const user: GitHubUser = {
      login: 'JoshT-C',
      id: 99,
      avatar_url: 'https://avatars.example/99',
      name: 'Joshua Tuominen-Collins',
      bio: 'CS student',
      blog: '',
      location: 'Colorado',
      email: null,
      public_repos: 5,
      followers: 10,
      following: 2,
      created_at: '2022-06-01T00:00:00Z',
      updated_at: '2025-06-01T00:00:00Z'
    };

    it('maps the GitHub user to a profile', () => {
      service.getUserProfile('JoshT-C').subscribe(profile => {
        expect(profile).not.toBeNull();
        expect(profile!.username).toBe('JoshT-C');
        expect(profile!.name).toBe('Joshua Tuominen-Collins');
        expect(profile!.joinDate).toEqual(new Date('2022-06-01T00:00:00Z'));
      });

      httpMock.expectOne(`${API}/users/JoshT-C`).flush(user);
    });

    it('falls back to the login when the user has no display name', () => {
      service.getUserProfile('JoshT-C').subscribe(profile => {
        expect(profile!.name).toBe('JoshT-C');
      });

      httpMock.expectOne(`${API}/users/JoshT-C`).flush({ ...user, name: null });
    });

    it('returns null on API errors', () => {
      service.getUserProfile('JoshT-C').subscribe(profile => {
        expect(profile).toBeNull();
      });

      httpMock.expectOne(`${API}/users/JoshT-C`)
        .flush('not found', { status: 404, statusText: 'Not Found' });
    });
  });
});
