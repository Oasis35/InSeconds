import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../../core/services/language.service';
import { CookieConsentService } from '../../../../core/services/cookie-consent.service';

@Component({
  selector: 'app-game-footer',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-footer.component.html',
})
export class GameFooterComponent {
  private readonly language = inject(LanguageService);
  private readonly cookieConsent = inject(CookieConsentService);

  readonly currentLang = this.language.current;

  toggleLanguage(): void {
    this.language.use(this.currentLang() === 'fr' ? 'en' : 'fr');
  }

  manageCookies(): void {
    this.cookieConsent.showPreferences();
  }
}
