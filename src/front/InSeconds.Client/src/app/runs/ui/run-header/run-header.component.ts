import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandComponent } from '../../../ui/brand/brand.component';

/**
 * L'en-tête de la partie, le même que celui du défi : le logo IN//SECONDS à gauche et le lien « Abandonner » à droite (la page demande la
 * confirmation). Les vies, « Manche N » et le score sont dans le bloc du haut (`app-run-scoreboard`).
 */
@Component({
  selector: 'app-run-header',
  imports: [BrandComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand>
      <div brandRight>
        <button type="button" (click)="abandon.emit()" class="inline-flex items-center min-h-11 px-2 -mr-2 text-[13px] font-semibold underline underline-offset-4 touch-manipulation"
          style="color:var(--text-muted)" data-testid="run-abandon">
          {{ 'runs.header.abandon' | translate }}
        </button>
      </div>
    </app-brand>
  `,
})
export class RunHeaderComponent {
  readonly abandon = output();
}
