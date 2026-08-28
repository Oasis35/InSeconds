import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy.component.html',
})
export class PrivacyComponent {
  protected readonly contactEmail = 'contact@inseconds.cc';
}
