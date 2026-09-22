import { Component } from '@angular/core';
import { RevealDirective } from '../../directives/reveal.directive';

@Component({
  selector: 'app-contact',
  imports: [RevealDirective],
  templateUrl: './contact.html'
})
export class ContactComponent {}
