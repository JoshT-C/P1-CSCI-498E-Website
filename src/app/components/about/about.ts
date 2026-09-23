import { Component } from '@angular/core';
import { SESSION_PROMPT } from '../../services/content/site';

@Component({
  selector: 'app-about',
  templateUrl: './about.html'
})
export class AboutComponent {
  readonly prompt = SESSION_PROMPT;
}
