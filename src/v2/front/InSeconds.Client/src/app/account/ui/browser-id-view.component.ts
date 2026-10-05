import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Identifiant court du navigateur (les 8 premiers caractères du joueur) et bouton pour copier l'identifiant complet. */
@Component({
  selector: 'app-browser-id-view',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-center gap-2 text-xs" style="color:var(--text-faint)">
      <span>{{ 'account.browserId.label' | translate }}</span>
      <span class="font-mono" style="color:var(--text-muted)" data-testid="browser-id">{{ playerId().slice(0, 8) }}</span>
      <button type="button" class="underline hover:opacity-80" style="color:var(--text-muted)" [attr.title]="playerId()"
        (click)="copy.emit()">
        {{ (copied() ? 'account.browserId.copied' : 'account.browserId.copy') | translate }}
      </button>
    </div>
  `,
})
export class BrowserIdViewComponent {
  readonly playerId = input.required<string>();
  readonly copied = input(false);

  readonly copy = output();
}
