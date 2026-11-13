import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { enterHomeCard, fillBarsInTurn } from '../../../ui/motion/motion';
import { ShareButtonComponent } from '../../../gameplay/ui/share-button/share-button.component';
import { TrackResultRow, TrackResultsListComponent } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { trackBar } from '../day-result-screen/result-rows';
import { DayHighlightComponent } from '../day-highlight/day-highlight.component';
import { Streak } from '../../domain/streak';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * La carte du défi du jour sur l'accueil de la V4, une fois joué : « Défi du jour » (sans « fait » ni date), le score, une petite barre par morceau, le
 * compte à rebours du prochain défi, la phrase du moment fort, « Détail » qui déplie les morceaux sur place et « Partager mon score » en contour orange : la
 * Setlist prend la place principale dessous. La série et les gels ne sont montrés que dans le détail déplié, centrés au-dessus des morceaux.
 */
@Component({
  selector: 'app-home-done-card',
  imports: [TranslatePipe, PointsPipe, ShareButtonComponent, TrackResultsListComponent, DayHighlightComponent, StreakPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 py-4 flex flex-col gap-3" data-testid="home-done"
      style="background:var(--bg-surface);border:1px solid var(--border-subtle)">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-sm font-normal" style="font-family:var(--font-body);color:var(--text-light)">{{ 'daily.home.done' | translate }}</h2>
          <p class="tabular-nums" data-testid="home-score"
            style="font-family:var(--font-score);font-size:2.4rem;font-weight:900;line-height:1;letter-spacing:-0.02em;color:var(--text-hi)">{{ score() !== null ? (score() ?? 0 | appPoints) : '-' }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-sm" style="color:var(--text-light)">{{ 'daily.result.nextChallenge' | translate }}</p>
          <p class="tabular-nums" data-testid="countdown"
            style="font-family:var(--font-clock);font-size:1.25rem;font-weight:600;line-height:1.2;color:var(--core-cyan);text-shadow:0 0 2px rgb(var(--rgb-accent-2)),0 0 9px rgb(var(--rgb-accent-2) / 0.6)">{{ countdown() }}</p>
        </div>
      </div>
      <!-- La partie en un coup d'œil ; un toucher déplie les morceaux sous la phrase (le score d'un morceau ouvre sa pop-up avec le graphique). -->
      @if (rows().length) {
        <button type="button" (click)="showTracks.set(!showTracks())" [attr.aria-expanded]="showTracks()" data-testid="home-tracks-toggle"
          [attr.aria-label]="'daily.result.yourTracks' | translate: { count: rows().length }"
          class="self-start flex items-center gap-2.5 min-h-11 -my-2 touch-manipulation cursor-pointer">
          <span class="flex gap-1" aria-hidden="true">
            @for (row of rows(); track row.position) {
              <span class="w-4 h-1.5 rounded-full" [style.background]="bar(row)" data-testid="track-bar" data-motion="score-bar"></span>
            }
          </span>
          <span class="flex items-center gap-1 text-[13px]" style="color:var(--text-muted)" aria-hidden="true">
            {{ (showTracks() ? 'daily.result.hideTracks' : 'daily.result.showTracks') | translate }}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="transition-transform" [class.rotate-180]="showTracks()"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </button>
      }
      <app-day-highlight [rows]="rows()" [betterThanPercent]="betterThanPercent()" />
      @if (showTracks()) {
        <div class="-mx-5" style="border-top:1px solid var(--border-medium);border-bottom:1px solid var(--border-medium)" data-testid="home-tracks">
          <!-- La série et les gels vivent dans le détail, centrés au-dessus des morceaux : rien tant qu'aucune série n'est en cours. -->
          <div class="flex justify-center border-b" style="border-color:var(--border-medium)">
            <app-streak-pill [streak]="streak()" [linked]="linked()" (open)="openStreak.emit()" />
          </div>
          <app-track-results-list [rows]="rows()" [lang]="lang()" />
        </div>
      }
      @if (score() !== null) {
        <app-share-button class="w-full" variant="accent" [copied]="shareCopied()" [failed]="shareFailed()" [disabled]="!canShare()" (share)="share.emit()" />
      }
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
  /** Le relevé de série et de gels, dans le détail déplié (la série est celle du défi). */
  readonly streak = input<Streak | null>(null);
  readonly linked = input(false);
  /** « Mieux que X % » quand la partie n'a pas de moment fort ; vide sous 5 joueurs. */
  readonly betterThanPercent = input<number | null>(null);
  /** Langue des badges Deezer de la liste des morceaux. */
  readonly lang = input<'fr' | 'en'>('fr');
  readonly canShare = input(true);
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly share = output<void>();
  readonly openStreak = output<void>();

  protected readonly showTracks = signal(false);

  protected readonly bar = trackBar;
}
