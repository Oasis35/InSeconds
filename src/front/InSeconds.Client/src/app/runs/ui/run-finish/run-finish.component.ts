import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ShareButtonComponent } from '../../../gameplay/ui/share-button/share-button.component';
import { RunDuel, RunFinish, discStars, finishSquares, levelDeltaText } from '../../domain/run';
import { finishSequence } from '../../../ui/motion/motion';
import { RunDiscComponent } from '../run-disc/run-disc.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { PointsPipe } from '../../../ui/format/points.pipe';

/**
 * La fin du run, victoire comme défaite : la carte du disque (le disque, son nom, « Nouveau record » ou le record, le score final, « 16 / 20
 * morceaux trouvés » et un carré par morceau groupé par manche), une case par manche (« score / objectif », l'objectif manqué en ambre, ✕ pour une
 * manche non jouée), puis « Rejouer » (« Revanche » en duel) en action principale, avec ce qui a manqué pour le disque suivant (« Il t'a manqué 12 pts pour le Disque de
 * bronze »), et le bloc « Fais mieux » avec « Partager mon score » (la grille et le lien de la même playlist). Un joueur sans accès (venu par un lien)
 * ne peut pas lancer de playlist : le lien vers le jeu du jour remplace « Rejouer », en bas. Quand l'ami qui a lancé la playlist l'a finie, le duel
 * ouvre l'écran (« Tu bats Léa de 126 pts », « Léa gagne de 40 pts »), sur un ton neutre, jamais « perdu ». La fin se joue en 2,2 s au plus, un
 * toucher la saute, et rien n'attend la fin : les boutons sont actifs dès le début (`finishSequence`). Dans la nouvelle interface (`showLevel`), le haut tient dans un bloc compact (le
 * disque, le score, le badge « Record », la jauge vers le disque suivant), les groupes suivent (`[finishGroups]`), puis « Rejouer » en principal,
 * « Défier un ami » en contour orange et, tout en bas, la bande du défi du jour (`[finishBottom]`).
 */
