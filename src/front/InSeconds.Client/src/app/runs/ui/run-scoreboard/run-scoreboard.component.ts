import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { motionReduced } from '../../../ui/motion/reduced-motion';
import { pop, tweenNumber } from '../../../ui/motion/motion';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { RoundDot, RunGhostGap, overtook } from '../../domain/run';

/** Le temps que les points de la réponse rejoignent le total avant qu'il compte, en secondes. */
const COUNT_DELAY = 0.9;

/** L'écart avec le fantôme change quand le total a fini de compter (le délai, puis le décompte de `tweenNumber`). */
/** Le temps que dure « Tu viens de dépasser… », en millisecondes. */
const OVERTAKE_MS = 3500;

const GHOST_DELAY_MS = (COUNT_DELAY + 0.45) * 1000;

/**
 * Le bloc du haut de la manche, de quoi ne jamais être perdu : « Manche N » avec une pastille par morceau de la manche, le score (que les points d'une réponse
 * rejoignent) avec la série de bonnes réponses, les vies en cœurs rouges, l'écart avec le fantôme d'un ami, et la rangée des paliers d'écoute avec
 * celui de la manche en cyan (le temps). Pensé pour un téléphone : trois lignes serrées ; sur un écran bas (le clavier ouvert), la rangée des paliers se replie.
 */
