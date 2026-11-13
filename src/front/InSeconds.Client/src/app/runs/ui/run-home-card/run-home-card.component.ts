import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { RunLevel } from '../../domain/run';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/** L'échelle des disques, du plus bas au plus haut : la rangée de la carte (le disque du joueur y est plus gros). */
export const DISC_LADDER: readonly string[] = [
  'runs.discs.scratched', 'runs.discs.wax', 'runs.discs.bronze', 'runs.discs.silver',
  'runs.discs.gold', 'runs.discs.platinum', 'runs.discs.double_platinum', 'runs.discs.diamond',
];

/**
 * La carte Setlist de l'accueil (V4), **toujours compacte** : le disque du joueur, « Setlist » et son niveau (« Disque d'argent · à ton rythme »,
 * sinon la promesse), la rangée des huit disques où le sien est plus gros, la jauge vers le disque suivant avec ses deux bornes, et « Jouer »
 * (« Rejouer » après une setlist du jour). Tant que le défi du jour reste à jouer, la carte est discrète (contour neutre, bouton en contour) ;
 * **une fois le défi joué (`active`), c'est la prochaine action** : contour orange et « Jouer » en bouton principal. Ouvre `/setlist`.
 */
@Component({
  selector: 'app-run-home-card',
  imports: [TranslatePipe, RouterLink, RunDiscComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 py-4 flex flex-col gap-3" data-testid="run-home-card" [attr.data-active]="active()"
      style="background:rgb(var(--rgb-surface) / 0.55)"
      [style.border]="active() ? '1px solid var(--color-accent-3)' : '1px solid var(--border-subtle)'">
      <div class="flex items-center gap-3.5">
        <app-run-disc class="shrink-0" [disc]="disc()" [size]="52" [shine]="false" />
        <div class="min-w-0 flex-1">
          <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.welcome.title' | translate }}</h2>
          <p class="text-sm leading-snug" style="color:var(--text-light)" data-testid="run-home-line">
            @if (todayScore() !== null) {
              {{ 'runs.home.playedToday' | translate }}
              <span class="whitespace-nowrap">· <b class="tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ format(todayScore() ?? 0) }}</b></span>
            } @else if (level(); as level) {
              {{ 'runs.home.levelLine' | translate: { disc: (level.disc.key | translate) } }}
            } @else if (record() !== null) {
              {{ 'runs.home.record' | translate }}
              <b class="tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ format(record() ?? 0) }}</b>
              · {{ 'runs.home.anytime' | translate }}
            } @else {
              {{ 'runs.welcome.tagline' | translate }}
            }
          </p>
        </div>
      </div>

      @if (level(); as level) {
        <div class="flex flex-col gap-2" data-testid="run-home-level">
          <!-- La rangée des huit disques : celui du joueur plus gros, les disques à venir éteints. -->
          <div class="flex items-center justify-between gap-1" aria-hidden="true" data-testid="run-home-ladder">
            @for (key of ladder; track key; let i = $index) {
              <app-run-disc [disc]="key" [size]="i === ladderIndex() ? 22 : 13" [shine]="false" [style.opacity]="i <= ladderIndex() ? 1 : 0.28" />
            }
          </div>
          <div class="h-1.5 rounded-full overflow-hidden" style="background:var(--bg-inactive)" aria-hidden="true">
            <div class="h-full rounded-full" data-testid="run-home-bar" style="background:var(--color-accent-3)" [style.width.%]="level.progressPercent"></div>
          </div>
          <div class="flex justify-between text-xs tabular-nums" style="color:var(--text-light)">
            <span>{{ level.disc.key | translate }} · {{ format(level.points) }}</span>
            @if (level.nextDisc; as next) {
              <span data-testid="run-home-next">{{ next.key | translate }} · {{ format(level.points + (level.pointsToNext ?? 0)) }}</span>
            }
          </div>
        </div>
      }

      @if (active()) {
        <a appButton routerLink="/setlist" size="lg" [block]="true" data-testid="run-home-play">
          {{ (todayScore() !== null ? 'runs.home.replay' : 'runs.home.play') | translate }}
        </a>
      } @else {
        <div class="flex justify-end">
          <a appButton variant="neutral" routerLink="/setlist" data-testid="run-home-play">
            {{ (todayScore() !== null ? 'runs.home.replay' : 'runs.home.play') | translate }}
          </a>
        </div>
      }
    </section>
  `,
})
export class RunHomeCardComponent {
  /** Le défi du jour est joué : la Setlist devient le premier geste (contour orange, « Jouer » en bouton principal). */
  readonly active = input(false);
  /** Le niveau du joueur ; `null` avant sa première partie finie. */
  readonly level = input<RunLevel | null>(null);
  /** Son record ; `null` sans partie finie. */
  readonly record = input<number | null>(null);
  /** Le score de sa dernière setlist du jour ; `null` s'il n'en a pas fini aujourd'hui. */
  readonly todayScore = input<number | null>(null);
  readonly lang = input<'fr' | 'en'>('fr');

  protected readonly ladder = DISC_LADDER;
  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));
  /** Le disque de son niveau ; le disque d'or (ce qu'on vise) tant qu'il n'a pas de niveau. */
  protected readonly disc = computed(() => this.level()?.disc.key ?? 'runs.discs.gold');
  protected readonly ladderIndex = computed(() => DISC_LADDER.indexOf(this.disc()));

  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
