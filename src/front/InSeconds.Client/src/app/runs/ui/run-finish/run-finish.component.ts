import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ShareButtonComponent } from '../../../gameplay/ui/share-button/share-button.component';
import { RunFinish, finishSquares } from '../../domain/run';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/**
 * La fin du run, victoire comme défaite : la carte du disque (le disque, son nom, « Nouveau record » ou le record, le score final, « 16 / 20
 * morceaux trouvés » et un carré par morceau groupé par manche), une case par manche (« score / objectif », l'objectif manqué en ambre, ✕ pour une
 * manche non jouée), le bloc « Lance cette playlist à tes potes » avec « Partager la playlist », puis « Nouvelle partie » (un joueur sans accès
 * voit à la place le lien vers le jeu du jour).
 */
@Component({
  selector: 'app-run-finish',
  imports: [TranslatePipe, RouterLink, RunDiscComponent, ShareButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col' },
  template: `
    <div class="screen-enter flex-1 flex flex-col gap-4 pt-2" data-testid="run-finished" [attr.data-status]="finish().status">
      <section class="flex items-center gap-4">
        <app-run-disc class="shrink-0" [disc]="finish().disc.key" [size]="88" />
        <div class="min-w-0 flex-1 space-y-1.5">
          <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-disc">
            {{ (finish().status === 'won' ? 'runs.finished.won' : 'runs.finished.disc') | translate: { disc: (finish().disc.key | translate) } }}
          </h2>
          @if (finish().record; as record) {
            <span class="inline-block px-2 py-0.5 rounded-md text-xs font-semibold" data-testid="run-record"
              [style.color]="record.isNew ? 'var(--color-accent-3)' : 'var(--text-light)'"
              [style.background]="record.isNew ? 'rgb(var(--rgb-accent-3) / 0.16)' : 'var(--bg-inactive)'">
              @if (record.isNew) {
                {{ 'runs.finished.newRecord' | translate }}
              } @else {
                {{ 'runs.finished.record' | translate: { score: format(record.bestScore) } }}
              }
            </span>
          }
          <p class="tabular-nums" data-testid="run-final-score"
            style="font-family:var(--font-score);font-size:3.1rem;font-weight:900;line-height:0.95;letter-spacing:-0.02em;color:var(--text-hi)">
            {{ format(finish().totalScore) }}
          </p>
          <p class="text-sm pt-1" style="color:var(--text-light)" data-testid="run-found">
            {{ 'runs.finished.found' | translate: { found: finish().foundCount, total: finish().trackCount } }}
          </p>
          <div class="flex flex-wrap gap-x-1.5 gap-y-1" data-testid="run-squares">
            @for (group of squares(); track $index) {
              <span class="flex gap-0.5">
                @for (square of group; track $index) {
                  <span class="w-[7px] h-[7px] rounded-[2px]" [attr.data-state]="square"
                    [style.background]="square === 'found' ? 'var(--color-success)' : square === 'played' ? 'var(--bg-inactive)' : 'transparent'"
                    [style.border]="square === 'unplayed' ? '1px solid var(--border-strong)' : square === 'neutralized' ? '1px dashed var(--text-faint)' : null"></span>
                }
              </span>
            }
          </div>
        </div>
      </section>

      <div class="grid grid-cols-4 gap-1.5" data-testid="run-round-scores">
        @for (round of finish().rounds; track round.round) {
          <div class="rounded-(--radius-button) px-0.5 py-2 text-center" style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)"
            [attr.data-round]="round.round">
            <p class="text-[0.6875rem] whitespace-nowrap" style="color:var(--text-muted)">{{ 'runs.finished.round' | translate: { round: round.round } }}</p>
            @if (round.score !== null) {
              <!-- Sur un petit écran (320 px), l'objectif passe sous le score. -->
              <p class="flex flex-wrap justify-center gap-x-1 text-sm tabular-nums">
                <span class="font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)">{{ round.score }}</span>
                <span class="text-xs whitespace-nowrap self-center" [style.color]="round.passed ? 'var(--text-faint)' : 'var(--color-warn)'">/ {{ round.objective }}</span>
              </p>
            } @else {
              <p class="text-sm font-bold" style="color:var(--text-faint)" [attr.aria-label]="'runs.finished.notPlayed' | translate">✕</p>
            }
          </div>
        }
      </div>

      <section class="flex flex-col gap-2.5">
        <h3 class="text-sm font-semibold" style="font-family:var(--font-body);color:var(--text-hi)">{{ 'runs.finished.shareTitle' | translate }}</h3>
        <p class="text-sm leading-relaxed" style="color:var(--text-light)">{{ 'runs.finished.shareBody' | translate }}</p>
        <app-share-button data-testid="run-share" [copied]="shareCopied()" [failed]="shareFailed()" labelKey="runs.finished.share"
          copiedKey="runs.finished.shareCopied" failedKey="runs.finished.shareFailed" (share)="share.emit()" />
        <button type="button" (click)="compare.emit()" data-testid="run-compare" class="w-full text-sm underline touch-manipulation" style="color:var(--text-muted)">
          {{ 'runs.finished.compare' | translate }}
        </button>
      </section>

      @if (canPlayAgain()) {
        <button type="button" (click)="playAgain.emit()" data-testid="run-play-again"
          class="w-full py-3.5 rounded-(--radius-button) text-sm font-bold tracking-wide uppercase transition touch-manipulation"
          style="font-family:var(--font-display);letter-spacing:0.06em;border:1.5px solid var(--border-neutral);color:var(--text-hi)">
          {{ 'runs.finished.newGame' | translate }}
        </button>
      } @else {
        <a routerLink="/daily" data-testid="run-to-daily"
          class="w-full py-3.5 rounded-(--radius-button) text-sm font-bold tracking-wide uppercase text-center transition touch-manipulation"
          style="font-family:var(--font-display);letter-spacing:0.06em;border:1.5px solid var(--border-neutral);color:var(--text-hi)">
          {{ 'runs.finished.toDaily' | translate }}
        </a>
      }
    </div>
  `,
})
export class RunFinishComponent {
  readonly finish = input.required<RunFinish>();
  /** Le joueur a l'accès : il peut lancer une autre playlist. Sinon (un ami venu par un lien), le jeu du jour lui est proposé. */
  readonly canPlayAgain = input(true);
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly lang = input<'fr' | 'en'>('fr');
  readonly share = output();
  /** « Voir les autres joueurs » : la comparaison de cette playlist. */
  readonly compare = output();
  /** « Nouvelle partie » : la page lance la playlist et son premier son dans ce clic. */
  readonly playAgain = output();

  protected readonly squares = computed(() => finishSquares(this.finish()));
  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));

  /** « 2 617 » : les grands nombres au format de la langue. */
  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
