import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { enterCard, revealInTurn, tweenNumber } from '../../../ui/motion/motion';
import { RunPassedRound } from '../../domain/run';
import { RunCardKey, RunCardOffer, RunHandCard, cardGlyph, handFull, handSlots } from '../../domain/run-cards';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/**
 * L'écran de palier, après une manche passée (docs/runs/proto2.md § L'écran de palier), du haut vers le bas, sans phrase d'explication : le
 * disque gagné et l'étagère des disques de l'échelle (les suivants en pointillé), le score de la manche avec le repère de l'objectif franchi,
 * l'objectif de la manche suivante, les trois cartes de l'offre et « Passer », la main, puis « Suite ». Présentation seule : la page relaie les
 * gestes au store. Main pleine, toucher une carte de l'offre la met en attente : toucher ensuite une carte de la main l'échange.
 */
@Component({
  selector: 'app-run-palier',
  imports: [TranslatePipe, ButtonComponent, RunDiscComponent],
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
  /** La manche suivante, son objectif (celui de « Sûre » : la difficulté se choisit ensuite) et le disque qu'elle fait gagner. */
  readonly nextRound = input.required<number>();
  readonly nextObjective = input.required<number>();
  readonly nextDisc = input<string | null>(null);
  /** L'offre du palier ; vide une fois une carte prise, ou passée. */
  readonly offer = input<RunCardOffer | null>(null);
  readonly hand = input.required<readonly RunHandCard[]>();
  readonly handSize = input.required<number>();
  /** La carte de l'offre en attente d'échange (main pleine). */
  readonly pending = input<RunCardKey | null>(null);
  /** Une prise est en cours d'envoi : rien d'autre ne se touche. */
  readonly busy = input(false);

  /** Toucher une carte de l'offre. */
  readonly pick = output<RunCardKey>();
  /** Toucher une carte de la main (pour l'échanger contre la carte en attente). */
  readonly drop = output<number>();
  readonly pass = output();
  readonly next = output();

  protected readonly glyph = cardGlyph;
  protected readonly slots = computed(() => handSlots(this.hand(), this.handSize()));
  protected readonly full = computed(() => handFull(this.hand(), this.handSize()));
  /** L'étagère : un disque par manche, gagné ou à venir (pointillé). */
  protected readonly shelf = computed(() => Array.from({ length: this.rounds() }, (_, i) => this.wonDiscs()[i] ?? null));
  /** Le repère de l'objectif sur la jauge du score : la jauge est le score de la manche, le repère là où l'objectif a été franchi. */
  protected readonly mark = computed(() => {
    const { score, objective } = this.passed();
    return score <= 0 ? 0 : Math.min(1, objective / score);
  });

  private readonly disc = viewChild<ElementRef<HTMLElement>>('disc');
  private readonly score = viewChild<ElementRef<HTMLElement>>('score');
  private readonly cards = viewChild<ElementRef<HTMLElement>>('cards');

  constructor() {
    // Le disque se pose, le score monte, les cartes arrivent une à une (rien en mouvement réduit : la façade s'en charge).
    afterNextRender(() => {
      const disc = this.disc()?.nativeElement;
      if (disc) enterCard(disc);
      const score = this.score()?.nativeElement;
      if (score) tweenNumber(score, 0, this.passed().score, 0.2);
      const cards = this.cards()?.nativeElement;
      if (cards) revealInTurn([...cards.querySelectorAll<HTMLElement>('[data-card]')], 0.45);
    });
  }
}
