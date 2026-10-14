import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';

/**
 * Avis « l'adresse a changé, pense à mettre à jour ton favori », affiché quand on arrive par
 * l'ancienne adresse du front (cf. `consumeLegacyUrlFlag`). Repris de la v1, ouvert par
 * `ModalService` (focus, Échap, fond cliquable et `role="dialog"` fournis par le CDK Dialog).
 */
@Component({
  selector: 'app-legacy-url-notice',
  imports: [TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // En bloc : resté inline autour du cadre de la fenêtre, Chromium le donnait au-dessus de « J'ai compris » dans
  // `elementsFromPoint`, et Playwright refusait le clic (E2E legacy-urls, #317).
  host: { class: 'block' },
  templateUrl: './legacy-url-notice.component.html',
})
export class LegacyUrlNoticeComponent {
  protected readonly ref = inject(DialogRef);
}
