import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { formatOrdinal } from '../../../ui/format/ordinal';
import { enterHomeCard, lightLadder, slideBanner } from '../../../ui/motion/motion';
import { RunLevel, RunReceivedChallenge, daysLeft } from '../../domain/run';
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
  imports: [TranslatePipe, RouterLink, NgTemplateOutlet, RunDiscComponent, ButtonComponent],
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
              {{ 'runs.home.levelLabel' | translate }} <b style="color:var(--text-hi)">{{ shortName(level.disc.key) | translate }}</b> · {{ 'runs.home.rhythm' | translate }}
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

      @if (received(); as challenge) {
        <!-- Le défi d'un ami : violet (les autres joueurs), refusable par la croix. -->
        <div class="flex items-center gap-1 pl-2.5 rounded-(--radius-button)" data-testid="run-home-received" data-motion="received"
          style="background:rgb(var(--rgb-violet) / 0.14);border:1px solid rgb(var(--rgb-violet) / 0.6)">
          <a [routerLink]="['/setlist', challenge.code]" class="min-w-0 flex-1 flex items-center gap-3 min-h-14 py-2" data-testid="run-home-received-link" style="color:var(--text-hi)">
            <span class="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-base font-bold" aria-hidden="true"
              style="background:rgb(var(--rgb-violet) / 0.55);color:var(--text-hi)">{{ initial(challenge.authorPseudo) }}</span>
            <span class="min-w-0">
              <span class="block text-[15px] font-bold break-words">
                {{ (challenge.authorPseudo ? 'runs.home.receivedFrom' : 'runs.home.receivedFromGuest') | translate: { name: challenge.authorPseudo } }}
                @if (challenge.scoreToBeat !== null) {
                  <span class="font-bold tabular-nums" data-testid="run-home-received-score">· {{ 'runs.home.receivedScore' | translate: { score: format(challenge.scoreToBeat) } }}</span>
                }
              </span>
              <span class="block text-sm" style="color:var(--text-light)" data-testid="run-home-received-days">{{ 'runs.home.receivedExpires' | translate: { days: days() } }}</span>
            </span>
          </a>
          <button type="button" (click)="dismissReceived.emit(challenge.code)" data-testid="run-home-received-dismiss"
            class="shrink-0 inline-flex items-center justify-center w-11 h-11 cursor-pointer touch-manipulation" style="color:var(--text-light)"
            [attr.aria-label]="'runs.home.receivedDismiss' | translate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      }

      @if (level(); as level) {
        <div class="flex flex-col gap-2" data-testid="run-home-level">
          <!-- La rangée des huit disques : celui du joueur plus gros, les disques à venir éteints. -->
          <div class="flex items-center justify-between gap-1" aria-hidden="true" data-testid="run-home-ladder">
            @for (key of ladder; track key; let i = $index) {
              <app-run-disc data-motion="ladder-disc" [disc]="key" [size]="i === ladderIndex() ? 22 : 13" [shine]="false" [style.opacity]="i <= ladderIndex() ? 1 : 0.28" />
            }
          </div>
          <div class="h-1.5 rounded-full overflow-hidden" style="background:var(--bg-inactive)" aria-hidden="true">
            <div class="h-full rounded-full" data-testid="run-home-bar" style="background:var(--color-accent-3)" [style.width.%]="level.progressPercent"></div>
          </div>
          <div class="flex justify-between text-xs tabular-nums" style="color:var(--text-light)">
            <span>{{ shortName(level.disc.key) | translate }} · {{ format(level.points) }}</span>
            @if (level.nextDisc; as next) {
              <span data-testid="run-home-next">{{ shortName(next.key) | translate }} · {{ format(level.points + (level.pointsToNext ?? 0)) }}</span>
            }
          </div>
        </div>
      }

      <!-- « 2e dans Potes · 14e au général » : la place, une seule fois, sous la jauge ; « Jouer » à sa droite tant que le défi du jour est à jouer. -->
      <ng-template #place>
        @if (groupPlace() || generalRank() !== null) {
          <p class="min-w-0 text-[15px]" data-testid="run-home-place" style="color:var(--text-light)">
            @if (groupPlace(); as group) { {{ 'runs.home.placeGroup' | translate: { rank: groupRankText() } }} <b style="color:var(--text-hi)">{{ group.name }}</b> }
            @if (groupPlace() && generalRank() !== null) { · }
            @if (generalRank() !== null) { {{ 'runs.home.placeGeneral' | translate: { rank: generalRankText() } }} }
          </p>
        }
      </ng-template>
      @if (active()) {
        <ng-container [ngTemplateOutlet]="place" />
        @if (received(); as challenge) {
          <a appButton [routerLink]="['/setlist', challenge.code]" size="lg" [block]="true" data-testid="run-home-play">
            {{ 'runs.home.takeUp' | translate }}
          </a>
        } @else {
          <a appButton routerLink="/setlist" size="lg" [block]="true" data-testid="run-home-play">
            {{ (todayScore() !== null ? 'runs.home.replay' : 'runs.home.play') | translate }}
          </a>
        }
      } @else {
        <div class="flex items-center justify-between gap-3">
          <ng-container [ngTemplateOutlet]="place" />
          <a appButton variant="neutral" routerLink="/setlist" class="ml-auto" data-testid="run-home-play">
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
  /** Le défi d'un ami en attente ; `null` sans défi. */
  readonly received = input<RunReceivedChallenge | null>(null);
  /** L'heure d'aujourd'hui, pour les jours qui restent au défi (injectée pour les tests). */
  readonly now = input<Date>(new Date());
  /** Sa meilleure place dans ses groupes (« 2e dans Potes ») ; `null` sans groupe ou sans partie finie. */
  readonly groupPlace = input<{ readonly name: string; readonly rank: number } | null>(null);
  /** Sa place au classement général, s'il a choisi d'y apparaître ; `null` sinon. */
  readonly generalRank = input<number | null>(null);
  /** Le joueur refuse le défi (la croix) : le code de la playlist. */
  readonly dismissReceived = output<string>();

  protected readonly ladder = DISC_LADDER;
  protected readonly days = computed(() => {
    const challenge = this.received();
    return challenge ? daysLeft(challenge.expiresAt, this.now()) : 0;
  });
  protected readonly groupRankText = computed(() => formatOrdinal(this.groupPlace()?.rank ?? 0, this.lang()));
  protected readonly generalRankText = computed(() => formatOrdinal(this.generalRank() ?? 0, this.lang()));

  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));
  /** Le disque de son niveau ; le disque d'or (ce qu'on vise) tant qu'il n'a pas de niveau. */
  protected readonly disc = computed(() => this.level()?.disc.key ?? 'runs.discs.gold');
  protected readonly ladderIndex = computed(() => DISC_LADDER.indexOf(this.disc()));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // La carte arrive après celle du défi, puis les disques de l'échelle s'allument un à un.
    afterNextRender(() => {
      enterHomeCard(this.host.nativeElement, 0.12);
      lightLadder(this.host.nativeElement, 0.6);
      const banner = this.host.nativeElement.querySelector<HTMLElement>('[data-motion="received"]');
      if (banner) slideBanner(banner, 0.5);
    });
  }

  /** Le nom court d'un disque (« Argent ») : sa clé de traduction, celle de `runs.discShort`. */
  protected shortName(key: string): string {
    return key.replace('runs.discs.', 'runs.discShort.');
  }

  protected initial(pseudo: string | null): string {
    return (pseudo?.trim()[0] ?? '?').toUpperCase();
  }

  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
