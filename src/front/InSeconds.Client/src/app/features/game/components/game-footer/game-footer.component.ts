import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly currentLang = this.language.current;
  readonly isLinked = this.playerSession.isLinked;
  readonly pseudo = this.playerSession.pseudo;

  toggleLanguage(): void {
    this.language.use(this.currentLang() === 'fr' ? 'en' : 'fr');
  }

  // Guest : navigue vers /login. Compte lié : navigue vers l'écran Profil dédié
  // (/profile) — la pop-up "compte connecté" a été remplacée par cet écran complet.
  onLoginIconClick(): void {
    this.router.navigateByUrl(this.isLinked() ? '/profile' : '/login');
  }

  loginTooltip(): string {
    return this.isLinked() ? (this.pseudo() ?? '') : this.translate.instant('footer.login');
  }
}
