import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';

@Component({
  selector: 'app-legal-notice',
  imports: [RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-notice.component.html',
})
export class LegalNoticeComponent {
  protected readonly contactEmail = 'contact@inseconds.cc';
}
