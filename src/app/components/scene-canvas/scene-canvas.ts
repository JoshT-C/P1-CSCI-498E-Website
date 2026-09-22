import {
  AfterViewInit,
  Component,
  ElementRef,
  INJECTOR,
  OnDestroy,
  PLATFORM_ID,
  inject,
  type Injector
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CapabilityService } from '../../services/capability.service';
import { SceneSyncService } from '../../services/scene-sync.service';
import type { SceneHandle } from '../../../scenes/bootstrap';

/**
 * The page's one persistent, fixed, pointer-transparent canvas.
 *
 * CSS is the default render mode; the scene is only created once
 * CapabilityService has decided '3d', and only then is the bootstrap
 * module — and with it three.js — lazily imported, after first paint.
 *
 * Every failure path downgrades to the CSS fallback (the shippable dark
 * site) instead of leaving a dead canvas: WebGL unavailable or lost, the
 * runtime losing the fps budget, or the chunk itself failing to load.
 */
@Component({
  selector: 'app-scene-canvas',
  host: { 'aria-hidden': 'true' },
  template: '<div class="scene-host"></div>'
})
export class SceneCanvasComponent implements AfterViewInit, OnDestroy {
  private readonly capability = inject(CapabilityService);
  private readonly sync = inject(SceneSyncService);
  // Captured here (a valid injection context) and passed to the lazy scene,
  // which runs from an import .then callback where inject() would throw.
  private readonly injector = inject<Injector>(INJECTOR);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private handle: SceneHandle | null = null;

  ngAfterViewInit(): void {
    if (!this.isBrowser || this.capability.render() !== '3d') return;
    import('../../../scenes/bootstrap')
      .then(bootstrap => {
        // a downgrade can land while the chunk is still loading
        if (this.capability.render() !== '3d') return;
        const host = this.el.nativeElement.querySelector<HTMLElement>('.scene-host');
        if (!host) return;
        this.handle = bootstrap.createScene({
          host,
          sync: this.sync,
          injector: this.injector,
          onDowngrade: reason => this.capability.downgrade(reason)
        });
      })
      .catch((err: unknown) => {
        // the downgrade is the recovery; the warning keeps the cause visible
        console.warn('[scene] 3D failed to start, using CSS fallback:', err);
        this.capability.downgrade('scene-load-fail');
      });
  }

  ngOnDestroy(): void {
    this.handle?.dispose();
    this.handle = null;
  }
}
