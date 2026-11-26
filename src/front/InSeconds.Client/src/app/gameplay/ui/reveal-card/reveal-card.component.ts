import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoundResult, foundSomething } from '../../domain/round-result';
import { GuessTimeChartComponent } from '../guess-time-chart/guess-time-chart.component';
import { MembraneComponent } from '../membrane/membrane.component';

/**
 * La révélation, en une colonne alignée à gauche : la pochette (qui danse avec les basses de l'extrait rejoué, comme le bouton du lecteur) à
 * côté de l'artiste puis du titre, sur deux lignes (en texte neutre, suivi d'un petit ✓ vert ou ✕ rouge ; « trouvé » ou « raté » en plus pour les lecteurs d'écran) et
 * ; puis les points du mode dans `[roundScore]` (avec le badge Deezer à leur droite), le graphique « en combien de temps les autres ont trouvé » et le bouton
 * « suite » dans `[roundNext]`. Rien qui identifie le morceau n'arrive avant la réponse : la carte n'existe qu'à la révélation.
 */
@Component({
  selector: 'app-reveal-card',
  imports: [TranslatePipe, GuessTimeChartComponent, MembraneComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-stretch gap-3 text-left" data-testid="reveal">
      <div class="flex items-center gap-3 min-w-0">
        @if (result().coverUrl; as cover) {
          <app-membrane class="shrink-0" [level]="bass()">
            <img [src]="cover" [alt]="'gameplay.reveal.coverAlt' | translate" class="block w-16 h-16 min-[375px]:w-20 min-[375px]:h-20 object-cover rounded-full"
              style="opacity:0.95" />
          </app-membrane>
        }
        <div class="min-w-0 flex-1 flex flex-col items-start gap-1.5">
          <p class="m-0 leading-tight line-clamp-4" [attr.title]="result().correctArtist + ' - ' + result().correctTitle" data-testid="reveal-answer">
            <span class="block text-xl font-bold" style="color:var(--text-hi)">{{ result().correctArtist }}
              <span class="text-sm align-middle" aria-hidden="true" [style.color]="result().artistCorrect ? 'var(--color-success)' : 'var(--color-fail)'">{{ result().artistCorrect ? '✓' : '✕' }}</span>
              <span class="sr-only">({{ (result().artistCorrect ? 'gameplay.reveal.found' : 'gameplay.reveal.missed') | translate }})</span></span>
            <span class="block text-base font-semibold mt-0.5" style="color:var(--text-light)">{{ result().correctTitle }}
              <span class="text-sm align-middle" aria-hidden="true" [style.color]="result().titleCorrect ? 'var(--color-success)' : 'var(--color-fail)'">{{ result().titleCorrect ? '✓' : '✕' }}</span>
              <span class="sr-only">({{ (result().titleCorrect ? 'gameplay.reveal.found' : 'gameplay.reveal.missed') | translate }})</span></span>
          </p>
        </div>
      </div>

      <ng-content select="[roundScore]" />

      <div class="w-full">
        <app-guess-time-chart [distribution]="result().distribution" [notFoundCount]="result().notFoundCount"
          [highlightDuration]="found() ? result().listenedSeconds : null" [highlightNotFound]="!found()" />
      </div>

      <ng-content select="[roundNext]" />
    </div>
  `,
})
export class RevealCardComponent {
  readonly result = input.required<RoundResult>();
  /** L'énergie des basses de l'extrait rejoué, de 0 à 1. */
  readonly bass = input(0);
  protected readonly found = computed(() => foundSomething(this.result()));
}
