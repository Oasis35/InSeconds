import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoundResult, foundSomething } from '../../domain/round-result';
import { GuessTimeChartComponent } from '../guess-time-chart/guess-time-chart.component';
import { MembraneComponent } from '../membrane/membrane.component';

/**
 * La révélation : pochette (qui danse avec les basses de l'extrait rejoué, comme le bouton du lecteur), ✓/✗ de l'artiste et du titre,
 * bonne réponse, puis le graphique « en
 * combien de temps les autres ont trouvé ». Les points sont ceux du mode : il les projette dans
 * `[roundScore]` (sous la bonne réponse) et son bouton « suite » dans `[roundNext]` (sous le graphique).
 */
@Component({
  selector: 'app-reveal-card',
  imports: [TranslatePipe, GuessTimeChartComponent, MembraneComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative flex flex-col items-center gap-3 text-center pt-1" data-testid="reveal">
      <!-- Le badge du mode se place par rapport à la carte (à gauche de la pochette), jamais par rapport à la page. -->
      <ng-content select="[roundBadge]" />

      @if (result().coverUrl; as cover) {
        <app-membrane [level]="bass()">
          <img [src]="cover" [alt]="'gameplay.reveal.coverAlt' | translate" class="block w-24 h-24 object-cover"
            style="box-shadow:0 8px 32px rgba(0,0,0,0.6);opacity:0.95;border-radius:50%" />
        </app-membrane>
      }

      <div class="flex justify-center gap-6">
        <span class="text-sm font-semibold" [style.color]="result().artistCorrect ? 'var(--color-success)' : 'var(--color-fail)'">
          {{ result().artistCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.artist' | translate }}
        </span>
        <span class="text-sm font-semibold" [style.color]="result().titleCorrect ? 'var(--color-success)' : 'var(--color-fail)'">
          {{ result().titleCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.title' | translate }}
        </span>
      </div>

      <div class="space-y-1.5">
        <p class="text-[13px]" style="color:var(--text-muted)">
          {{ 'gameplay.reveal.correctAnswer' | translate }}
        </p>
        <p class="text-sm leading-relaxed" style="color:var(--text-light)"><b class="font-semibold" style="color:var(--text-hi)">{{ result().correctArtist }}</b> - {{ result().correctTitle }}</p>
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
