import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Les millisecondes avant minuit UTC, l'heure où le défi du jour change. */
export function msUntilNextUtcMidnight(now: number): number {
  const day = 86_400_000;
  return day - (now % day);
}

/** « 06:12:40 » : un compte à rebours, heures comprises, sur deux chiffres. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

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
        style="border:2px solid var(--color-accent-2);background:rgb(var(--rgb-accent-2) / 0.10);border-radius:var(--radius-card)">
        <span class="min-w-0">
          <span class="block text-base font-extrabold" style="color:var(--text-hi)">{{ 'runs.v4.band.title' | translate }}</span>
          <span class="block text-sm" style="color:var(--color-accent-2)" data-testid="daily-left-time">
            {{ (hours() >= 1 ? 'runs.v4.band.leftHours' : 'runs.v4.band.leftMinutes') | translate: { n: hours() >= 1 ? hours() : minutes() } }}
          </span>
        </span>
        <span aria-hidden="true" class="text-2xl leading-none" style="color:var(--color-accent-2)">›</span>
      </a>
    } @else if (pending() === false) {
      <p class="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="daily-done-band"
        style="border:1px solid var(--border-subtle);border-radius:var(--radius-card);color:var(--text-light)">
        <span>{{ 'runs.v4.band.done' | translate }}</span>
        <span class="tabular-nums" style="font-family:var(--font-clock);font-weight:600;font-size:1.05rem;color:var(--color-accent-2)">{{ clock() }}</span>
      </p>
    }
  `,
})
export class RunDailyBandComponent {
  /** Le défi du jour reste à jouer ; `null` : on ne sait pas, rien n'est affiché. */
  readonly pending = input<boolean | null>(null);

  private readonly left = signal(msUntilNextUtcMidnight(Date.now()));
  protected readonly hours = computed(() => Math.floor(this.left() / 3_600_000));
  protected readonly minutes = computed(() => Math.max(1, Math.ceil(this.left() / 60_000)));
  protected readonly clock = computed(() => clockText(this.left()));

  constructor() {
    const timer = setInterval(() => this.left.set(msUntilNextUtcMidnight(Date.now())), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
