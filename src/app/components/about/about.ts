import { Component } from '@angular/core';
import { RevealDirective } from '../../directives/reveal.directive';

@Component({
  selector: 'app-about',
  imports: [RevealDirective],
  templateUrl: './about.html'
})
export class AboutComponent {}
