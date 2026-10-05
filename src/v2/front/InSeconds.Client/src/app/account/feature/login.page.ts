import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ButtonComponent } from '../../ui/button/button.component';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { LoginStore } from '../data-access/login.store';
import { isPlausibleEmail } from '../domain/email';
import { AuthPageComponent } from '../ui/auth-page.component';

/**
 * `/account/login` : demande d'un lien de connexion par email. Après l'envoi, toujours le même
 * message, que l'adresse ait un compte ou non (l'API ne le dit pas non plus).
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

  /** Seule la présence d'un « @ » et d'un domaine est vérifiée ici ; le back fait le reste. */
  protected readonly loginForm = form(signal({ email: '' }), path => {
    validate(path.email, ({ value }) => (isPlausibleEmail(value()) ? null : { kind: 'email' }));
  });
  protected readonly showInvalid = signal(false);

  protected readonly errorKey = computed(() => {
    const error = this.store.error();
    return error ? errorMessageKey(error.code) : null;
  });

  protected submit(): void {
    const invalid = this.loginForm.email().invalid();
    this.showInvalid.set(invalid);
    if (invalid || this.store.isPending()) return;
    void this.store.requestLink(this.loginForm.email().value());
  }
}
