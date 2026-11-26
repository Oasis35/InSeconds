import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { enterHomeCard } from '../../../ui/motion/motion';
import { ButtonComponent } from '../../../ui/button/button.component';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { HomeLine, ReturnRecap, VALUE_MARKER, homeLine, splitPhrase } from '../../domain/home-line';
import { Streak, isStreakProtected, pluralKey } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * La carte du défi du jour sur l'accueil de la V4, tant qu'il reste à jouer : le bloc de l'accueil d'avant, centré (la date, « Blind test du jour »,
 * le nombre de morceaux, le chiffre à battre : le record du joueur en orange, sinon la médiane d'hier en violet), « plus que 6 h », « Commencer »,
 * puis le relevé de série dans la carte.
 * Une partie en pause (`completedCount`) remplace « Commencer » par « Reprendre » et propose « Abandonner » en lien discret. Le défi à jouer est la prochaine action : contour orange comme le bouton.
 */
@Component({
  selector: 'app-home-challenge-card',
  imports: [TranslatePipe, PointsPipe, ButtonComponent, StreakPillComponent, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <!-- Le bloc de l'accueil d'avant la V4 (date, titre, nombre de morceaux, chiffre à battre), centré, dans la tuile de focus. -->
    <section class="tube-amber rounded-(--radius-card) px-5 pt-7 pb-3 flex flex-col text-center" data-testid="home-challenge"
      style="background:var(--bg-surface)">
      <div class="flex flex-col items-center">
        @if (habit()) {
          <!-- L'habitué : la date et le nombre de morceaux sur une ligne, puis une phrase sur lui ; son libellé de bouton y répond. -->
          <p class="text-sm first-letter:uppercase" style="color:var(--text-muted)" data-testid="welcome-date">
            {{ dateLabel() }}<span aria-hidden="true"> · </span>{{ 'daily.welcome.subtitle' | translate: { count: trackCount() } }}
          </p>
          <h2 class="mt-1 text-[27px] font-extrabold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'daily.welcome.title' | translate: { count: trackCount() } }}</h2>
          @if (line(); as l) {
            @let parts = split(l.phraseKey | translate: { value: marker });
            <p class="mt-4 max-w-72 text-[18px] font-bold leading-snug" style="color:var(--text-hi)" data-testid="home-line">
              {{ parts.before }}@if (parts.hasValue) {<b class="tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ l.kind === 'eve' || l.kind === 'week' ? l.value : (l.value | appPoints) }}</b>}{{ parts.after }}
            </p>
          }
        } @else {
        @if (dateLabel()) {
          <p class="text-sm first-letter:uppercase" style="color:var(--text-muted)" data-testid="welcome-date">{{ dateLabel() }}</p>
        }
        <h2 class="mt-1.5 text-3xl font-extrabold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">
          {{ (paused() ? 'daily.resume.title' : 'daily.welcome.title') | translate: { count: trackCount() } }}
        </h2>
        @if (paused()) {
          <p class="mt-2.5 text-[15px]" style="color:var(--text-light)" data-testid="home-paused-progress">
            {{ progressKey() | translate: { done: completedCount(), total: trackCount() } }}
          </p>
        } @else {
          <p class="mt-2.5 text-[15px]" style="color:var(--text-light)">{{ 'daily.welcome.subtitle' | translate: { count: trackCount() } }}</p>
          @if (firstGame()) {
            <!-- Qui n'a jamais joué lit la règle en une phrase, rien de plus. -->
            <p class="mt-1.5 max-w-72 text-sm leading-snug" style="color:var(--text-muted)" data-testid="welcome-how-to">{{ 'daily.welcome.howTo' | translate }}</p>
          }
          @if (bestScore() !== null) {
            <!-- Le record du joueur (orange : c'est lui) ; jamais le meilleur score des autres, qui découragerait. -->
            <p class="mt-4.5 flex items-baseline gap-2 text-sm" style="color:var(--text-muted)" data-testid="welcome-record">
              {{ 'daily.welcome.record' | translate }}
              <b class="text-[17px] font-extrabold tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ bestScore() ?? 0 | appPoints }}</b>
            </p>
          } @else if (yesterdayMedian() !== null) {
            <!-- La médiane d'hier (violet : les autres joueurs), pour qui n'a pas encore de record. -->
            <p class="mt-4.5 flex items-baseline gap-2 text-sm" style="color:var(--text-muted)" data-testid="welcome-target">
              {{ 'daily.welcome.target' | translate }}
              <b class="text-[17px] font-extrabold tabular-nums" style="font-family:var(--font-score);color:var(--text-indigo)">{{ yesterdayMedian() ?? 0 | appPoints }}</b>
            </p>
          }
          @if (remaining(); as left) {
            <p class="mt-1.5 text-[13px]" style="color:var(--text-muted)" data-testid="home-remaining">
              {{ (left.unit === 'hours' ? 'daily.home.remainingHours' : 'daily.home.remainingMinutes') | translate: { n: left.value } }}
            </p>
          }
        }
        }
      </div>
      <button appButton type="button" size="lg" [block]="true" class="mt-7" (click)="startGame.emit()" data-testid="home-start">
        {{ buttonKey() | translate }}
      </button>
      @if (paused()) {
        <!-- Abandonner : un lien discret, jamais un second bouton (un seul bouton plein par écran). -->
        <button type="button" class="mt-3 self-center min-h-11 px-3 text-sm underline cursor-pointer touch-manipulation disabled:opacity-50"
          style="color:var(--text-light)" [disabled]="abandonLoading()" (click)="abandon.emit()" data-testid="home-abandon">
          {{ 'daily.resume.confirmAbandon' | translate }}
        </button>
      }
      <!-- La série sous le bouton qui la fait monter ; un toucher ouvre le panneau de série. -->
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
  /** De quoi accueillir un habitué (compte avec assez de parties) : la phrase et le libellé du bouton changent, la carte se resserre. */
  readonly recap = input<ReturnRecap | null>(null);
  /** La date du jour de jeu, en haut à droite de la carte. */
  readonly dateLabel = input('');
  /** Les morceaux déjà joués d'une partie en pause ; `null` : pas de partie en cours (la carte propose « Commencer »). */
  readonly completedCount = input<number | null>(null);
  /** Aucune partie finie : la règle en une phrase sous le nombre de morceaux. */
  readonly firstGame = input(false);
  readonly abandonLoading = input(false);
  readonly startGame = output<void>();
  readonly abandon = output<void>();
  readonly openStreak = output<void>();

  protected readonly marker = VALUE_MARKER;
  protected readonly split = splitPhrase;
  /** L'accueil d'un habitué : seulement pour la partie à jouer, jamais pour une partie en pause ni un premier jeu. */
  protected readonly habit = computed(() => this.recap() !== null && !this.paused() && !this.firstGame());
  protected readonly line = computed<HomeLine | null>(() =>
    this.habit() ? homeLine({ recap: this.recap(), bestScore: this.bestScore(), streak: this.streak(), today: new Date().toISOString().slice(0, 10) }) : null);
  protected readonly buttonKey = computed(() => (this.paused() ? 'daily.resume.resume' : this.line()?.buttonKey ?? (this.habit() ? 'daily.homeLine.default' : 'daily.welcome.start')));

  protected readonly paused = computed(() => this.completedCount() !== null);
  protected readonly progressKey = computed(() => `daily.resume.progress.${(this.completedCount() ?? 0) <= 1 ? 'one' : 'other'}`);
  protected readonly isProtected = computed(() => isStreakProtected(this.streak(), this.linked()));
  protected readonly protectedKey = computed(() => `daily.streakFreeze.protectedLine.${pluralKey(this.streak()?.missedDays ?? 1)}`);
}
