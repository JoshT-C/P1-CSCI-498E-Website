import { Component, computed, inject } from '@angular/core';
import { SceneSyncService, type StationId } from '../../services/scene-sync.service';

const LABELS: Record<StationId, string> = {
  terminal: 'terminal · go in',
  rack: 'rack · the homelab',
  floppies: 'floppies · more projects',
  whiteboard: 'whiteboard · architecture',
  laptop: 'laptop · secondary stack'
};

/**
 * The phosphor tag that follows the pointer over a prop in the room. Purely
 * a pointer affordance: keyboard and screen-reader users have the station
 * nav, so this is aria-hidden.
 */
@Component({
  selector: 'app-hover-label',
  host: { 'aria-hidden': 'true' },
  template: `
    @if (hover(); as h) {
      <div class="hover-label mono" [style.transform]="'translate(' + (h.x + 18) + 'px, ' + (h.y + 14) + 'px)'">
        <span class="hover-label__bracket">[</span>{{ text() }}<span class="hover-label__bracket">]</span>
      </div>
    }
  `
})
export class HoverLabelComponent {
  readonly hover = inject(SceneSyncService).hover;
  readonly text = computed(() => {
    const h = this.hover();
    return h ? LABELS[h.station] : '';
  });
}
