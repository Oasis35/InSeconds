import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Message d'erreur affiché au joueur, avec le code d'erreur (traceId) quand il existe : c'est ce
 * code qu'il nous transmet, recherchable tel quel dans l'outil d'observabilité. La clé vient de
 * `errorMessageKey()` (core) : ce composant ne connaît pas la table des codes.
 */
@Component({
  selector: 'app-error-message',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="alert" class="rounded-xl px-4 py-3 text-sm"
      style="background:rgb(var(--rgb-danger) / 0.08);border:1px solid rgb(var(--rgb-danger) / 0.3);color:var(--text-body)">
      <p>{{ messageKey() | translate }}</p>
      @if (traceId(); as code) {
        <p class="mt-1 text-xs" style="color:var(--text-muted)">
          {{ 'errors.code' | translate }} <span class="font-mono select-all" data-testid="error-code">{{ code }}</span>
        </p>
      }
    </div>
  `,
})
export class ErrorMessageComponent {
  readonly messageKey = input.required<string>();
  readonly traceId = input<string | null>(null);
}
