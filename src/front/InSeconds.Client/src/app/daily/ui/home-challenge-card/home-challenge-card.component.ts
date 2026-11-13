import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { enterHomeCard } from '../../../ui/motion/motion';
import { ButtonComponent } from '../../../ui/button/button.component';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { Streak, isStreakProtected, pluralKey } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * La carte du défi du jour sur l'accueil de la V4, tant qu'il reste à jouer : « Défi du jour » et la date, le nombre de morceaux, le chiffre à battre
 * (le record du joueur en orange, sinon la médiane d'hier en violet) suivi de « plus que 6 h », « Commencer », puis le relevé de série dans la carte.
 * Le défi à jouer est la prochaine action : contour orange comme le bouton.
 */
@Component({
  selector: 'app-home-challenge-card',
  imports: [TranslatePipe, PointsPipe, ButtonComponent, StreakPillComponent, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 pt-5 pb-3 flex flex-col" data-testid="home-challenge"
      style="background:var(--bg-surface);border:1.5px solid var(--color-accent-3)">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-sm" style="color:var(--text-light)">{{ 'daily.home.label' | translate }}</p>
        @if (dateLabel()) {
          <p class="text-sm first-letter:uppercase text-right" style="color:var(--text-light)" data-testid="welcome-date">{{ dateLabel() }}</p>
        }
      </div>
      <h2 class="text-2xl font-extrabold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">
        {{ 'daily.welcome.subtitle' | translate: { count: trackCount() } }}
      </h2>
      @if (bestScore() !== null || yesterdayMedian() !== null || remaining()) {
        <p class="mt-3 flex flex-wrap items-baseline gap-x-2 text-[15px]" style="color:var(--text-light)">
          @if (bestScore() !== null) {
            <span data-testid="welcome-record">{{ 'daily.welcome.record' | translate }}
              <b class="text-lg font-extrabold tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ bestScore() ?? 0 | appPoints }}</b></span>
          } @else if (yesterdayMedian() !== null) {
            <span data-testid="welcome-target">{{ 'daily.welcome.target' | translate }}
              <b class="text-lg font-extrabold tabular-nums" style="font-family:var(--font-score);color:var(--text-indigo)">{{ yesterdayMedian() ?? 0 | appPoints }}</b></span>
          }
          @if (remaining(); as left) {
            <span data-testid="home-remaining">@if (bestScore() !== null || yesterdayMedian() !== null) { · }{{ (left.unit === 'hours' ? 'daily.home.remainingHours' : 'daily.home.remainingMinutes') | translate: { n: left.value } }}</span>
          }
        </p>
      }
      <button appButton type="button" size="lg" [block]="true" class="mt-4" (click)="startGame.emit()" data-testid="home-start">
        {{ 'daily.welcome.start' | translate }}
      </button>
      <div class="flex flex-col items-center pt-1">
        <app-streak-pill [streak]="streak()" [linked]="linked()" (open)="openStreak.emit()" />
        @if (isProtected()) {
          <p data-testid="frozen-line" class="flex items-center justify-center gap-1.5 pb-2 text-[13px] leading-normal" style="color:var(--color-accent-2)">
            <app-streak-icon name="snowflake" />
            <span>{{ protectedKey() | translate: { n: streak()?.missedDays } }}</span>
          </p>
        }
      </div>
    </section>
  `,
})
export class HomeChallengeCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => enterHomeCard(this.host.nativeElement));
  }

  readonly trackCount = input.required<number>();
  readonly streak = input<Streak | null>(null);
  readonly linked = input.required<boolean>();
  /** Le meilleur score du joueur sur ses parties terminées (vide sans partie terminée). */
  readonly bestScore = input<number | null>(null);
  /** La médiane d'hier, montrée seulement sans record (vide sous 5 joueurs). */
  readonly yesterdayMedian = input<number | null>(null);
  /** Le temps qu'il reste pour jouer le défi, `null` tant qu'il n'est pas calculé. */
  readonly remaining = input<{ readonly unit: 'hours' | 'minutes'; readonly value: number } | null>(null);
  /** La date du jour de jeu, en haut à droite de la carte. */
  readonly dateLabel = input('');
  readonly startGame = output<void>();
  readonly openStreak = output<void>();

  protected readonly isProtected = computed(() => isStreakProtected(this.streak(), this.linked()));
  protected readonly protectedKey = computed(() => `daily.streakFreeze.protectedLine.${pluralKey(this.streak()?.missedDays ?? 1)}`);
}
