import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunComparison } from '../../domain/run';

/**
 * La comparaison des joueurs d'une playlist : « Playlist de Clément » (le pseudo de l'auteur, pas le code du lien), « 4 joueurs de cette playlist »,
 * puis le tableau : le joueur (son pseudo, « Invité » sans compte, « Toi » surligné en orange) et son disque dessous, le score de chaque manche
 * (✕ pour une manche non jouée) et le total ; trié par total. « Partager la playlist » en bas.
 */
@Component({
  selector: 'app-run-comparison-screen',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col' },
  template: `
    <div class="screen-enter flex-1 flex flex-col gap-4 pt-2" data-testid="run-comparison">
      <header class="space-y-1 text-center">
        <p class="text-xs font-bold uppercase tracking-wider" style="color:var(--text-muted)" data-testid="run-comparison-eyebrow">
          {{ 'runs.comparison.eyebrow' | translate: { pseudo: comparison().authorPseudo ?? ('runs.link.guest' | translate) } }}
        </p>
        <h1 class="text-2xl font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-comparison-title">
          {{ (comparison().playerCount === 1 ? 'runs.comparison.titleOne' : 'runs.comparison.title') | translate: { count: comparison().playerCount } }}
        </h1>
      </header>

      <div class="rounded-(--radius-card) overflow-x-auto" style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)">
        <table class="w-full text-sm tabular-nums" data-testid="run-comparison-table">
          <thead>
            <tr style="color:var(--text-muted)">
              <th scope="col" class="text-left font-semibold text-xs px-3 py-2">{{ 'runs.comparison.player' | translate }}</th>
              @for (round of roundNumbers(); track round) {
                <th scope="col" class="text-right font-semibold text-xs px-1.5 py-2">{{ 'runs.comparison.roundShort' | translate: { round } }}</th>
              }
              <th scope="col" class="text-right font-semibold text-xs px-3 py-2">{{ 'runs.comparison.total' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of comparison().rows; track $index) {
              <tr [attr.data-me]="row.isMe" [style.background]="row.isMe ? 'rgb(var(--rgb-accent) / 0.14)' : null" style="border-top:1px solid var(--border-subtle)">
                <th scope="row" class="text-left font-normal px-3 py-2">
                  <span class="block font-bold truncate max-w-[9rem]" [style.color]="row.isMe ? 'var(--color-accent)' : 'var(--text-hi)'" data-testid="run-comparison-name">
                    {{ row.isMe ? ('runs.comparison.you' | translate) : (row.pseudo ?? ('runs.link.guest' | translate)) }}
                  </span>
                  <span class="block text-xs" style="color:var(--text-faint)">
                    {{ row.disc.key | translate }}@if (row.disc.stars > 0) { ★{{ row.disc.stars }} }
                  </span>
                </th>
                @for (score of row.rounds; track $index) {
                  <td class="text-right px-1.5 py-2" [style.color]="score === null ? 'var(--text-faint)' : 'var(--text-light)'">
                    @if (score === null) {
                      <span [attr.aria-label]="'runs.finished.notPlayed' | translate">✕</span>
                    } @else {
                      {{ score }}
                    }
                  </td>
                }
                <td class="text-right font-extrabold px-3 py-2" style="color:var(--text-hi)" data-testid="run-comparison-total">{{ row.totalScore }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <button type="button" (click)="share.emit()" data-testid="run-share"
        class="w-full py-3.5 rounded-(--radius-button) text-sm font-bold tracking-wide uppercase transition touch-manipulation"
        style="font-family:var(--font-display);letter-spacing:0.06em;background:var(--gradient-primary);color:var(--text-on-primary);box-shadow:var(--glow-primary)">
        {{ (shareCopied() ? 'runs.finished.shareCopied' : shareFailed() ? 'runs.finished.shareFailed' : 'runs.finished.share') | translate }}
      </button>
    </div>
  `,
})
export class RunComparisonScreenComponent {
  readonly comparison = input.required<RunComparison>();
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly share = output();

  /** Les colonnes M1 à Mn, d'après les manches de la playlist. */
  protected readonly roundNumbers = computed(() => Array.from({ length: this.comparison().roundCount }, (_, index) => index + 1));
}
