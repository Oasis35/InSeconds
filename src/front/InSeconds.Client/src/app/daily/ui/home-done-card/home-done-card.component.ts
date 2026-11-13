import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { enterHomeCard, fillBarsInTurn } from '../../../ui/motion/motion';
import { ShareButtonComponent } from '../../../gameplay/ui/share-button/share-button.component';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { trackBar } from '../day-result-screen/result-rows';
import { Streak } from '../../domain/streak';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * La carte du défi du jour sur l'accueil de la V4, une fois joué : « Défi du jour » (sans « fait » ni date), le score, une petite barre par morceau, le
 * compte à rebours du prochain défi, « Voir le résultat » (l'écran complet), le relevé de série et « Partager mon score » en contour orange : la Setlist
 * prend la place principale dessous.
 */
@Component({
  selector: 'app-home-done-card',
  imports: [TranslatePipe, PointsPipe, ShareButtonComponent, StreakPillComponent],
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
      <div class="flex items-center justify-between gap-3">
        <span class="flex gap-1" aria-hidden="true">
          @for (row of rows(); track row.position) {
            <span class="w-4 h-1.5 rounded-full" [style.background]="bar(row)" data-testid="track-bar" data-motion="score-bar"></span>
          }
        </span>
        <button type="button" (click)="seeResult.emit()" data-testid="home-see-result"
          class="inline-flex items-center min-h-11 text-[15px] underline underline-offset-4 cursor-pointer touch-manipulation" style="color:var(--text-light)">
          {{ 'daily.home.seeResult' | translate }}
        </button>
      </div>
      <div class="flex">
        <app-streak-pill [streak]="streak()" [linked]="linked()" (open)="openStreak.emit()" />
      </div>
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
  /** Le relevé de série et de gels, sous le score (la série est celle du défi). */
  readonly streak = input<Streak | null>(null);
  readonly linked = input(false);
  readonly canShare = input(true);
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly share = output<void>();
  readonly seeResult = output<void>();
  readonly openStreak = output<void>();

  protected readonly bar = trackBar;
}
