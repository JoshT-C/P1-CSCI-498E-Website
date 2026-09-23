import { Component } from '@angular/core';
import { HeroComponent } from '../components/hero/hero';
import { ShellComponent } from '../components/shell/shell';

/** The page: the room (or the flat intro), then the session behind the glass. */
@Component({
  selector: 'app-home',
  imports: [HeroComponent, ShellComponent],
  templateUrl: './home.html'
})
export class HomeComponent {}
