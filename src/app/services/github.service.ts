import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { type Observable, TimeoutError, map, catchError, of, shareReplay, throwError, timeout } from 'rxjs';
import { REQUEST_TIMEOUT_MS } from '../config/site.config';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  private: boolean;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  bio: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  username: string;
  name: string;
  bio: string;
  avatarUrl: string;
  location: string;
  blog: string;
  publicRepos: number;
  followers: number;
  following: number;
  joinDate: Date;
}

export interface ProjectData {
  id: number;
  title: string;
  description: string;
  githubUrl: string;
  liveUrl: string | null;
  technologies: string[];
  stars: number;
  forks: number;
  language: string;
  lastUpdated: Date;
  status: 'active' | 'archived' | 'maintenance';
}

/** A project's topic tags, without the language its own badge already shows. */
export function projectTopics(project: ProjectData): string[] {
  return project.technologies.filter(tech => tech !== project.language);
}

/**
 * Turns a failed GitHub request into a message that names the problem and
 * what the visitor can do about it. The anonymous API's 60 requests/hour
 * limit makes 403/429 the most likely failure on this site by some distance.
 */
export function describeGitHubError(error: unknown): string {
  if (error instanceof TimeoutError) {
    return 'GitHub took too long to respond. Try again in a moment.';
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Could not reach GitHub. Check your connection, then try again.';
    }
    if (error.status === 403 || error.status === 429) {
      return 'GitHub\'s API rate limit has been reached. It resets within the hour.';
    }
    if (error.status >= 500) {
      return 'GitHub is having problems right now. Try again in a few minutes.';
    }
  }
  return 'GitHub returned an unexpected response. Try again in a moment.';
}

@Injectable({
  providedIn: 'root'
})
export class GitHubService {
  private readonly GITHUB_API = 'https://api.github.com';
  private readonly MAX_TECHNOLOGIES = 6;
  private readonly MAINTENANCE_THRESHOLD_MONTHS = 6;

  private readonly http = inject(HttpClient);

  /**
   * In-flight and completed requests, keyed by endpoint.
   *
   * The anonymous GitHub API allows 60 requests/hour. Without this, every
   * re-render or re-subscribe on the page would spend more of it on
   * identical data.
   */
  private readonly cache = new Map<string, Observable<unknown>>();

  /**
   * Share one request per key across all subscribers, for the session.
   *
   * A failed request evicts its own key, so failures are never cached and
   * `retry()` in the Work section can genuinely re-request. That is why
   * callers layer their catchError *outside* this helper rather than inside
   * the factory.
   */
  private cached<T>(key: string, factory: () => Observable<T>): Observable<T> {
    const existing = this.cache.get(key) as Observable<T> | undefined;
    if (existing) {
      return existing;
    }

    const shared = factory().pipe(
      // A stalled connection never errors on its own, which would leave every
      // caller in its loading state forever. Timing out turns it into an
      // ordinary failure: evicted below, surfaced to the UI, and retryable.
      timeout(REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => {
        this.cache.delete(key);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.cache.set(key, shared);
    return shared;
  }

  getUserProfile(username: string): Observable<UserProfile | null> {
    return this.cached(`profile:${username}`, () =>
      this.http.get<GitHubUser>(`${this.GITHUB_API}/users/${username}`)
        .pipe(map(user => this.transformUser(user)))
    ).pipe(
      catchError(error => {
        console.error('Error fetching GitHub user profile:', error);
        return of(null);
      })
    );
  }

  getPublicRepositories(
    username: string,
    options: { fallbackOnError?: boolean } = {}
  ): Observable<ProjectData[]> {
    return this.cached(`repos:${username}`, () =>
      this.http.get<GitHubRepo[]>(`${this.GITHUB_API}/users/${username}/repos?sort=updated&per_page=100`)
        .pipe(map(repos => this.transformRepos(repos)))
    ).pipe(
      catchError(error => {
        // The grid has a retry state; a failed fetch must surface as an
        // error with retry, never as an empty "no projects" state.
        if (options.fallbackOnError === false) return throwError(() => error);
        console.error('Error fetching GitHub repositories:', error);
        return of([]);
      })
    );
  }

  private transformUser(user: GitHubUser): UserProfile {
    return {
      username: user.login,
      name: user.name || user.login,
      bio: user.bio || '',
      avatarUrl: user.avatar_url,
      location: user.location || '',
      blog: user.blog || '',
      publicRepos: user.public_repos,
      followers: user.followers,
      following: user.following,
      joinDate: new Date(user.created_at)
    };
  }

  private transformRepos(repos: GitHubRepo[]): ProjectData[] {
    return repos
      .filter(repo => !repo.private && !repo.fork) // Only public, non-fork repos
      .map(repo => ({
        id: repo.id,
        title: repo.name,
        description: repo.description || 'No description available',
        githubUrl: repo.html_url,
        liveUrl: repo.homepage,
        technologies: this.getTechnologies(repo),
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language || 'Unknown',
        lastUpdated: new Date(repo.updated_at),
        status: this.getProjectStatus(repo)
      }))
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime()); // Most recently updated first
  }

  private getTechnologies(repo: GitHubRepo): string[] {
    const technologies: string[] = [];

    // Add primary language
    if (repo.language) {
      technologies.push(repo.language);
    }

    // Add topics as technologies
    if (repo.topics && repo.topics.length > 0) {
      technologies.push(...repo.topics);
    }

    return technologies.slice(0, this.MAX_TECHNOLOGIES);
  }

  private getProjectStatus(repo: GitHubRepo): 'active' | 'archived' | 'maintenance' {
    if (repo.archived) {
      return 'archived';
    }

    const lastUpdate = new Date(repo.pushed_at);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - this.MAINTENANCE_THRESHOLD_MONTHS);

    if (lastUpdate < sixMonthsAgo) {
      return 'maintenance';
    }

    return 'active';
  }
}
