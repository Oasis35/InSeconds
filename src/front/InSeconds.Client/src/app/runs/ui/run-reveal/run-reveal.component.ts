import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, viewChild, viewChildren } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';
import { MembraneComponent } from '../../../gameplay/ui/membrane/membrane.component';
import { flyTo, revealInTurn } from '../../../ui/motion/motion';
import { RunTrack, gainLabel } from '../../domain/run';
import { RunNextButtonComponent } from '../run-next-button/run-next-button.component';
import { RunWaveComponent } from '../run-wave/run-wave.component';

/**
 * La réponse d'un morceau, dans la carte, à la place du lecteur et de la saisie : le bouton devient la pochette (elle danse avec l'extrait
 * rejoué), la forme de l'extrait reste à côté, puis « Artiste - Titre », ✓ ou ✗ pour l'artiste et pour le titre l'un après l'autre, et les
 * points gagnés qui rejoignent le total du run. Le badge Deezer, puis « Morceau suivant » (le clic, ou l'enchaînement automatique, est géré
 * par la page).
 */
@Component({
  selector: 'app-run-reveal',
  imports: [TranslatePipe, DeezerBadgeComponent, MembraneComponent, RunNextButtonComponent, RunWaveComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-testid': 'run-answer' },
  template: `
    <div class="flex items-center gap-3">
      <div class="relative grid place-items-center shrink-0" style="width:64px;height:64px">
        <app-membrane [level]="bass()">
          @if (track().coverUrl; as cover) {
            <img [src]="cover" [alt]="'gameplay.reveal.coverAlt' | translate" class="object-cover rounded-full" style="width:52px;height:52px" />
          } @else {
            <div class="rounded-full" style="width:52px;height:52px;background:var(--gradient-primary);opacity:0.6"></div>
          }
        </app-membrane>
      </div>
      <div class="flex-1 min-w-0 flex flex-col justify-end" style="height:64px">
        <app-run-wave [peaks]="peaks()" color="var(--color-accent-2)" />
      </div>
    </div>

    <p class="mt-3 text-base font-semibold truncate" style="color:var(--text-hi)">
      <span data-testid="run-answer-artist">{{ track().artist }}</span>
      <span class="font-normal" style="color:var(--text-muted)"> - <span data-testid="run-answer-title">{{ track().title }}</span></span>
    </p>
    <div class="flex items-center gap-3.5 mt-1.5 text-xs" style="font-family:var(--font-clock)">
      <span #verdict data-testid="run-answer-artist-verdict" [style.color]="track().artistCorrect ? 'var(--color-success)' : 'var(--color-fail)'">
        {{ track().artistCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.artist' | translate }}
      </span>
      <span #verdict data-testid="run-answer-title-verdict" [style.color]="track().titleCorrect ? 'var(--color-success)' : 'var(--color-fail)'">
        {{ track().titleCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.title' | translate }}
      </span>
      <span #gain data-testid="run-answer-points" class="ml-auto leading-none tabular-nums text-[30px] font-black"
        style="font-family:var(--font-score)" [style.color]="track().points > 0 ? 'var(--color-accent)' : 'var(--text-faint)'">{{ gainText() }}</span>
    </div>

    @if (track().deezerTrackId; as deezerTrackId) {
      <div class="mt-3" data-testid="run-answer-deezer">
        <app-deezer-badge [deezerTrackId]="deezerTrackId" [lang]="lang()" width="98" height="14" />
      </div>
    }

    <app-run-next-button class="block mt-3.5" [endsRun]="endsRun()" [auto]="auto()" (next)="next.emit()" />
  `,
})
export class RunRevealComponent {
  readonly track = input.required<RunTrack>();
  /** La forme de l'extrait (`null` : barres plates). */
  readonly peaks = input<readonly number[] | null>(null);
  /** L'énergie des basses de l'extrait rejoué : la pochette danse avec. */
  readonly bass = input(0);
  /** Langue du badge Deezer. */
  readonly lang = input<'fr' | 'en'>('fr');
  /** Le prochain clic mène à la fin de la partie. */
  readonly endsRun = input(false);
  /** L'enchaînement automatique est armé. */
  readonly auto = input(false);
  /** Le total du run, que les points rejoignent. */
  readonly flyTarget = input<HTMLElement | null>(null);
  readonly next = output();

  protected readonly gainText = computed(() => (this.track().points > 0 ? gainLabel(this.track().points) : '0'));

  private readonly verdicts = viewChildren<ElementRef<HTMLElement>>('verdict');
  private readonly gainElement = viewChild.required<ElementRef<HTMLElement>>('gain');

  constructor() {
    afterNextRender(() => {
      revealInTurn(this.verdicts().map(ref => ref.nativeElement));
      flyTo(this.gainElement().nativeElement, this.flyTarget());
    });
  }
}
