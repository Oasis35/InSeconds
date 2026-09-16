import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../../core/services/language.service';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

@Component({
  selector: 'app-game-footer',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-footer.component.html',
})
export class GameFooterComponent {
  private readonly language = inject(LanguageService);
  private readonly playerSession = inject(PlayerSessionService);

  readonly currentLang = this.language.current;
  // L'icône admin n'a de sens que pour un compte avec le rôle IsAdmin — pour tout le
  // reste des visiteurs (dont la quasi-totalité des comptes liés, cf. admin-login.component.ts),
  // elle n'a aucune utilité et disparaît du footer.
  readonly isAdmin = this.playerSession.isAdmin;

  toggleLanguage(): void {
    this.language.use(this.currentLang() === 'fr' ? 'en' : 'fr');
  }
}
