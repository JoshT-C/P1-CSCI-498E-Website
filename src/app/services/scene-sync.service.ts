import { Injectable, signal } from '@angular/core';

/**
 * Bridges DOM scroll state to the 3D scene.
 *
 * Section components run IntersectionObservers and report here; the scene
 * reads these signals each frame. In CSS fallback mode the same
 * signals drive the data-active attributes on the stack bars, so both
 * render paths stay in lockstep.
 */
@Injectable({ providedIn: 'root' })
export class SceneSyncService {
  /** Index of the curated work card currently in view, or -1. */
  readonly activeWorkIndex = signal(-1);
  /** Index of the model table row currently in view, or -1. */
  readonly activeModelIndex = signal(-1);
  /** The section currently in view (hero/work/stack/about/contact). */
  readonly activeSection = signal<string>('hero');
  /** GitHub grid titles, for the screen's `ls ~/projects` output. */
  readonly workProjects = signal<readonly string[]>([]);

  setActiveWorkIndex(index: number): void {
    this.activeWorkIndex.set(index);
  }

  setActiveModelIndex(index: number): void {
    this.activeModelIndex.set(index);
  }

  setActiveSection(section: string): void {
    this.activeSection.set(section);
  }

  setWorkProjects(titles: readonly string[]): void {
    this.workProjects.set(titles);
  }
}
