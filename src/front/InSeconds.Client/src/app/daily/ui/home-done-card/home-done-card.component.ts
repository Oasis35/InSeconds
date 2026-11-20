import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { enterHomeCard, fillBarsInTurn } from '../../../ui/motion/motion';
import { ShareButtonComponent } from '../../../gameplay/ui/share-button/share-button.component';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { trackBar } from '../day-result-screen/result-rows';
import { DayHighlightComponent } from '../day-highlight/day-highlight.component';
import { DayHistory } from '../../domain/daily';
import { Streak } from '../../domain/streak';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * La carte du défi du jour sur l'accueil une fois joué, **courte** : « Ton score du jour » et le compte à rebours, la partie en petites barres,
 * la phrase du moment fort (sinon « mieux que X % »), « Partager mon score », puis la série et « Voir le résultat », qui ouvre le résultat
 * complet (`/daily/resultat` : scores du jour, morceaux, profil, réponses d'hier). Tuile du moment (`focus`) tant que rien d'autre n'attend le
 * joueur : tube ambre et « Partager » plein ; quand une autre carte passe devant, une carte simple, « Partager » en contour.
 */
@Component({
  selector: 'app-home-done-card',
  imports: [TranslatePipe, PointsPipe, RouterLink, ShareButtonComponent, DayHighlightComponent, StreakPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 pt-5 pb-2 flex flex-col gap-3" data-testid="home-done" [class.tube-amber]="focus()"
      [style.border]="focus() ? null : '1px solid var(--border-medium)'" style="background:var(--bg-surface)">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-[13px] font-normal" style="font-family:var(--font-body);color:var(--text-muted)">{{ 'daily.result.yourScore' | translate }}</h2>
          <p class="tabular-nums whitespace-nowrap" data-testid="home-score"
            style="font-family:var(--font-score);font-size:clamp(2.4rem, 12vw, 3rem);font-weight:900;line-height:0.95;letter-spacing:-0.02em;color:var(--text-hi)">{{ score() !== null ? (score() ?? 0 | appPoints) : '-' }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-[13px]" style="color:var(--text-muted)">{{ 'daily.result.nextChallenge' | translate }}</p>
          <p class="tabular-nums" data-testid="countdown"
            style="font-family:var(--font-clock);font-size:1.35rem;font-weight:600;line-height:1.1;color:var(--core-cyan);text-shadow:0 0 2px rgb(var(--rgb-accent-2)),0 0 9px rgb(var(--rgb-accent-2) / 0.6)">{{ countdown() }}</p>
        </div>
      </div>
      @if (rows().length) {
        <!-- La partie en un coup d'œil, comme le texte partagé ; le détail est sur le résultat complet. -->
        <span class="flex gap-1" [attr.aria-label]="'daily.result.yourTracks' | translate: { count: rows().length }" role="img">
          @for (row of rows(); track row.position) {
            <span class="w-4 h-1.5 rounded-full" [style.background]="bar(row)" data-testid="track-bar" data-motion="score-bar"></span>
          }
        </span>
      }
      <app-day-highlight [rows]="rows()" [betterThanPercent]="betterThanPercent()" [history]="history()" [yourScore]="score()" />
      @if (score() !== null) {
        <app-share-button class="w-full mt-1" [variant]="focus() ? 'primary' : 'accent'" [copied]="shareCopied()" [failed]="shareFailed()" [disabled]="!canShare()" (share)="share.emit()" />
      }
      <div class="flex items-center justify-between gap-3">
        <app-streak-pill [streak]="streak()" [linked]="linked()" (open)="openStreak.emit()" />
        <a routerLink="/daily/resultat" class="ml-auto inline-flex items-center gap-1 min-h-11 text-sm" style="color:var(--text-light)" data-testid="home-see-result">
          {{ 'daily.home.seeResult' | translate }} <span aria-hidden="true">›</span>
        </a>
      </div>
    </section>
  `,
})
export class HomeDoneCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      enterHomeCard(this.host.nativeElement);
      fillBarsInTurn(Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-motion="score-bar"]')), 0.3);
    });
  }

  readonly score = input.required<number | null>();
  readonly rows = input.required<readonly TrackResultRow[]>();
  readonly countdown = input.required<string>();
  /** Le relevé de série et de gels, sous le partage (rien sans série en cours). */
  readonly streak = input<Streak | null>(null);
  readonly linked = input(false);
  /** « Mieux que X % » quand la partie n'a pas de moment fort ; vide sous 5 joueurs. */
  readonly betterThanPercent = input<number | null>(null);
  /** Ce que l'historique du joueur permet de dire quand les autres joueurs du jour ne suffisent pas. */
  readonly history = input<DayHistory | null>(null);
  /** La carte est la tuile du moment (tube ambre, « Partager » plein) ; faux quand une autre carte passe devant (un seul focus par écran). */
  readonly focus = input(true);
  /** Langue des badges Deezer de la liste des morceaux. */
  readonly lang = input<'fr' | 'en'>('fr');
  readonly canShare = input(true);
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly share = output<void>();
  readonly openStreak = output<void>();

  protected readonly bar = trackBar;
}
