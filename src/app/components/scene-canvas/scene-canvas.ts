import { Component, inject } from '@angular/core';
import { CapabilityService } from '../../services/capability.service';

/**
 * The page's one persistent, fixed, pointer-transparent canvas.
 *
 * T0 (now): an empty host. CapabilityService has already decided
 * data-render by the time this renders, so the CSS either shows the host
 * (3d) or hides it (css) — and in css mode the designed fallbacks take over.
 *
 * T1: when capability.render() === '3d', lazily import('scenes/bootstrap')
 * here so the ~150 kB three.js chunk loads after first paint.
 */
@Component({
  selector: 'app-scene-canvas',
  host: { 'aria-hidden': 'true' },
  template: '<div class="scene-host"></div>'
})
export class SceneCanvasComponent {
  readonly capability = inject(CapabilityService);
}
