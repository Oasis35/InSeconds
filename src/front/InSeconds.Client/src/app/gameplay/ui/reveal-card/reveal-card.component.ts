import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoundResult, foundSomething } from '../../domain/round-result';
import { GuessTimeChartComponent } from '../guess-time-chart/guess-time-chart.component';
import { MembraneComponent } from '../membrane/membrane.component';

/**
 * La révélation : une tuile au même cadre cyan que le lecteur qu'elle remplace (une seule tuile de focus par écran). Dedans, la pochette (qui
 * danse avec les basses de l'extrait rejoué, comme le bouton du lecteur) à côté de l'artiste puis du titre, sur deux lignes, chacun
 * précédé d'un petit ✓ vert ou ✕ rouge (le nom du morceau reste en texte neutre ; « trouvé » ou « raté » en plus pour les lecteurs
 * d'écran) ; puis les points du mode dans `[roundScore]` et le graphique « en combien de temps les autres ont trouvé ». Le bouton
 * « suite » du mode (`[roundNext]`) est sous la tuile. Rien qui identifie le morceau n'arrive avant la réponse : la carte n'existe
 * qu'à la révélation.
 */
@Component({
  selector: 'app-reveal-card',
  imports: [TranslatePipe, GuessTimeChartComponent, MembraneComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-stretch gap-3 text-left" data-testid="reveal">
      <div class="flex flex-col gap-2 p-3" data-testid="reveal-tile"
           style="background:var(--bg-surface);backdrop-filter:var(--blur-tile);-webkit-backdrop-filter:var(--blur-tile);border:1.5px solid rgb(var(--rgb-accent-2) / 0.8);box-shadow:var(--tube-frame-soft);border-radius:var(--radius-card)">
        <div class="flex items-center gap-3 min-w-0">
          @if (result().coverUrl; as cover) {
            <app-membrane class="shrink-0" [level]="bass()">
              <img [src]="cover" [alt]="'gameplay.reveal.coverAlt' | translate" class="block w-14 h-14 object-cover rounded-full" style="opacity:0.95" />
            </app-membrane>
          }
          <p class="m-0 min-w-0 flex-1 leading-tight line-clamp-4" [attr.title]="result().correctArtist + ' - ' + result().correctTitle" data-testid="reveal-answer">
            <span class="block text-xl font-bold" style="color:var(--text-hi)">
              <span class="inline-block w-[1em] mr-2 text-center text-sm align-middle" aria-hidden="true" [style.color]="result().artistCorrect ? 'var(--color-success)' : 'var(--color-fail)'">{{ result().artistCorrect ? '✓' : '✕' }}</span>{{ result().correctArtist }}<span class="sr-only"> ({{ (result().artistCorrect ? 'gameplay.reveal.found' : 'gameplay.reveal.missed') | translate }})</span>
            </span>
            <span class="block text-base font-semibold mt-0.5" style="color:var(--text-light)">
              <span class="inline-block w-[1em] mr-2 text-center text-sm align-middle" aria-hidden="true" [style.color]="result().titleCorrect ? 'var(--color-success)' : 'var(--color-fail)'">{{ result().titleCorrect ? '✓' : '✕' }}</span>{{ result().correctTitle }}<span class="sr-only"> ({{ (result().titleCorrect ? 'gameplay.reveal.found' : 'gameplay.reveal.missed') | translate }})</span>
            </span>
          </p>
        </div>

        <ng-content select="[roundScore]" />

        <div class="w-full">
          <app-guess-time-chart [compact]="true" [distribution]="result().distribution" [notFoundCount]="result().notFoundCount"
            [highlightDuration]="found() ? result().listenedSeconds : null" [highlightNotFound]="!found()" />
        </div>
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
