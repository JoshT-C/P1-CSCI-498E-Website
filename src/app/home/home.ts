import { Component } from '@angular/core';
import { HeroComponent } from '../components/hero/hero';
import { WorkComponent } from '../components/work/work';
import { AiStackComponent } from '../components/ai-stack/ai-stack';
import { AboutComponent } from '../components/about/about';
import { ContactComponent } from '../components/contact/contact';

@Component({
  selector: 'app-home',
  imports: [HeroComponent, WorkComponent, AiStackComponent, AboutComponent, ContactComponent],
  templateUrl: './home.html'
})
export class HomeComponent {}
