import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { enterHomeCard } from '../../../ui/motion/motion';
import { TrackResultRow, TrackResultsListComponent } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { trackBar } from '../day-result-screen/result-rows';

/**
 * La carte du défi du jour abandonné sur l'accueil de la V4. Abandonné après au moins une réponse : le score des morceaux répondus, « partie abandonnée »,
 * une petite barre par morceau et « Détail » qui déplie les morceaux. Abandonné sans réponse : ni score ni détail, seulement ce qui s'est passé. Dans les
 * deux cas, le compte à rebours du prochain défi. Contour discret : la prochaine action est la carte Survie.
 */
@Component({
  selector: 'app-home-abandoned-card',
  imports: [TranslatePipe, PointsPipe, TrackResultsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 py-4 flex flex-col gap-2" data-testid="home-abandoned"
      style="background:var(--bg-surface);border:1px solid var(--border-medium)">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm" style="color:var(--text-light)">{{ 'daily.home.label' | translate }}</p>
          @if (score() !== null) {
            <p class="tabular-nums" data-testid="home-abandoned-score"
              style="font-family:var(--font-score);font-size:2.4rem;font-weight:900;line-height:1;letter-spacing:-0.02em;color:var(--text-hi)">{{ score() ?? 0 | appPoints }}</p>
            <p class="text-sm mt-1" style="color:var(--text-light)">{{ 'daily.home.abandonedScore' | translate }}</p>
          } @else {
            <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'daily.home.abandonedNoPlayTitle' | translate }}</h2>
          }
        </div>
        <div class="text-right shrink-0">
          <p class="text-sm" style="color:var(--text-light)">{{ 'daily.alreadyPlayed.nextChallengeIn' | translate }}</p>
          <p class="tabular-nums" data-testid="home-abandoned-countdown"
            style="font-family:var(--font-clock);font-size:1.25rem;font-weight:600;line-height:1.2;color:var(--color-accent-2)">{{ countdown() }}</p>
        </div>
      </div>
      @if (score() === null) {
        @if (!pending()) {
          <p class="text-sm" style="color:var(--text-light)" data-testid="home-abandoned-noplay">{{ 'daily.home.abandonedNoPlay' | translate }}</p>
        }
      } @else if (rows().length) {
        <button type="button" (click)="showTracks.set(!showTracks())" [attr.aria-expanded]="showTracks()" data-testid="home-abandoned-toggle"
          class="self-start flex items-center gap-2.5 min-h-11 -my-2 touch-manipulation cursor-pointer">
          <span class="flex gap-1" aria-hidden="true">
            @for (row of rows(); track row.position) {
              <span class="w-4 h-1.5 rounded-full" [style.background]="bar(row)" data-testid="track-bar"></span>
            }
          </span>
          <span class="flex items-center gap-1 text-[13px]" style="color:var(--text-muted)" aria-hidden="true">
            {{ (showTracks() ? 'daily.result.hideTracks' : 'daily.result.showTracks') | translate }}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="transition-transform" [class.rotate-180]="showTracks()"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </button>
        @if (showTracks()) {
          <div class="-mx-5" style="border-top:1px solid var(--border-medium);border-bottom:1px solid var(--border-medium)" data-testid="home-abandoned-tracks">
            <app-track-results-list [rows]="rows()" [lang]="lang()" />
          </div>
        }
      }
    </section>
  `,
})
export class HomeAbandonedCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => enterHomeCard(this.host.nativeElement));
  }

  readonly countdown = input.required<string>();
  /** Le score des morceaux répondus ; vide sans aucune réponse (ni score ni détail). */
  readonly score = input<number | null>(null);
  /** Les stats du jour ne sont pas encore là (ou ont échoué) : on ne dit pas « pas joué » à tort. */
  readonly pending = input(false);
  readonly rows = input<readonly TrackResultRow[]>([]);
  readonly lang = input<'fr' | 'en'>('fr');

  protected readonly showTracks = signal(false);
  protected readonly bar = trackBar;
}
