import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ButtonComponent } from '../../ui/button/button.component';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { ConfirmEmailStore } from '../data-access/confirm-email.store';
import { AuthPageComponent } from '../ui/auth-page.component';

/**
 * `/account/confirm-email?token=…` : confirmation du changement d'email, depuis le lien reçu à la
 * nouvelle adresse. Ne consomme jamais le jeton à l'ouverture (piège 21) : un clic sur
 * « Confirmer » le fait.
 */
@Component({
  selector: 'app-confirm-email-page',
  imports: [RouterLink, TranslatePipe, ButtonComponent, ErrorMessageComponent, AuthPageComponent],
  providers: [ConfirmEmailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-page [heading]="'account.confirmEmail.title' | translate">
      @if (!token) {
        <p class="text-sm" style="color:var(--text-muted)">{{ 'account.confirmEmail.missingToken' | translate }}</p>
      } @else if (store.isFulfilled()) {
        <p class="text-sm" style="color:var(--text-muted)">
          {{ 'account.confirmEmail.success' | translate: { email: store.confirmedEmail() } }}
        </p>
      } @else {
        <p class="text-sm leading-relaxed" style="color:var(--text-muted)">{{ 'account.confirmEmail.subtitle' | translate }}</p>
        @if (store.error(); as error) {
          <app-error-message [messageKey]="errorKey()" [traceId]="error.traceId" />
        }
        <button appButton type="button" [block]="true" [disabled]="store.isPending()" (click)="confirm()">
          {{ (store.isPending() ? 'account.confirmEmail.confirming' : 'account.confirmEmail.confirm') | translate }}
        </button>
      }
      <a routerLink="/account/profile" class="inline-block text-sm" style="color:var(--text-accent)">
        {{ 'account.confirmEmail.backToProfile' | translate }}
      </a>
    </app-auth-page>
  `,
})
export class ConfirmEmailPage {
  protected readonly store = inject(ConfirmEmailStore);
  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');

  protected readonly errorKey = computed(() => errorMessageKey(this.store.error()?.code));

  protected confirm(): void {
    if (this.token && !this.store.isPending()) void this.store.confirm(this.token);
  }
}
