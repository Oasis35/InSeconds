import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/**
 * L'événement de gel du jour d'un compte, en une ligne cyan sous la série dans la carte du résultat : « +1 gel gagné · 7 jours de série »
 * ou « 1 gel a sauvé ta série ». Une information, sans croix ni bouton.
 */
@Component({
  selector: 'app-streak-event-line',
  imports: [TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p class="flex items-center gap-2 pt-3.5 text-[13px] leading-snug" data-testid="streak-event"
      style="border-top:1px solid var(--border-medium);color:var(--text-hi)">
      <span class="shrink-0" style="color:var(--color-accent-2)"><app-streak-icon name="snowflake" size="16px" /></span>
      @if (kind() === 'earned') {
        <span>
          {{ 'daily.streakEvent.earned' | translate }}
          @if (streak() !== null) {
            <span style="color:var(--text-muted)"> · {{ 'daily.streakEvent.earnedDetail' | translate: { streak: streak() } }}</span>
          }
        </span>
      } @else {
        <span>{{ 'daily.streakEvent.used.' + (freezesUsed() === 1 ? 'one' : 'other') | translate: { n: freezesUsed() } }}</span>
      }
    </p>
  `,
})
export class StreakEventLineComponent {
  readonly kind = input.required<'earned' | 'used'>();
  /** La série en cours (dite après « +1 gel gagné »). */
  readonly streak = input<number | null>(null);
  readonly freezesUsed = input(1);
}
