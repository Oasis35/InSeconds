import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * La modération d'un pseudo inapproprié, dans la zone dépliée d'un compte (onglet Joueurs) : « Remettre le pseudo à zéro », puis une
 * confirmation sur place. L'API attribue un pseudo neutre, que la liste montre aussitôt. Le composant n'appelle rien : il émet, et se
 * referme quand l'attente se termine sans refus.
 */
@Component({
  selector: 'app-player-pseudo-reset',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-2', 'data-testid': 'pseudo-reset' },
  template: `
    @if (confirming()) {
      <span class="text-sm" style="color:var(--text-muted)">{{ 'admin.players.resetPseudoConfirm' | translate }}</span>
      <button type="button" data-testid="confirm-pseudo-reset" [disabled]="pending()" (click)="confirmed.emit()"
        class="px-3 py-1.5 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
        style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.players.resetPseudoYes' | translate }}</button>
      <button type="button" (click)="confirming.set(false)" [disabled]="pending()" class="px-2 py-1.5 text-sm underline" style="color:var(--text-muted)">
        {{ 'admin.players.resetPseudoCancel' | translate }}
      </button>
    } @else {
      <button type="button" data-testid="pseudo-reset-open" (click)="confirming.set(true)"
        class="px-3 py-1.5 rounded-(--radius-button) text-sm hover:opacity-80"
        style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.players.resetPseudo' | translate }}</button>
    }
    @if (errorKey(); as key) {
      <p class="basis-full text-sm" role="alert" data-testid="pseudo-reset-error" style="color:var(--text-error)">{{ key | translate }}</p>
    }
  `,
})
export class PlayerPseudoResetComponent {
  /** L'API n'a pas encore répondu à la remise à zéro. */
  readonly pending = input(false);
  /** La clé de traduction du refus de la dernière remise à zéro de ce compte, sinon `null`. */
  readonly errorKey = input<string | null>(null);
  readonly confirmed = output();

  protected readonly confirming = signal(false);

  constructor() {
    let wasPending = false;
    effect(() => {
      const pending = this.pending();
      const failed = this.errorKey() !== null;
      untracked(() => {
        if (wasPending && !pending && !failed) this.confirming.set(false);
        wasPending = pending;
      });
    });
  }
}
