import { Component } from '@angular/core';
import { ACTIVE_BACKEND } from '../../services/content/homelab';
import { STACK } from '../../services/content/projects';

/** `ai status` and the stack notes, as terminal output. */
@Component({
  selector: 'app-ai-stack',
  templateUrl: './ai-stack.html'
})
export class AiStackComponent {
  readonly STACK = STACK;
  /** The backend the machine keeps loaded day to day. */
  readonly loaded = ACTIVE_BACKEND;
}
