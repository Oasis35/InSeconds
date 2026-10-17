import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, validate } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ButtonComponent } from '../../ui/button/button.component';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { LoginStore } from '../data-access/login.store';
import { isPlausibleEmail, suggestEmail } from '../domain/email';
import { resendSecondsLeft } from '../domain/resend';
import { AuthPageComponent } from '../ui/auth-page.component';

/** `?hint=existing` : le joueur vient de « J'ai déjà un compte » (écran du lien, adresse sans compte). */
export const EXISTING_ACCOUNT_HINT = 'existing';

/**
 * `/account/login` : demande d'un lien de connexion par email. Sous le champ, une correction du
 * domaine est proposée (`gmial.com` → `gmail.com`, liste fixe, sans requête). Après l'envoi,
 * toujours le même message, que l'adresse ait un compte ou non (l'API ne le dit pas non plus),
 * avec l'adresse saisie et « Renvoyer le lien » après le délai du back.
 */
@Component({
  selector: 'app-login-page',
  imports: [FormField, FormRoot, RouterLink, TranslatePipe, ButtonComponent, ErrorMessageComponent, AuthPageComponent],
  providers: [LoginStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
})
export class LoginPage {
  protected readonly store = inject(LoginStore);
  protected readonly existingAccountHint = inject(ActivatedRoute).snapshot.queryParamMap.get('hint') === EXISTING_ACCOUNT_HINT;

  /** Seule la présence d'un « @ » et d'un domaine est vérifiée ici ; le back fait le reste. */
  protected readonly loginForm = form(signal({ email: '' }), path => {
    validate(path.email, ({ value }) => (isPlausibleEmail(value()) ? null : { kind: 'email' }));
  });
  protected readonly showInvalid = signal(false);
  protected readonly suggestion = computed(() => suggestEmail(this.loginForm.email().value()));

  protected readonly heading = computed(() => (this.store.sentTo() === null ? 'account.login.title' : 'account.login.sentTitle'));
  protected readonly errorKey = computed(() => {
    const error = this.store.error();
    return error ? errorMessageKey(error.code) : null;
  });

  /** Horloge de l'écran, pour le compte à rebours avant « Renvoyer le lien ». */
  private readonly now = signal(Date.now());
  protected readonly resendIn = computed(() => resendSecondsLeft(this.store.sentAt(), this.now()));

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected applySuggestion(): void {
    const suggestion = this.suggestion();
    if (suggestion) this.loginForm.email().value.set(suggestion);
  }

  protected submit(): void {
    const invalid = this.loginForm.email().invalid();
    this.showInvalid.set(invalid);
    if (invalid || this.store.isPending()) return;
    void this.store.requestLink(this.loginForm.email().value());
  }

  protected async resend(): Promise<void> {
    if (this.resendIn() > 0 || this.store.isPending()) return;
    await this.store.resend();
    this.now.set(Date.now());
  }
}