@Component({
  selector: 'app-run-finish',
  imports: [PointsPipe, TranslatePipe, RouterLink, ButtonComponent, RunDiscComponent, ShareButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col', '(click)': 'skipSequence()' },
  template: `
    <div class="screen-enter flex-1 flex flex-col gap-4 pt-2" data-testid="run-finished" [attr.data-status]="finish().status">
      @if (duel(); as duel) {
        <!-- Le duel : la première ligne quand un ami a lancé la playlist. -->
        <p class="text-lg font-bold leading-snug break-words" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-duel" [attr.data-gap]="duel.gap">
          @if (duel.gap > 0) {
            {{ 'runs.finished.duelAhead' | translate: { name: duel.pseudo ?? ('runs.link.guest' | translate), points: format(duel.gap) } }}
          } @else if (duel.gap < 0) {
            {{ 'runs.finished.duelBehind' | translate: { name: duel.pseudo ?? ('runs.link.guest' | translate), points: format(-duel.gap) } }}
          } @else {
            {{ 'runs.finished.duelTied' | translate: { name: duel.pseudo ?? ('runs.link.guest' | translate) } }}
          }
        </p>
      }

      @if (level(); as level) {
        <!-- Nouvelle interface : un seul bloc compact (le disque, le score, le badge de record, la jauge vers le disque suivant), les groupes, puis les deux actions. -->
        <section class="rounded-(--radius-card) px-4 py-4 flex flex-col gap-3" data-testid="run-level" [attr.data-disc]="level.disc.key"
          style="background:var(--bg-surface);border:1px solid var(--border-subtle)">
          <div class="flex items-center gap-4">
            <app-run-disc class="shrink-0" data-motion="finish-disc" [disc]="finish().disc.key" [size]="72" [shine]="false" />
            <div class="min-w-0 flex-1">
              <p class="text-sm" style="color:var(--text-muted)">
                <span data-testid="run-disc" style="color:var(--text-light)">{{ (finish().status === 'won' ? 'runs.finished.won' : 'runs.finished.disc') | translate: { disc: (finish().disc.key | translate) } }}</span>
                @if (difficultyKey(); as key) { · {{ key | translate }} }
              </p>
              <p class="tabular-nums" data-testid="run-final-score" data-motion="finish-score" [attr.data-value]="finish().totalScore"
                style="font-family:var(--font-score);font-size:2.6rem;font-weight:900;line-height:1;letter-spacing:-0.02em;color:var(--text-hi)">
                {{ format(finish().totalScore) }}
              </p>
              @if (finish().record; as record) {
                @if (!record.isNew) {
                  <p class="text-sm" data-testid="run-record" style="color:var(--text-muted)">{{ 'runs.finished.record' | translate: { score: format(record.bestScore) } }}</p>
                }
              }
            </div>
            @if (finish().record; as record) {
              @if (record.isNew) {
                <span class="self-start shrink-0 whitespace-nowrap rounded-(--radius-button) px-2.5 py-1 text-sm font-semibold" data-testid="run-record" data-motion="finish-record"
                  style="border:1px solid var(--color-accent-3);color:var(--color-accent-3)"><span aria-hidden="true">↗</span> {{ 'runs.finished.recordShort' | translate }}</span>
              }
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="h-1.5 rounded-full overflow-hidden" style="background:var(--bg-inactive)" aria-hidden="true">
              <div class="h-full rounded-full" data-testid="run-level-bar" data-motion="finish-bar" style="background:var(--color-accent-3)" [style.width.%]="level.progressPercent"></div>
            </div>
            <p class="flex items-center justify-between gap-3 text-sm" style="color:var(--text-light)">
              <span>
                @if (level.nextDisc && level.pointsToNext !== null) {
                  <span data-testid="run-next-disc">{{ 'runs.level.encoreBefore' | translate }}
                    <b class="tabular-nums" style="color:var(--color-accent-3)">{{ 'runs.level.encorePoints' | translate: { points: format(level.pointsToNext) } }}</b>
                    {{ 'runs.level.encoreAfter' | translate: { disc: lower(level.nextDisc.key | translate) } }}</span>
                } @else {
                  <span>{{ 'runs.level.top' | translate }}</span>
                }
                @if (level.provisional) { <span class="text-xs" style="color:var(--text-muted)" data-testid="run-level-provisional"> · {{ 'runs.level.provisional' | translate }}</span> }
              </span>
              @if (delta(); as delta) {
                <span class="shrink-0 tabular-nums" data-testid="run-level-delta" [style.color]="(level.delta ?? 0) > 0 ? 'var(--color-accent-3)' : 'var(--text-muted)'">{{ delta }}</span>
              }
            </p>
            <p class="flex items-center gap-2 text-sm" style="color:var(--text-light)">
              <span data-testid="run-found">{{ 'runs.finished.found' | translate: { found: finish().foundCount, total: finish().trackCount } }}</span>
              @if (reviewLink(); as link) {
                <span aria-hidden="true">·</span>
                <a [routerLink]="link" class="underline underline-offset-4 touch-manipulation" style="color:var(--text-hi)" data-testid="run-level-review">{{ 'runs.level.review' | translate }} ›</a>
              }
            </p>
          </div>
        </section>

        <ng-content select="[finishGroups]" />

        <!-- Les actions et la bande du défi sont collées en bas de l'écran, au-dessus de la barre (maquette). -->
        <div class="mt-auto flex flex-col gap-4">
          @if (canPlayAgain()) {
            <div class="flex flex-col gap-2" data-motion="finish-late">
              @if (finish().shortfall; as shortfall) {
                <p class="text-sm text-center" style="color:var(--text-light)" data-testid="run-shortfall">
                  {{ 'runs.finished.shortfallBefore' | translate }}
                  <span class="font-bold tabular-nums" style="color:var(--color-accent-3)">{{ 'runs.finished.shortfallPoints' | translate: { points: format(shortfall.points) } }}</span>
                  {{ 'runs.finished.shortfallAfter' | translate: { disc: (shortfall.disc.key | translate) + stars(shortfall.disc) } }}
                </p>
              }
              <button appButton type="button" size="lg" [block]="true" (click)="playAgain.emit()" data-testid="run-play-again">
                <span data-testid="run-play-again-label">{{ (duel() ? 'runs.finished.rematch' : 'runs.finished.playAgain') | translate }}</span>
              </button>
            </div>
          }
          <app-share-button data-testid="run-share" [copied]="shareCopied()" [failed]="shareFailed()" labelKey="runs.level.challenge"
            copiedKey="runs.finished.shareCopied" failedKey="runs.finished.shareFailed" [variant]="canPlayAgain() ? 'accent' : 'primary'" (share)="share.emit()" />
          <button type="button" (click)="compare.emit()" data-testid="run-compare" class="w-full min-h-11 text-sm underline touch-manipulation" style="color:var(--text-muted)">
            {{ 'runs.finished.compare' | translate }}
          </button>
          <!-- Tout en bas, au-dessus de la barre : le défi du jour qui attend, ou le prochain. -->
          <ng-content select="[finishBottom]" />
        </div>
      } @else {
        <section class="flex items-center gap-4">
          <app-run-disc class="shrink-0" data-motion="finish-disc" [disc]="finish().disc.key" [size]="88" />
          <div class="min-w-0 flex-1 space-y-1.5">
            <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-disc">
              {{ (finish().status === 'won' ? 'runs.finished.won' : 'runs.finished.disc') | translate: { disc: (finish().disc.key | translate) } }}
            </h2>
            @if (finish().record; as record) {
              <span class="inline-block px-2 py-0.5 rounded-md text-xs font-semibold" data-testid="run-record" [attr.data-motion]="record.isNew ? 'finish-record' : null"
                [style.color]="record.isNew ? 'var(--color-accent-3)' : 'var(--text-light)'"
                [style.background]="record.isNew ? 'rgb(var(--rgb-accent-3) / 0.16)' : 'var(--bg-inactive)'">
                @if (record.isNew) {
                  {{ 'runs.finished.newRecord' | translate }}
                } @else {
                  {{ 'runs.finished.record' | translate: { score: format(record.bestScore) } }}
                }
              </span>
            }
            <p class="tabular-nums" data-testid="run-final-score" data-motion="finish-score" [attr.data-value]="finish().totalScore"
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
                    <span class="w-[7px] h-[7px] rounded-[2px]" data-motion="finish-square" [attr.data-state]="square"
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
            <div class="rounded-(--radius-button) px-0.5 py-2 text-center" style="background:var(--bg-surface);border:1px solid var(--border-subtle)"
              data-motion="finish-round" [attr.data-round]="round.round">
              <p class="text-[0.6875rem] whitespace-nowrap" style="color:var(--text-muted)">{{ 'runs.finished.round' | translate: { round: round.round } }}</p>
              @if (round.score !== null) {
                <!-- Sur un petit écran (320 px), l'objectif passe sous le score. -->
                <p class="flex flex-wrap justify-center gap-x-1 text-sm tabular-nums">
                  <span class="font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)">{{ round.score | appPoints }}</span>
                  <span class="text-xs whitespace-nowrap self-center" [style.color]="round.passed ? 'var(--text-faint)' : 'var(--color-warn)'">/ {{ round.objective }}</span>
                </p>
              } @else {
                <p class="text-sm font-bold" style="color:var(--text-faint)" [attr.aria-label]="'runs.finished.notPlayed' | translate">✕</p>
              }
            </div>
          }
        </div>

        @if (canPlayAgain()) {
          <div class="flex flex-col gap-2">
            @if (finish().shortfall; as shortfall) {
              <!-- Ce qui a manqué : le chiffre à la couleur du joueur, c'est à lui de le rattraper. -->
              <p class="text-sm text-center" style="color:var(--text-light)" data-testid="run-shortfall" data-motion="finish-late">
                {{ 'runs.finished.shortfallBefore' | translate }}
                <span class="font-bold tabular-nums" style="color:var(--color-accent-3)">{{ 'runs.finished.shortfallPoints' | translate: { points: format(shortfall.points) } }}</span>
                {{ 'runs.finished.shortfallAfter' | translate: { disc: (shortfall.disc.key | translate) + stars(shortfall.disc) } }}
              </p>
            }
            <button appButton type="button" size="lg" [block]="true" (click)="playAgain.emit()" data-testid="run-play-again">
              {{ (duel() ? 'runs.finished.rematch' : 'runs.finished.playAgain') | translate }}
            </button>
          </div>
        }

        <section class="flex flex-col gap-2.5" data-motion="finish-late">
          <h3 class="text-sm font-semibold" style="font-family:var(--font-body);color:var(--text-hi)">{{ 'runs.finished.shareTitle' | translate }}</h3>
          <p class="text-sm leading-relaxed" style="color:var(--text-light)">{{ 'runs.finished.shareBody' | translate: { tracks: finish().trackCount } }}</p>
          <app-share-button data-testid="run-share" [copied]="shareCopied()" [failed]="shareFailed()" labelKey="runs.finished.share"
            copiedKey="runs.finished.shareCopied" failedKey="runs.finished.shareFailed"
            [variant]="canPlayAgain() ? 'neutral' : 'primary'" (share)="share.emit()" />
          <button type="button" (click)="compare.emit()" data-testid="run-compare" class="w-full text-sm underline touch-manipulation" style="color:var(--text-muted)">
            {{ 'runs.finished.compare' | translate }}
          </button>
        </section>
      }

      @if (!canPlayAgain()) {
        <a appButton variant="neutral" [block]="true" routerLink="/daily" data-testid="run-to-daily">
          {{ 'runs.finished.toDaily' | translate }}
        </a>
      }
    </div>
  `,
})
export class RunFinishComponent {
  readonly finish = input.required<RunFinish>();
  /** Le duel contre l'ami qui a lancé la playlist (il l'a finie) ; `null` sinon. */
  readonly duel = input<RunDuel | null>(null);
  /** Le joueur a l'accès : il peut lancer une autre playlist. Sinon (un ami venu par un lien), le jeu du jour lui est proposé. */
  readonly canPlayAgain = input(true);
  /** La nouvelle interface (accès Setlist) : le niveau du joueur s'affiche, « Rejouer » devient « Nouvelle setlist » et le partage « Défier un ami ». */
  readonly showLevel = input(false);
  /** Le lien de cette partie dans l'historique (« Revoir ») ; `null` : pas de lien. */
  readonly reviewLink = input<string | null>(null);
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly lang = input<'fr' | 'en'>('fr');
  readonly share = output();
  /** « Voir les autres joueurs » : la comparaison de cette playlist. */
  readonly compare = output();
  /** « Rejouer » : la page lance une nouvelle playlist et son premier son dans ce clic. */
  readonly playAgain = output();

  protected readonly level = computed(() => (this.showLevel() ? this.finish().level : null));
  /** « +38 » : ce que la partie a changé au niveau (rien sans changement). */
  protected readonly delta = computed(() => levelDeltaText(this.level()?.delta ?? null, value => this.format(value)));
  /** La difficulté de la dernière manche jouée (« Mélomane »), à côté du disque ; `null` sans manche jouée. */
  protected readonly difficultyKey = computed(() => {
    const played = this.finish().rounds.filter(round => round.difficulty !== null);
    const last = played.at(-1);
    return last ? `runs.difficulty.${last.difficulty}` : null;
  });
  protected readonly squares = computed(() => finishSquares(this.finish()));
  protected readonly stars = discStars;
  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private skip: (() => void) | null = null;

  constructor() {
    // La séquence de fin part une fois l'écran dessiné ; un toucher la saute, et elle se pose en quittant l'écran.
    afterNextRender(() => { this.skip = finishSequence(this.host.nativeElement, (value) => this.format(value)); });
    inject(DestroyRef).onDestroy(() => this.skip?.());
  }

  /** Un toucher saute la séquence de fin : tout est posé. */
  protected skipSequence(): void {
    this.skip?.();
  }

  /** « disque d'or » : le nom d'un disque au milieu d'une phrase. */
  protected lower(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  /** « 2 617 » : les grands nombres au format de la langue. */
  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
