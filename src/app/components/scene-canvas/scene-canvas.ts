import {
  Component,
  DestroyRef,
  ElementRef,
  INJECTOR,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  untracked,
  type Injector
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CapabilityService, type Tier } from '../../services/capability.service';
import { SceneSyncService } from '../../services/scene-sync.service';
import { SECTION_DOM_ID } from '../../config/site.config';
import type { SceneHandle } from '../../../scenes/bootstrap';

/**
 * The page's one persistent, fixed canvas.
 *
 * CSS is the default tier; the scene is created only once CapabilityService
 * has chosen `room` or `desk`, and only then is the bootstrap module — and
 * with it three.js — lazily imported, after first render. A downgrade
 * (lost frame budget, lost context, failed chunk) disposes the scene and,
 * if the new tier is still 3D, builds the smaller one.
 */
@Component({
  selector: 'app-scene-canvas',
  host: { 'aria-hidden': 'true' },
  template: '<div class="scene-host"></div>'
})
export class SceneCanvasComponent {
  private readonly capability = inject(CapabilityService);
  private readonly sync = inject(SceneSyncService);
  // Captured here (a valid injection context) and passed to the lazy scene,
  // which runs from an import .then callback where inject() would throw.
  private readonly injector = inject<Injector>(INJECTOR);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private handle: SceneHandle | null = null;
  private built: Tier = 'css';
  private rendered = false;

  constructor() {
    afterNextRender(() => {
      this.rendered = true;
      this.build(this.capability.tier());
    });
    effect(() => {
      const tier = this.capability.tier();
      if (this.rendered) untracked(() => this.build(tier));
    });
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  private teardown(): void {
    this.handle?.dispose();
    this.handle = null;
    this.built = 'css';
    this.sync.setPortal(null);
    this.sync.setHover(null);
  }

  private build(tier: Tier): void {
    if (!this.isBrowser || tier === this.built) return;
    this.teardown();
    if (tier === 'css') return;
    this.built = tier;
    import('../../../scenes/bootstrap')
      .then(bootstrap => {
        // a downgrade can land while the chunk is still loading
        if (this.capability.tier() !== tier || this.built !== tier) return;
        const host = this.el.nativeElement.querySelector<HTMLElement>('.scene-host');
        const intro = document.getElementById(SECTION_DOM_ID.hero);
        if (!host || !intro) return;
        this.handle = bootstrap.createScene({
          host,
          intro,
          tier,
          sync: this.sync,
          injector: this.injector,
          onDowngrade: reason => this.capability.downgrade(reason),
          onPick: (station, item) => this.sync.openStation(station, item),
          onHover: (station, x, y) => this.sync.setHover(station ? { station, x, y } : null),
          onPortal: inside => this.sync.setPortal(inside)
        });
      })
      .catch((err: unknown) => {
        // the downgrade is the recovery; the warning keeps the cause visible
        console.warn('[scene] 3D failed to start, stepping down:', err);
        this.capability.downgrade('scene-load-fail');
      });
  }
}
