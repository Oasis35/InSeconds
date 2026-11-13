import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { enterHomeCard } from '../../../ui/motion/motion';
import { ButtonComponent } from '../../../ui/button/button.component';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { TimeLeft } from '../../domain/countdown';
import { Streak, isStreakProtected, pluralKey } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * La carte du défi du jour sur l'accueil de la V4, tant qu'il reste à jouer : « Défi du jour », le nombre de morceaux, le chiffre à battre
 * (le record du joueur en orange, sinon la médiane d'hier en violet), au retour dans la journée la ligne cyan « Il te reste le défi du
 * jour · plus que 6 h » qui respire, « Commencer », puis le relevé de série dans la carte.
 */
@Component({
  selector: 'app-home-challenge-card',
  imports: [TranslatePipe, PointsPipe, ButtonComponent, StreakPillComponent, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 pt-5 pb-3 flex flex-col" data-testid="home-challenge"
      style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)">
      <p class="text-sm" style="color:var(--text-light)">{{ 'daily.home.label' | translate }}</p>
      <h2 class="text-2xl font-extrabold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">
        {{ 'daily.welcome.subtitle' | translate: { count: trackCount() } }}
      </h2>
      @if (bestScore() !== null) {
        <p class="mt-3 flex items-baseline gap-2 text-[15px]" style="color:var(--text-light)" data-testid="welcome-record">
          {{ 'daily.welcome.record' | translate }}
          <b class="text-lg font-extrabold tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ bestScore() ?? 0 | appPoints }}</b>
        </p>
      } @else if (yesterdayMedian() !== null) {
        <p class="mt-3 flex items-baseline gap-2 text-[15px]" style="color:var(--text-light)" data-testid="welcome-target">
          {{ 'daily.welcome.target' | translate }}
          <b class="text-lg font-extrabold tabular-nums" style="font-family:var(--font-score);color:var(--text-indigo)">{{ yesterdayMedian() ?? 0 | appPoints }}</b>
        </p>
      }
      @if (remaining(); as left) {
        <p class="breathe mt-3 flex items-center gap-2 text-[15px] font-semibold" style="color:var(--color-accent-2)" data-testid="home-remaining">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true" class="shrink-0"><circle cx="12" cy="14" r="8" /><path d="M12 10v4l2 2M10 2h4" /></svg>
          <span>{{ (left.unit === 'hours' ? 'daily.home.remainingHours' : 'daily.home.remainingMinutes') | translate: { n: left.value } }}</span>
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
  styles: `
    .breathe { animation: home-breathe 2.6s ease-in-out infinite; }
    @keyframes home-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
    @media (prefers-reduced-motion: reduce) { .breathe { animation: none; } }
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
  /** Le temps qu'il reste pour jouer le défi, au retour dans la journée ; `null` à la première visite du jour. */
  readonly remaining = input<TimeLeft | null>(null);
  readonly startGame = output<void>();
  readonly openStreak = output<void>();

  protected readonly isProtected = computed(() => isStreakProtected(this.streak(), this.linked()));
  protected readonly protectedKey = computed(() => `daily.streakFreeze.protectedLine.${pluralKey(this.streak()?.missedDays ?? 1)}`);
}
