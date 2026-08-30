import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../../core/services/language.service';
import { PlayerSessionService } from '../../../../core/services/player-session.service';
import { ConfirmSheetComponent } from '../../../../shared/confirm-sheet/confirm-sheet.component';

@Component({
  selector: 'app-game-footer',
  imports: [RouterLink, TranslatePipe, ConfirmSheetComponent],
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

  protected readonly showAccountSheet = signal(false);
  protected readonly loggingOut = signal(false);

  toggleLanguage(): void {
    this.language.use(this.currentLang() === 'fr' ? 'en' : 'fr');
  }

  // Guest : navigue vers /login. Compte lié : ouvre la pop-up "compte connecté"
  // (plus de déconnexion directe au clic — évite une déconnexion accidentelle
  // sur ce qui est un point d'entrée discret, sans libellé visible).
  onLoginIconClick(): void {
    if (!this.isLinked()) {
      this.router.navigateByUrl('/login');
      return;
    }

    this.showAccountSheet.set(true);
  }

  confirmLogout(): void {
    this.loggingOut.set(true);
    this.playerSession.logout().subscribe(() => {
      this.playerSession.load().subscribe(() => {
        this.loggingOut.set(false);
        this.showAccountSheet.set(false);
      });
    });
  }

  closeAccountSheet(): void {
    this.showAccountSheet.set(false);
  }

  loginTooltip(): string {
    return this.isLinked() ? (this.pseudo() ?? '') : this.translate.instant('footer.login');
  }
}
