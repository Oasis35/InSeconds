import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, validate } from '@angular/forms/signals';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../shared/decor-background/decor-background.component';
import { ApiClient } from '../../../api/api.generated';
import { PlayerSessionService } from '../../../core/services/player-session.service';

const PSEUDO_PATTERN = /^[\p{L}\p{N} _.-]{3,20}$/u;

type VerifyState = 'idle' | 'confirming' | 'needsPseudo' | 'pseudoTaken' | 'invalidPseudo' | 'error' | 'missingToken';

// Écran /login/verify : ne consomme PAS le token automatiquement au chargement
// (certains scanners de sécurité email pré-visitent les liens des mails avant
// le vrai clic humain) — un bouton "Confirmer" explicite déclenche l'appel.
@Component({
  selector: 'app-verify-login',
  imports: [FormField, FormRoot, RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-login.component.html',
})
export class VerifyLoginComponent {
  private readonly api = inject(ApiClient);
  private readonly playerSession = inject(PlayerSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly token = this.route.snapshot.queryParamMap.get('token');

  protected readonly state = signal<VerifyState>(this.token ? 'idle' : 'missingToken');
  /** Choix du pseudo : mêmes caractères autorisés que le back (allowlist), sans espaces autour. */
  protected readonly pseudoForm = form(signal({ pseudo: '' }), p => {
    validate(p.pseudo, ({ value }) => (PSEUDO_PATTERN.test(value().trim()) ? null : { kind: 'pseudo' }));
  });

  // Navigateur déjà connecté à un compte : on prévient avant de confirmer. Un lien envoyé à
  // une autre adresse connecte à un autre compte (le compte actuel n'est jamais modifié, cf.
  // AccountLinkingService) — et un lien reçu de quelqu'un d'autre ne doit pas être confirmé.
  protected readonly connectedEmail = computed(() =>
    this.playerSession.isLinked() ? this.playerSession.email() : null
  );

  confirm(): void {
    if (!this.token) return;
    this.verify(undefined);
  }

  submitPseudo(): void {
    if (!this.token) return;
    if (this.pseudoForm.pseudo().invalid()) {
      this.state.set('invalidPseudo');
      return;
    }
    this.verify(this.pseudoForm.pseudo().value().trim());
  }

  private verify(pseudo: string | undefined): void {
    this.state.set('confirming');
    this.api.apiAuthMagicLinkVerify({ token: this.token!, pseudo }).subscribe({
      next: res => {
        if (res.needsPseudo) {
          this.state.set('needsPseudo');
          return;
        }
        this.playerSession.load().subscribe(() => {
          this.router.navigateByUrl('/');
        });
      },
      error: err => {
        if (err?.status === 409) {
          this.state.set('pseudoTaken');
        } else if (err?.status === 400 || err?.status === 403) {
          this.state.set('error');
        } else {
          this.state.set('error');
        }
      },
    });
  }
}
