import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { enterCard, fillBar, revealInTurn, tweenNumber } from '../../../ui/motion/motion';
import { RunDifficulty, RunDifficultyOption, RunPassedRound } from '../../domain/run';
import { RunCardKey, RunCardOffer, RunCardValues, RunHandCard, cardColor, cardGlyph, handFull, handSlots } from '../../domain/run-cards';
import { RunDifficultyColumnsComponent } from '../run-difficulty-columns/run-difficulty-columns.component';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/**
 * L'écran de palier, après une manche passée (docs/runs/proto2.md § L'écran de palier), du haut vers le bas, sans phrase d'explication : le
 * disque gagné et l'étagère des disques de l'échelle (les suivants en pointillé), le score de la manche avec le repère de l'objectif franchi,
 * la manche suivante (ses trois difficultés, Facile / Normal / Mélomane, quand la playlist en propose, sinon son objectif), les trois cartes de l'offre et « Passer », la main, puis « Jouer » (la difficulté choisie, Normal d'abord) ou « Suite ». Présentation seule : la page relaie les
 * gestes au store. Main pleine, toucher une carte de l'offre la met en attente : toucher ensuite une carte de la main l'échange.
 */
@Component({
  selector: 'app-run-palier',
  imports: [TranslatePipe, ButtonComponent, RunDiscComponent, RunDifficultyColumnsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-palier.component.html',
  styles: `
    .offer-card { transition: border-color 160ms, transform 160ms; }
    @media (prefers-reduced-motion: reduce) { .offer-card { transition: none; } }
  `,
})
export class RunPalierComponent {
  /** La manche qui vient d'être passée : son score, son objectif, son disque. */
  readonly passed = input.required<RunPassedRound>();
  /** Les manches de la playlist (l'étagère a un disque par manche). */
  readonly rounds = input.required<number>();
  /** Les disques déjà gagnés, dans l'ordre des manches. */
  readonly wonDiscs = input.required<readonly string[]>();
  /** La manche suivante, son objectif (celui de « Normal » quand la difficulté ne se choisit pas ici) et le disque qu'elle fait gagner. */
  readonly nextRound = input.required<number>();
  readonly nextObjective = input.required<number>();
  readonly nextDisc = input<string | null>(null);
  /** Les difficultés de la manche suivante, quand elles se choisissent sur cet écran ; `null` : rien à choisir, « Suite » lance la manche. */
  readonly options = input<readonly RunDifficultyOption[] | null>(null);
  readonly tracksPerRound = input(5);
  /** L'écoute normale d'un morceau : une colonne plus courte (manche boss) le dit. */
  readonly listenSeconds = input(10);
  /** L'offre du palier ; vide une fois une carte prise, ou passée. */
  readonly offer = input<RunCardOffer | null>(null);
  readonly hand = input.required<readonly RunHandCard[]>();
  readonly handSize = input.required<number>();
  /** Ce que valent les cartes de la playlist (le signe des cartes chiffrées). */
  readonly values = input<RunCardValues | null>(null);
  /** La carte de l'offre en attente d'échange (main pleine). */
  readonly pending = input<RunCardKey | null>(null);
  /** Une prise est en cours d'envoi : rien d'autre ne se touche. */
  readonly busy = input(false);

  /** Toucher une carte de l'offre. */
  readonly pick = output<RunCardKey>();
  /** Toucher une carte de la main (pour l'échanger contre la carte en attente). */
  readonly dropCard = output<number>();
  readonly pass = output();
  readonly next = output();
  /** « Jouer » : la difficulté choisie (quand les colonnes sont là). */
  readonly choose = output<RunDifficulty>();

  protected readonly selected = signal<RunDifficulty>('safe');
  /** Normal quand la manche le propose, sinon la première difficulté offerte. */
  protected readonly effective = computed(() => {
    const options = this.options() ?? [];
    return options.some(o => o.difficulty === this.selected()) ? this.selected() : (options[0]?.difficulty ?? 'safe');
  });

  readonly lang = input('fr');
  protected readonly glyph = (card: RunCardKey, values: RunCardValues | null): string => cardGlyph(card, values, this.lang());
  protected readonly color = cardColor;
  protected readonly slots = computed(() => handSlots(this.hand(), this.handSize()));
  protected readonly full = computed(() => handFull(this.hand(), this.handSize()));
  /** L'étagère : un disque par manche, gagné ou à venir (pointillé). */
  protected readonly shelf = computed(() => Array.from({ length: this.rounds() }, (_, i) => this.wonDiscs()[i] ?? null));
  /** Le repère de l'objectif sur la jauge du score : la jauge est le score de la manche, le repère là où l'objectif a été franchi. */
  protected readonly mark = computed(() => {
    const { score, objective } = this.passed();
    return score <= 0 ? 0 : Math.min(1, objective / score);
  });

  /** Le bouton du bas : « Jouer » avec la difficulté choisie, ou « Suite ». */
  protected advance(): void {
    if (this.options()) this.choose.emit(this.effective());
    else this.next.emit();
  }

  private readonly disc = viewChild<ElementRef<HTMLElement>>('disc');
  private readonly score = viewChild<ElementRef<HTMLElement>>('score');
  private readonly fill = viewChild<ElementRef<HTMLElement>>('fill');
  private readonly cards = viewChild<ElementRef<HTMLElement>>('cards');

  constructor() {
    // Le disque se pose, le score monte avec sa jauge, les cartes arrivent une à une (rien en mouvement réduit : la façade s'en charge).
    afterNextRender(() => {
      const disc = this.disc()?.nativeElement;
      if (disc) enterCard(disc);
      const score = this.score()?.nativeElement;
      if (score) tweenNumber(score, 0, this.passed().score, 0.2);
      const fill = this.fill()?.nativeElement;
      if (fill) fillBar(fill, 0.2);
      const cards = this.cards()?.nativeElement;
      if (cards) revealInTurn([...cards.querySelectorAll<HTMLElement>('[data-card]')], 0.45);
    });
  }
}
