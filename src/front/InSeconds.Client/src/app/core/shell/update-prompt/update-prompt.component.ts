import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { VersionService } from '../../version/version.service';

/**
 * Bandeau « une nouvelle version est disponible » avec un bouton pour recharger. En secours seulement :
 * d'habitude `VersionService` recharge tout seul au premier moment sûr. Il s'affiche quand le service
 * worker est dans un état irrécupérable, ou quand le garde-fou anti-boucle bloque un rechargement
 * automatique ; chaque affichage est remonté avec sa raison (`UpdatePrompt:`).
 */
@Component({
  selector: 'app-update-prompt',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (version.updateAvailable()) {
      <div role="status" data-testid="update-prompt"
        class="fixed inset-x-0 top-0 z-[80] flex justify-center px-4 pt-3 pointer-events-none">
        <div class="pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-2xl toast-enter"
          style="background:var(--bg-surface-2);border:1px solid var(--color-accent-2);color:var(--text-body)">
          <span class="flex-1">{{ 'shell.update.body' | translate }}</span>
          <button appButton type="button" size="sm" (click)="version.reload()">{{ 'shell.update.reload' | translate }}</button>
          <button appButton type="button" size="sm" variant="ghost" (click)="version.dismiss()">{{ 'shell.update.later' | translate }}</button>
        </div>
      </div>
    }
  `,
})
export class UpdatePromptComponent {
  protected readonly version = inject(VersionService);
}
