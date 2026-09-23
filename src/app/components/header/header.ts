import { Component, inject } from '@angular/core';
import { SceneSyncService } from '../../services/scene-sync.service';

/** The header's links are shortcuts into the shell: ShellService turns a
 *  click on any section link into typing and running its command. */
@Component({
  selector: 'app-header',
  templateUrl: './header.html'
})
export class HeaderComponent {
  // The section on screen, so the nav marks where the reader already is.
  readonly activeSection = inject(SceneSyncService).activeSection;
}
