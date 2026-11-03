import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { AUTO_NEXT_MS } from '../../domain/run';

/**
 * « Morceau suivant » (ou « Voir le résultat ») en contour neutre : quand la partie s'enchaîne seule, un trait se remplit en bas du bouton
 * pendant l'attente ; un toucher n'attend pas.
 */
@Component({
  selector: 'app-run-next-button',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" appButton variant="neutral" [block]="true" (click)="next.emit()" data-testid="run-next-track"
      class="relative overflow-hidden">
      {{ (endsRun() ? 'runs.answer.seeResult' : 'runs.answer.next') | translate }}
      @if (auto()) {
        <span class="next-progress absolute left-0 bottom-0 h-[2px] w-full origin-left" style="background:var(--text-hi)"
          [style.animation-duration.ms]="duration" aria-hidden="true"></span>
      }
    </button>
  `,
  styles: `
    .next-progress { animation-name: next-fill; animation-timing-function: linear; animation-fill-mode: both; }
    @keyframes next-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  `,
})
export class RunNextButtonComponent {
  /** Le prochain clic mène à la fin de la partie. */
  readonly endsRun = input(false);
  /** L'enchaînement automatique est armé : le trait se remplit. */
  readonly auto = input(false);
  readonly next = output();

  protected readonly duration = AUTO_NEXT_MS;
}
