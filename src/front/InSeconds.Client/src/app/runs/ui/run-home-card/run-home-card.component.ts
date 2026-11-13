import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { RunLevel } from '../../domain/run';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/**
 * La carte Setlist de l'accueil (V4), en deux tailles. **Discrète** tant que le défi du jour reste à jouer : le disque, « Setlist », le
 * record du joueur (« à toi quand tu veux ») ou sa setlist du jour, et « Jouer » / « Rejouer » en contour neutre. **En grand** une fois le
 * défi joué (contour orange) : le disque de son niveau, ses points, la jauge vers le disque suivant et « Nouvelle setlist » en action
 * principale, avec ce qui manque pour ce disque. Ouvre `/setlist`.
 */
@Component({
  selector: 'app-run-home-card',
  imports: [TranslatePipe, RouterLink, RunDiscComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (big()) {
      <section class="rounded-(--radius-card) px-5 py-4 flex flex-col gap-3" data-testid="run-home-card" data-size="big"
        style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--color-accent-3)">
        <div class="flex items-center gap-4">
          <app-run-disc class="shrink-0" [disc]="disc()" [size]="64" [shine]="false" />
          <div class="min-w-0">
            <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.welcome.title' | translate }}</h2>
            @if (level(); as level) {
              <p class="text-[15px]" style="color:var(--text-light)" data-testid="run-home-level">
                {{ level.disc.key | translate }} ·
                <b class="tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)">{{ format(level.points) }}</b>
              </p>
            } @else {
              <p class="text-[15px]" style="color:var(--text-light)" data-testid="run-home-tagline">{{ 'runs.welcome.tagline' | translate }}</p>
            }
          </div>
        </div>
        @if (level(); as level) {
          <div class="flex items-center gap-2.5" aria-hidden="true">
            <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:var(--bg-inactive)">
              <div class="h-full rounded-full" data-testid="run-home-bar" style="background:var(--color-accent-3)" [style.width.%]="level.progressPercent"></div>
            </div>
            @if (level.nextDisc; as next) {
              <app-run-disc class="shrink-0" [disc]="next.key" [size]="18" [shine]="false" />
            }
          </div>
        }
        <a appButton routerLink="/setlist" size="lg" [block]="true" class="flex-col gap-0!" data-testid="run-home-play">
          <span>{{ 'runs.level.newSetlist' | translate }}</span>
          @if (level()?.nextDisc; as next) {
            <span class="text-sm font-semibold normal-case tracking-normal" data-testid="run-home-next">
              {{ 'runs.level.next' | translate: { disc: (next.key | translate), points: format(level()?.pointsToNext ?? 0) } }}
            </span>
          }
        </a>
      </section>
    } @else {
      <section class="rounded-(--radius-card) px-5 py-3.5 flex items-center gap-3.5" data-testid="run-home-card" data-size="small"
        style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)">
        <app-run-disc class="shrink-0" [disc]="disc()" [size]="44" [shine]="false" />
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.welcome.title' | translate }}</h2>
          <p class="text-sm leading-snug" style="color:var(--text-light)" data-testid="run-home-line">
            @if (todayScore() !== null) {
              {{ 'runs.home.playedToday' | translate }}
              <span class="whitespace-nowrap">· <b class="tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ format(todayScore() ?? 0) }}</b></span>
            } @else if (record() !== null) {
              {{ 'runs.home.record' | translate }}
              <b class="tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)">{{ format(record() ?? 0) }}</b>
              · {{ 'runs.home.anytime' | translate }}
            } @else {
              {{ 'runs.welcome.tagline' | translate }}
            }
          </p>
        </div>
        <a appButton variant="neutral" routerLink="/setlist" class="shrink-0" data-testid="run-home-play">
          {{ (todayScore() !== null ? 'runs.home.replay' : 'runs.home.play') | translate }}
        </a>
      </section>
    }
  `,
})
export class RunHomeCardComponent {
  /** En grand : le défi du jour est joué, la Setlist devient le premier geste. */
  readonly big = input(false);
  /** Le niveau du joueur ; `null` avant sa première partie finie. */
  readonly level = input<RunLevel | null>(null);
  /** Son record ; `null` sans partie finie. */
  readonly record = input<number | null>(null);
  /** Le score de sa dernière setlist du jour ; `null` s'il n'en a pas fini aujourd'hui. */
  readonly todayScore = input<number | null>(null);
  readonly lang = input<'fr' | 'en'>('fr');

  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));
  /** Le disque de son niveau ; le disque d'or (ce qu'on vise) tant qu'il n'a pas de niveau. */
  protected readonly disc = computed(() => this.level()?.disc.key ?? 'runs.discs.gold');

  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
