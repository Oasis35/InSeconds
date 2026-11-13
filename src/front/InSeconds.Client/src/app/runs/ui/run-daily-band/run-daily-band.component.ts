import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * La bande du bas de la fin d'une Setlist (V4), pour que le défi du jour ne soit jamais oublié. **Défi à jouer** : une vraie carte cyan (le
 * temps), « Le défi du jour t'attend · plus que 6 h », qui y mène. **Défi joué** : une ligne discrète, « Défi du jour terminé · prochain dans »
 * et son compte à rebours. Le jour change à minuit UTC.
 */
@Component({
  selector: 'app-run-daily-band',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (pending()) {
      <a routerLink="/daily" data-testid="daily-left" class="flex items-center justify-between gap-3 px-4 py-4 touch-manipulation"
        style="border:1.5px solid rgb(var(--rgb-accent-2) / 0.7);background:transparent;border-radius:var(--radius-card)">
        <span class="min-w-0">
          <span class="block text-base font-extrabold" style="color:var(--text-hi)">{{ 'runs.v4.band.title' | translate }}</span>
          <span class="block text-sm" style="color:var(--color-accent-2)" data-testid="daily-left-time">
            {{ (left().unit === 'hours' ? 'runs.v4.band.leftHours' : 'runs.v4.band.leftMinutes') | translate: { n: left().value } }}
          </span>
        </span>
        <span aria-hidden="true" class="text-2xl leading-none" style="color:var(--color-accent-2)">›</span>
      </a>
    } @else if (pending() === false) {
      <p class="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="daily-done-band"
        style="border:1px solid var(--border-subtle);border-radius:var(--radius-card);color:var(--text-light)">
        <span class="min-w-0">{{ 'runs.v4.band.done' | translate }}</span>
        <span class="tabular-nums" style="font-family:var(--font-clock);font-weight:600;font-size:1.05rem;color:var(--color-accent-2)">{{ clock() }}</span>
      </p>
    }
  `,
})
export class RunDailyBandComponent {
  /** Le défi du jour reste à jouer ; `null` : on ne sait pas, rien n'est affiché. */
  readonly pending = input<boolean | null>(null);

  /** Le temps qui reste avant le prochain défi, en phrase (`timeLeft`) et en `hh:mm:ss` (`formatCountdown`), donnés par la page. */
  readonly left = input.required<{ readonly unit: 'hours' | 'minutes'; readonly value: number }>();
  readonly clock = input.required<string>();
}
