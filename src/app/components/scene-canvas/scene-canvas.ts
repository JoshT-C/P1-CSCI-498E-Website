import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject
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
          onDowngrade: reason => this.capability.downgrade(reason)
        });
      })
      .catch(() => this.capability.downgrade('scene-load-fail'));
  }

  ngOnDestroy(): void {
    this.handle?.dispose();
    this.handle = null;
  }
}
