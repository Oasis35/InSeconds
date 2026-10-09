import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Witness, WitnessTone } from '../domain/actions';

const TONES: Record<WitnessTone, { icon: string; color: string }> = {
  ok: { icon: '✅', color: 'var(--color-success)' },
  warn: { icon: '⚠️', color: 'var(--color-warn)' },
  error: { icon: '❌', color: 'var(--text-error)' },
  running: { icon: '⏳', color: 'var(--text-body)' },
  none: { icon: '•', color: 'var(--text-muted)' },
};

/**
 * Témoin d'une tâche planifiée (onglet Actions) : son dernier passage (date et heure locales, compte rendu ou erreur),
 * le prochain essai après un échec, et le prochain passage planifié. En lecture seule : la relancer se fait dans `/jobs`.
 */
@Component({
  selector: 'app-job-witness',
  imports: [DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1">
      <h2 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ titleKey() | translate }}</h2>
      @if (failed()) {
        <p class="text-sm" role="status" style="color:var(--text-error)">{{ 'admin.actions.witness.loadError' | translate }}</p>
      } @else if (witness(); as w) {
        <p class="text-sm" role="status" [style.color]="tone().color" data-testid="job-witness-message">
          <span aria-hidden="true">{{ tone().icon }}</span>
          {{ 'admin.actions.witness.' + w.key | translate: params() }}
        </p>
        @if (w.retryAt; as retryAt) {
          <p class="text-xs" style="color:var(--text-body)">
            {{ 'admin.actions.witness.retry' | translate: { date: (retryAt | date:'dd/MM/yy'), time: (retryAt | date:'HH:mm') } }}
          </p>
        }
        @if (nextRunAt(); as next) {
          <p class="text-xs" style="color:var(--text-muted)">
            {{ 'admin.actions.witness.next' | translate: { date: (next | date:'dd/MM/yy'), time: (next | date:'HH:mm') } }}
          </p>
        }
      }
    </div>
  `,
})
export class JobWitnessComponent {
  readonly titleKey = input.required<string>();
  /** `null` tant que les derniers passages ne sont pas lus. */
  readonly witness = input<Witness | null>(null);
  readonly nextRunAt = input<string | null>(null);
  /** La lecture des derniers passages a échoué. */
  readonly failed = input(false);

  // Formats numériques (JJ/MM/AA, HH:MM) : la locale par défaut d'Angular suffit, comme le pipe `date` du gabarit.
  private readonly datePipe = new DatePipe('en-US');

  protected readonly tone = computed(() => TONES[this.witness()?.tone ?? 'none']);

  /** Les nombres du compte rendu, et la date et l'heure du passage au format de l'écran (JJ/MM/AA, HH:MM). */
  protected readonly params = computed(() => {
    const w = this.witness();
    if (!w) return {};
    return {
      ...w.counts,
      date: w.at ? this.datePipe.transform(w.at, 'dd/MM/yy') : '',
      time: w.at ? this.datePipe.transform(w.at, 'HH:mm') : '',
    };
  });
}
