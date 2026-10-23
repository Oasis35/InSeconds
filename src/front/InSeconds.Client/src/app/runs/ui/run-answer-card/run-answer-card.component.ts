import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunTrack, gainLabel } from '../../domain/run';

/**
 * La réponse après un morceau, à la place du lecteur et de la saisie : la pochette (forme libre) et sa pastille de points, l'artiste et le titre
 * (deux lignes au plus), ✓ ou ✗ pour l'artiste et pour le titre, le lien Deezer, puis « Morceau suivant » (le clic qui lance le son suivant : il
 * est géré par la page, dans son gestionnaire de clic, pour le déverrouillage du son sur iPhone). Aucun graphique : Run n'en a pas.
 */
@Component({
  selector: 'app-run-answer-card',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4" data-testid="run-answer">
      <section class="rounded-(--radius-card) p-4 space-y-3" style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)">
        <div class="flex items-start gap-4">
          <div class="relative shrink-0">
            @if (track().coverUrl; as cover) {
              <img [src]="cover" [alt]="'gameplay.reveal.coverAlt' | translate" class="w-24 h-24 object-cover" style="border-radius:58% 42% 55% 45% / 48% 55% 45% 52%;box-shadow:0 8px 24px rgba(0,0,0,0.5)" />
            } @else {
              <div class="w-24 h-24" style="border-radius:58% 42% 55% 45% / 48% 55% 45% 52%;background:var(--gradient-primary);opacity:0.6"></div>
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
        @if (deezerUrl(); as url) {
          <a [href]="url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
            style="border:1px solid var(--border-subtle);color:var(--text-light)" data-testid="run-answer-deezer">
            <span aria-hidden="true">▶</span> {{ 'runs.answer.listenOnDeezer' | translate }}
          </a>
        }
      </section>

      <button type="button" (click)="next.emit()" data-testid="run-next-track"
        class="w-full py-4 rounded-(--radius-button) text-sm font-bold tracking-wide uppercase transition touch-manipulation"
        style="font-family:var(--font-display);letter-spacing:0.06em;background:var(--gradient-primary);color:var(--text-on-primary);box-shadow:var(--glow-primary)">
        {{ 'runs.answer.next' | translate }}
      </button>
    </div>
  `,
})
export class RunAnswerCardComponent {
  readonly track = input.required<RunTrack>();
  /** « Morceau suivant » : la page lance le son suivant dans ce clic. */
  readonly next = output();

  protected readonly gain = computed(() => gainLabel(this.track().points));
  protected readonly deezerUrl = computed(() => {
    const id = this.track().deezerTrackId;
    return id === null ? null : `https://www.deezer.com/track/${id}`;
  });
}
