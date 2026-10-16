import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoundResult, foundSomething } from '../domain/round-result';
import { GuessTimeChartComponent } from './guess-time-chart.component';

/**
 * La révélation : pochette, ✓/✗ de l'artiste et du titre, bonne réponse, puis le graphique « en
 * combien de temps les autres ont trouvé ». Les points sont ceux du mode : il les projette dans
 * `[roundScore]` (sous la bonne réponse) et son bouton « suite » dans `[roundNext]` (sous le graphique).
 */
@Component({
  selector: 'app-reveal-card',
  imports: [TranslatePipe, GuessTimeChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-3 text-center pt-1" data-testid="reveal">
      <ng-content select="[roundBadge]" />

      @if (result().coverUrl; as cover) {
        <img [src]="cover" [alt]="'gameplay.reveal.coverAlt' | translate" class="w-24 h-24 object-cover"
          style="box-shadow:0 8px 32px rgba(0,0,0,0.6);opacity:0.95;border-radius:34% 66% 60% 40% / 40% 45% 55% 60%" />
      }

      <div class="flex justify-center gap-6">
        <span class="text-base font-bold" [style.color]="result().artistCorrect ? 'var(--color-success)' : 'var(--color-fail)'">
          {{ result().artistCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.artist' | translate }}
        </span>
        <span class="text-base font-bold" [style.color]="result().titleCorrect ? 'var(--color-success)' : 'var(--color-fail)'">
          {{ result().titleCorrect ? '✓' : '✗' }} {{ 'gameplay.reveal.title' | translate }}
        </span>
      </div>

      <div class="space-y-1.5">
        <p class="text-xs font-bold tracking-widest uppercase" style="font-family:var(--font-display);color:var(--text-faint)">
          {{ 'gameplay.reveal.correctAnswer' | translate }}
        </p>
        <p class="text-base font-medium" style="color:var(--text-light)">{{ result().correctArtist }} — {{ result().correctTitle }}</p>
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
  protected readonly found = computed(() => foundSomething(this.result()));
}
