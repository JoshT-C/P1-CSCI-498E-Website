import { Component, inject } from '@angular/core';
import { SceneSyncService } from '../../services/scene-sync.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.html'
})
export class HeaderComponent {
  // The section in view, so the nav marks where the reader already is.
  readonly activeSection = inject(SceneSyncService).activeSection;
}
