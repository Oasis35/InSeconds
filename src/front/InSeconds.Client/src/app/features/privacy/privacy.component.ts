import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';
import { CookieConsentService } from '../../core/services/cookie-consent.service';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy.component.html',
})
export class PrivacyComponent {
  private readonly cookieConsent = inject(CookieConsentService);

  protected readonly contactEmail = 'monsupermail.new@gmail.com';

  manageCookies(): void {
    this.cookieConsent.showPreferences();
  }
}
