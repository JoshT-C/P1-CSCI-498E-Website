import { Component } from '@angular/core';
import { SITE_META } from '../../services/content/site';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.html'
})
export class FooterComponent {
  readonly meta = SITE_META;
}
