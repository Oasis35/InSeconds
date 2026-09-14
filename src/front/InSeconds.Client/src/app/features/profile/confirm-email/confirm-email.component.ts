import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../shared/decor-background/decor-background.component';
import { PlayerSessionService } from '../../../core/services/player-session.service';

type ConfirmState = 'idle' | 'confirming' | 'success' | 'invalidOrExpired' | 'emailTaken' | 'error' | 'missingToken';

// Écran /profile/confirm-email : ne consomme PAS le token automatiquement au chargement
// (mêmes scanners de sécurité email que /login/verify, cf. piège 21) — un bouton
// "Confirmer" explicite déclenche l'appel.
@Component({
  selector: 'app-confirm-email',
  imports: [RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-email.component.html',
})
export class ConfirmEmailComponent {
  private readonly playerSession = inject(PlayerSessionService);
  private readonly route = inject(ActivatedRoute);

  private readonly token = this.route.snapshot.queryParamMap.get('token');

  protected readonly state = signal<ConfirmState>(this.token ? 'idle' : 'missingToken');
  protected readonly confirmedEmail = signal<string | null>(null);

  confirm(): void {
    if (!this.token) return;
    this.state.set('confirming');
    this.playerSession.confirmEmailChange(this.token).subscribe({
      next: email => {
        this.confirmedEmail.set(email);
        this.state.set('success');
      },
      error: err => {
        if (err?.status === 409) {
          this.state.set('emailTaken');
        } else if (err?.status === 400) {
          this.state.set('invalidOrExpired');
        } else {
          this.state.set('error');
        }
      },
    });
  }
}
