import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';
import { RunTrack, gainLabel } from '../../domain/run';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * La réponse après un morceau, à la place du lecteur et de la saisie : la pochette (ronde, comme la révélation du Daily) et sa pastille de points, l'artiste et le titre
 * (deux lignes au plus), ✓ ou ✗ pour l'artiste et pour le titre, le badge officiel Deezer, puis « Morceau suivant » (le clic qui lance le son suivant : il
 * est géré par la page, dans son gestionnaire de clic, pour le déverrouillage du son sur iPhone). Aucun graphique : Run n'en a pas.
 */
@Component({
  selector: 'app-run-answer-card',
  imports: [TranslatePipe, DeezerBadgeComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4" data-testid="run-answer">
      <section class="rounded-(--radius-card) p-4 space-y-3" style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)">
        <div class="flex items-start gap-4">
          <div class="relative shrink-0">
            @if (track().coverUrl; as cover) {
              <img [src]="cover" [alt]="'gameplay.reveal.coverAlt' | translate" class="w-24 h-24 object-cover rounded-full" style="box-shadow:0 8px 24px rgba(0,0,0,0.5)" />
            } @else {
              <div class="w-24 h-24 rounded-full" style="background:var(--gradient-primary);opacity:0.6"></div>
            }
            <span class="absolute -bottom-1 -right-2 px-2.5 py-1 rounded-full text-sm font-extrabold tabular-nums"
              style="background:var(--color-warn);color:var(--text-on-primary);font-family:var(--font-display)" data-testid="run-answer-points">{{ gain() }}</span>
          </div>
          <div class="min-w-0 space-y-2">
            <p class="text-lg font-extrabold leading-tight line-clamp-2" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-answer-artist">{{ track().artist }}</p>
            <p class="text-base leading-snug line-clamp-2" style="color:var(--text-light)" data-testid="run-answer-title">{{ track().title }}</p>
            <div class="flex flex-wrap gap-2 pt-1">
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold" data-testid="run-answer-artist-verdict"
                [style.color]="track().artistCorrect ? 'var(--color-success)' : 'var(--color-fail)'"
                [style.background]="track().artistCorrect ? 'rgb(var(--rgb-success) / 0.14)' : 'rgb(var(--rgb-danger) / 0.14)'">
                {{ track().artistCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.artist' | translate }}
              </span>
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold" data-testid="run-answer-title-verdict"
                [style.color]="track().titleCorrect ? 'var(--color-success)' : 'var(--color-fail)'"
                [style.background]="track().titleCorrect ? 'rgb(var(--rgb-success) / 0.14)' : 'rgb(var(--rgb-danger) / 0.14)'">
                {{ track().titleCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.title' | translate }}
              </span>
            </div>
          </div>
        </div>
        @if (track().deezerTrackId; as deezerTrackId) {
          <div data-testid="run-answer-deezer">
            <app-deezer-badge [deezerTrackId]="deezerTrackId" [lang]="lang()" width="112" height="16" />
          </div>
        }
      </section>

      <button appButton type="button" [block]="true" [glow]="true" (click)="next.emit()" data-testid="run-next-track">
        {{ (endsRound() ? 'runs.answer.endRound' : 'runs.answer.next') | translate }}
      </button>
    </div>
  `,
})
export class RunAnswerCardComponent {
  readonly track = input.required<RunTrack>();
  /** Langue du badge Deezer (le visuel officiel existe en français et en anglais). */
  readonly lang = input<'fr' | 'en'>('fr');
  /** C'était le dernier morceau de la manche : le bouton annonce la fin de la manche. */
  readonly endsRound = input(false);
  /** « Morceau suivant » : la page lance le son suivant dans ce clic. */
  readonly next = output();

  protected readonly gain = computed(() => gainLabel(this.track().points));
}