@Component({
  selector: 'app-run-scoreboard',
  imports: [SecondsPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="px-3.5 py-3" style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)" data-testid="run-scoreboard">
      <!-- Trois zones lisibles d'un coup d'œil : « Manche N » et ses pastilles, le score au centre, les vies à droite. -->
      <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div class="flex flex-col items-start gap-2 min-w-0">
          <h2 class="text-[15px] font-bold leading-none whitespace-nowrap" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-round-title">
            {{ (maxRounds() > 0 ? 'runs.header.roundOf' : 'runs.header.roundShort') | translate: { round: round(), max: maxRounds() } }}
          </h2>
          <!-- Une pastille par morceau : trouvé (vert), à moitié (ambre), raté (rouge), retiré (trait), celui en cours (anneau ambre), à venir. -->
          <ul class="flex items-center gap-1.5" data-testid="run-dots" [attr.aria-label]="'runs.scoreboard.dots' | translate">
            @for (dot of dots(); track $index) {
              <li class="size-2.5 rounded-full shrink-0" [attr.data-dot]="dot" [style]="dotStyle(dot)"></li>
            }
          </ul>
        </div>
        <div class="flex flex-col items-center gap-1 min-w-0 min-h-[3.25rem]">
          <b #total class="inline-block tabular-nums text-[30px] font-black leading-none origin-center"
            style="font-family:var(--font-score);color:var(--text-hi)" data-testid="run-total-score"></b>
          <!-- La série de bonnes réponses : à la couleur du joueur, c'est lui qui la fait ; elle ne rapporte rien. -->
          @if (shownCombo(); as count) {
            <span #comboChip class="inline-block shrink-0 whitespace-nowrap text-[12px] font-bold tabular-nums" style="color:var(--text-streak)" data-testid="run-combo">
              {{ 'runs.combo' | translate: { count } }}
            </span>
          }
        </div>
        <!-- Les vies : un cœur rouge plein par vie qui reste, un contour pour celle qui est perdue. -->
        <div #heartsRow class="flex items-center justify-end gap-0.5" data-testid="run-lives" role="img"
          [attr.aria-label]="'runs.header.lives' | translate: { left: livesLeft(), total: lives().length }">
          @for (alive of lives(); track $index) {
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" [attr.data-alive]="alive">
              <path d="M12 21 C5 15.5 2.5 12 2.5 8.5 A4.8 4.8 0 0 1 12 6.6 A4.8 4.8 0 0 1 21.5 8.5 C21.5 12 19 15.5 12 21 Z"
                [attr.fill]="alive ? 'var(--color-fail)' : 'none'" [attr.stroke]="alive ? 'var(--color-fail)' : 'var(--text-faint)'" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
          }
        </div>
      </div>

      @if (overtaken(); as pseudo) {
        <!-- Le joueur vient de passer devant l'ami : un temps fort de quelques secondes, au-dessus de l'écart. -->
        <p class="mt-2 px-2.5 py-1.5 text-[13px] font-bold text-center rounded-(--radius-button)" style="border:1px solid var(--color-violet);color:var(--color-violet)" data-testid="run-overtook">
          {{ 'runs.ghost.overtook' | translate: { name: pseudo } }}
        </p>
      }
      @if (shownGhost(); as ghost) {
        <!-- Le fantôme de l'ami : son total au même morceau, en violet (les autres joueurs), et l'écart du joueur. -->
        <p class="flex items-baseline justify-between gap-3 pt-2 text-[13px]" data-testid="run-ghost">
          <!-- Le pseudo se coupe sur un petit téléphone, jamais le total ni l'écart. -->
          <span class="flex min-w-0 items-baseline gap-1" style="color:var(--color-violet)">
            <span class="truncate">{{ ghost.pseudo ?? ('runs.link.guest' | translate) }}</span>&ngsp;
            <b class="shrink-0 tabular-nums" style="font-family:var(--font-score)">{{ format(ghost.total) }}</b>&ngsp;
            @if (ghost.stoppedAtRound !== null) {
              <span class="shrink-0 whitespace-nowrap" data-testid="run-ghost-stopped">{{ 'runs.ghost.stopped' | translate: { round: ghost.stoppedAtRound } }}</span>
            }
          </span>
          <span class="shrink-0 whitespace-nowrap font-semibold tabular-nums" style="color:var(--text-hi)" data-testid="run-ghost-gap">
            @if (ghost.gap > 0) {
              {{ 'runs.ghost.ahead' | translate: { points: format(ghost.gap) } }}
            } @else if (ghost.gap < 0) {
              {{ 'runs.ghost.behind' | translate: { points: format(-ghost.gap) } }}
            } @else {
              {{ 'runs.ghost.tied' | translate }}
            }
          </span>
        </p>
      }

      @if (ladder().length > 0) {
        <!-- La rangée des paliers : où l'écoute en est, et jusqu'où elle peut descendre. Repliée quand l'écran est bas (le clavier ouvert). -->
        <div class="ladder flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 pt-2.5" data-testid="run-ladder">
          <span class="text-[12px]" style="color:var(--text-muted)">{{ 'runs.scoreboard.listen' | translate }}</span>
          <ol class="flex items-center gap-1.5" [attr.aria-label]="'runs.header.listen' | translate: { seconds: (listenSeconds() | appSeconds) }">
            @for (step of ladder(); track $index) {
              <li class="grid place-items-center h-6 min-w-6 px-1.5 rounded-full text-[11px] font-bold tabular-nums"
                [attr.data-current]="isCurrent(step) ? '' : null" [attr.data-testid]="isCurrent(step) ? 'run-listen' : null" [style]="stepStyle(step)">
                {{ stepLabel(step) }}
              </li>
            }
          </ol>
        </div>
      }
    </section>
  `,
  styles: `
    @media (max-height: 640px) { .ladder { display: none; } }
  `,
})
export class RunScoreboardComponent {
  /** Le total du run. */
  readonly total = input.required<number>();
  /** Le numéro de la manche affichée. */
  readonly round = input.required<number>();
  /** Une valeur par vie de départ : vrai pour celle qui reste. */
  readonly lives = input<readonly boolean[]>([]);
  /** Le plafond de manches de la playlist (« Manche 3/8 ») ; 0 : sans plafond, « Manche 3 ». */
  readonly maxRounds = input(0);
  /** Les pastilles de la manche. */
  readonly dots = input<readonly RoundDot[]>([]);
  /** L'échelle des paliers d'écoute, en secondes, du plus long au plus court. */
  readonly ladder = input<readonly number[]>([]);
  /** Le palier d'écoute de la manche, en secondes. */
  readonly listenSeconds = input<number>(0);
  /** L'écart avec le fantôme d'un ami sur la même playlist ; vide sans fantôme. */
  readonly ghost = input<RunGhostGap | null>(null);
  /** La série de bonnes réponses d'affilée, déjà assez longue pour s'afficher (le store en décide) ; `null` sinon. */
  readonly combo = input<number | null>(null);
  readonly lang = input<'fr' | 'en'>('fr');

  /** La série affichée : comme le fantôme, elle change quand le total a fini de compter, pas avant que la carte ait dit le verdict. */
  protected readonly shownCombo = signal<number | null>(null);
  private readonly comboChip = viewChild<ElementRef<HTMLElement>>('comboChip');
  private readonly heartsRow = viewChild<ElementRef<HTMLElement>>('heartsRow');
  /** Les vies du dernier affichage : le petit temps fort ne se joue que lorsqu'une vie vient de se perdre ou d'être rendue. */
  private lastLives: number | null = null;

  protected livesLeft(): number {
    return this.lives().filter(Boolean).length;
  }
  /**
   * Le fantôme affiché : il change en même temps que le total a fini de compter (les points s'envolent d'abord), sinon l'écart annoncerait le
   * verdict avant l'animation et contredirait un instant le total affiché. Tout de suite au premier affichage et en mouvement réduit.
   */
  protected readonly shownGhost = signal<RunGhostGap | null>(null);
  /** Le pseudo de l'ami qu'on vient de dépasser, quelques secondes ; `null` sinon. */
  protected readonly overtaken = signal<string | null>(null);
  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));

  /** Le total, que les points d'une réponse rejoignent. */
  readonly totalAnchor = viewChild.required<ElementRef<HTMLElement>>('total');

  private readonly injector = inject(Injector);
  private readonly invitedLabel = inject(TranslateService).instant('runs.link.guest') as string;

  constructor() {
    effect(() => {
      const left = this.livesLeft();
      const element = this.heartsRow()?.nativeElement;
      if (element && this.lastLives !== null && left !== this.lastLives) pop(element);
      this.lastLives = left;
    });
    let ghostTimer: ReturnType<typeof setTimeout> | null = null;
    inject(DestroyRef).onDestroy(() => {
      if (ghostTimer !== null) clearTimeout(ghostTimer);
      if (this.overtakenTimer !== null) clearTimeout(this.overtakenTimer);
    });
    effect(() => {
      const ghost = this.ghost();
      untracked(() => {
        if (ghostTimer !== null) clearTimeout(ghostTimer);
        ghostTimer = null;
        if (this.shownGhost() === null || ghost === null || motionReduced()) {
          this.showGhost(ghost);
          return;
        }
        ghostTimer = setTimeout(() => { ghostTimer = null; this.showGhost(ghost); }, GHOST_DELAY_MS);
      });
    });
    // La série change avec le total ; quand elle grandit (à son apparition comprise), un petit temps fort (rien en mouvement réduit, rien au
    // premier affichage).
    let comboTimer: ReturnType<typeof setTimeout> | null = null;
    let comboShown = false;
    inject(DestroyRef).onDestroy(() => { if (comboTimer !== null) clearTimeout(comboTimer); });
    effect(() => {
      const combo = this.combo();
      untracked(() => {
        if (comboTimer !== null) clearTimeout(comboTimer);
        comboTimer = null;
        const show = (): void => {
          const grew = comboShown && combo !== null && combo > (this.shownCombo() ?? 0);
          comboShown = true;
          this.shownCombo.set(combo);
          // La puce n'existe qu'après le rendu (à son apparition) : elle se lit dans le rappel.
          if (grew) afterNextRender(() => { const chip = this.comboChip()?.nativeElement; if (chip) pop(chip); }, { injector: this.injector });
        };
        if (!comboShown || motionReduced()) show();
        else comboTimer = setTimeout(() => { comboTimer = null; show(); }, GHOST_DELAY_MS);
      });
    });
    // Le total compte jusqu'à sa nouvelle valeur, le temps que les points le rejoignent ; posé tel quel au premier affichage.
    let shownTotal: number | null = null;
    effect(() => {
      const total = this.total();
      const element = this.totalAnchor().nativeElement;
      untracked(() => {
        if (shownTotal === null || total < shownTotal) element.textContent = String(total);
        else tweenNumber(element, shownTotal, total, COUNT_DELAY);
        shownTotal = total;
      });
    });
  }

  private overtakenTimer: ReturnType<typeof setTimeout> | null = null;

  private showGhost(ghost: RunGhostGap | null): void {
    if (overtook(this.shownGhost(), ghost)) {
      this.overtaken.set(ghost!.pseudo ?? this.invitedLabel);
      if (this.overtakenTimer !== null) clearTimeout(this.overtakenTimer);
      this.overtakenTimer = setTimeout(() => { this.overtakenTimer = null; this.overtaken.set(null); }, OVERTAKE_MS);
    }
    this.shownGhost.set(ghost);
  }

  /** « 1 240 » : les grands nombres au format de la langue. */
  protected format(value: number): string {
    return this.numbers().format(value);
  }

  /** Le palier de la manche : la durée la plus proche de l'écoute annoncée (le dernier palier se répète). */
  protected isCurrent(step: number): boolean {
    return Math.abs(step - this.listenSeconds()) < 0.001;
  }

  /** « 10 », « 0,5 » : la durée sans unité, au format de la langue (l'unité est dans l'étiquette de la rangée). */
  protected stepLabel(step: number): string {
    return this.numbers().format(step);
  }

  protected stepStyle(step: number): string {
    return this.isCurrent(step)
      ? 'border:1px solid var(--color-accent-2);background:rgb(var(--rgb-accent-2) / 0.15);color:var(--color-accent-2)'
      : 'border:1px solid var(--border-neutral);color:var(--text-muted)';
  }

  protected dotStyle(dot: RoundDot): string {
    switch (dot) {
      case 'found': return 'background:var(--color-success)';
      case 'half': return 'background:var(--color-accent)';
      case 'missed': return 'background:var(--color-fail)';
      case 'withdrawn': return 'background:var(--text-faint);height:2px;align-self:center';
      case 'current': return 'border:2px solid var(--color-accent)';
      default: return 'border:1px solid var(--border-neutral)';
    }
  }
}
