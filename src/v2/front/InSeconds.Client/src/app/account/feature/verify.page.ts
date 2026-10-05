import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, validate } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { SessionStore } from '../../core/session/session.store';
import { ButtonComponent } from '../../ui/button/button.component';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { VerifyStore } from '../data-access/verify.store';
import { pseudoIssue } from '../domain/pseudo';
import { AuthPageComponent } from '../ui/auth-page.component';

/**
 * `/account/login/verify?token=…` : confirmation de la connexion. Ne consomme jamais le jeton à
 * l'ouverture (piège 21 : les scanners d'emails pré-visitent les liens) : un clic sur « Confirmer »
 * le fait. Un navigateur déjà connecté est prévenu (piège 30) : le lien d'une autre adresse ouvre un
 * autre compte, sans toucher à celui-ci.
 */
@Component({
  selector: 'app-verify-page',
  imports: [FormField, FormRoot, RouterLink, TranslatePipe, ButtonComponent, ErrorMessageComponent, AuthPageComponent],
  providers: [VerifyStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify.page.html',
})
export class VerifyPage {
  protected readonly store = inject(VerifyStore);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');

  protected readonly pseudoForm = form(signal({ pseudo: '' }), path => {
    validate(path.pseudo, ({ value }) => (pseudoIssue(value()) === null ? null : { kind: 'pseudo' }));
  });
  /** Le pseudo saisi est refusé avant l'envoi (mêmes règles que le back). */
  private readonly pseudoRejected = signal(false);
  /** Le joueur a retapé depuis le dernier envoi : les messages sur l'ancienne saisie ne valent plus. */
  private readonly pseudoEdited = signal(false);
  protected readonly pseudoInvalid = computed(() => !this.pseudoEdited() && (this.pseudoRejected() || this.pseudoProblem() === 'invalid'));
  protected readonly pseudoTaken = computed(() => !this.pseudoEdited() && this.pseudoProblem() === 'taken');

  /** Adresse du compte déjà ouvert dans ce navigateur, s'il y en a un. */
  protected readonly connectedEmail = computed(() => (this.session.isLinked() ? this.session.player()?.email ?? null : null));
  protected readonly step = this.store.step;
  /** Une fois à l'étape du pseudo, l'écran y reste pendant l'envoi (sinon il repasserait un instant sur « Confirmer »). */
  private readonly inPseudoStep = signal(false);
  protected readonly view = computed<'missing-token' | 'invalid-link' | 'pseudo' | 'confirm'>(() => {
    const kind = this.step().kind;
    if (kind === 'missing-token' || kind === 'invalid-link') return kind;
    // Un échec réseau à l'étape du pseudo y laisse le joueur (saisie conservée) au lieu de le ramener à « Confirmer ».
    return kind === 'needs-pseudo' || ((kind === 'confirming' || kind === 'failed') && this.inPseudoStep()) ? 'pseudo' : 'confirm';
  });
  protected readonly pseudoProblem = computed(() => {
    const step = this.step();
    return step.kind === 'needs-pseudo' ? step.problem : 'none';
  });
  protected readonly failureKey = computed(() => errorMessageKey(this.store.error()?.code));

  constructor() {
    this.store.open(this.token);
  }

  protected async confirm(): Promise<void> {
    if (!this.token) return;
    await this.store.confirm(this.token);
    await this.leaveIfDone();
  }

  protected editPseudo(): void {
    this.pseudoEdited.set(true);
    this.pseudoRejected.set(false);
  }

  protected async submitPseudo(): Promise<void> {
    if (!this.token || this.step().kind === 'confirming') return;
    const invalid = this.pseudoForm.pseudo().invalid();
    this.pseudoEdited.set(false);
    this.pseudoRejected.set(invalid);
    if (invalid) return;
    this.inPseudoStep.set(true);
    await this.store.submitPseudo(this.token, this.pseudoForm.pseudo().value());
    await this.leaveIfDone();
  }

  private async leaveIfDone(): Promise<void> {
    if (this.step().kind === 'done') await this.router.navigateByUrl('/');
  }
}
