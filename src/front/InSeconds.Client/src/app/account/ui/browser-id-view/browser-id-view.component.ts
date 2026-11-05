import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Identifiant court du navigateur (les 8 premiers caractères du joueur) et bouton pour copier l'identifiant complet. Centré par
 * défaut ; `spread` pousse l'identifiant à droite de son libellé (une ligne du panneau technique de l'admin).
 */
@Component({
  selector: 'app-browser-id-view',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2 text-xs" [class.justify-center]="!spread()" style="color:var(--text-faint)">
      <span [class.mr-auto]="spread()">{{ labelKey() | translate }}</span>
      <span class="font-mono" style="color:var(--text-muted)" data-testid="browser-id">{{ playerId().slice(0, 8) }}</span>
      <button type="button" class="underline hover:opacity-80" style="color:var(--text-muted)" [attr.title]="playerId()"
        (click)="copyId.emit()">
        {{ (copied() ? 'account.browserId.copied' : 'account.browserId.copy') | translate }}
      </button>
    </div>
  `,
})
export class BrowserIdViewComponent {
  readonly playerId = input.required<string>();
  readonly copied = input(false);
  readonly labelKey = input('account.browserId.label');
  readonly spread = input(false);

  readonly copyId = output();
}
