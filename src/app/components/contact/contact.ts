import { Component } from '@angular/core';
import { SESSION_PROMPT } from '../../services/content/site';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.html'
})
export class ContactComponent {
  readonly prompt = SESSION_PROMPT;
}
