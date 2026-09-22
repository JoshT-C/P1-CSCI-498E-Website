import { Component } from '@angular/core';
import { RevealDirective } from '../../directives/reveal.directive';

@Component({
  selector: 'app-hero',
  imports: [RevealDirective],
  templateUrl: './hero.html'
})
export class HeroComponent {}
