import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { hintLabelKey } from '../domain/hint-label';
import { HintFact } from '../domain/track-round';

/**
 * Les indices : un bouton par niveau débloqué et pas encore révélé, puis ce que le back a révélé.
 * Le nombre de boutons vient des réglages (`HintPolicy`) et le contenu des indices du back : le
 * front n'invente aucun niveau. Prévient que chaque indice coûte des points.
 */
@Component({
  selector: 'app-hint-panel',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (levels().length > 0 || hints().length > 0) {
      <div class="flex flex-col gap-2" data-testid="hints">
        <p class="text-center text-xs font-semibold tracking-widest uppercase"
          style="font-family:var(--font-display);color:var(--text-faint);opacity:0.75">
          {{ 'gameplay.hint.costWarning' | translate }}
        </p>

        @for (fact of hints(); track $index) {
          <div class="w-full flex items-center gap-2 rounded-full px-3.5 py-2"
            style="min-height:40px;border:1.5px solid rgb(var(--rgb-violet) / 0.6);background:rgb(var(--rgb-violet) / 0.15)">
            <span class="flex items-center gap-1.5 text-xs font-bold uppercase shrink-0"
              style="font-family:var(--font-display);letter-spacing:0.08em;color:var(--color-violet)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 18h6"></path><path d="M10 22h4"></path>
                <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.6.61 1.2 1.42 1.41 2.5"></path>
              </svg>
              {{ labelKey(fact) | translate }}
            </span>
            <span class="flex-1 text-center font-semibold tracking-wide" style="color:var(--text-light);overflow-wrap:break-word">{{ fact.value }}</span>
          </div>
        }

        @for (level of levels(); track level) {
          <button type="button" (click)="request.emit(level)" [disabled]="pending()" [title]="'gameplay.hint.tooltip' | translate"
            class="w-full flex items-center justify-center gap-2 rounded-full transition active:scale-95 touch-manipulation disabled:opacity-60"
            style="min-height:40px;border:1.5px dashed rgb(var(--rgb-violet) / 0.5);background:transparent;color:var(--color-violet);font-family:var(--font-display);font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true">
              <path d="M9 18h6"></path><path d="M10 22h4"></path>
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.6.61 1.2 1.42 1.41 2.5"></path>
            </svg>
            {{ 'gameplay.hint.button' | translate: { level } }}
          </button>
        }
      </div>
    }
  `,
})
export class HintPanelComponent {
  /** Les niveaux qu'on peut demander (débloqués, pas encore révélés). */
  readonly levels = input<readonly number[]>([]);
  /** Ce que le back a révélé. */
  readonly hints = input<readonly HintFact[]>([]);
  /** Une demande est en cours : les boutons attendent. */
  readonly pending = input(false);
  readonly request = output<number>();

  protected readonly labelKey = (fact: HintFact): string => hintLabelKey(fact.kind);
}
