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

  // Guest : navigue vers /login. Compte lié : déconnexion directe (pas de
  // navigation nécessaire) — volontairement pas de confirmation supplémentaire,
  // cohérent avec un point d'entrée discret plutôt qu'une action visible.
  onLoginIconClick(): void {
    if (!this.isLinked()) {
      this.router.navigateByUrl('/login');
      return;
    }

    this.playerSession.logout().subscribe(() => this.playerSession.load().subscribe());
  }

  loginTooltip(): string {
    return this.isLinked()
      ? `${this.pseudo()} · ${this.translate.instant('footer.logout')}`
      : this.translate.instant('footer.login');
  }
}
