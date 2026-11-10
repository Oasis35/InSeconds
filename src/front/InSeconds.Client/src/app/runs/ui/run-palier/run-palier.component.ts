import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { enterCard, fillBar, revealInTurn, tweenNumber } from '../../../ui/motion/motion';
import { RunDifficulty, RunDifficultyOption, RunPassedRound } from '../../domain/run';
import { RunCardKey, RunCardValues, cardColor, cardGlyph } from '../../domain/run-cards';
import { RunDifficultyColumnsComponent } from '../run-difficulty-columns/run-difficulty-columns.component';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/**
 * L'écran de palier, après une manche passée (docs/runs/proto3.md § L'écran de palier), du haut vers le bas, sans phrase d'explication : le
 * disque gagné et l'étagère des disques de l'échelle (les suivants en pointillé), le score de la manche avec le repère de l'objectif franchi,
 * la carte gagnée s'il y en a une (elle agira sur la manche suivante), la manche suivante (ses trois difficultés, Facile / Normal / Mélomane,
 * quand la playlist en propose, sinon son objectif), puis, sans difficulté à choisir, « Suite » (un toucher sur une colonne lance la manche : pas de bouton « Jouer »). Présentation seule :
 * la page relaie les gestes au store.
 */
@Component({
  selector: 'app-run-palier',
  imports: [TranslatePipe, ButtonComponent, RunDiscComponent, RunDifficultyColumnsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-palier.component.html',
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
  /** La carte gagnée à la manche qui vient d'être passée (elle agit sur la suivante) ; `null` si elle n'a rien rapporté. */
  readonly earnedCard = input<RunCardKey | null>(null);
  /** Ce que valent les cartes de la playlist (le signe des cartes chiffrées). */
  readonly values = input<RunCardValues | null>(null);
  /** Un choix part au serveur : rien d'autre ne se touche. */
  readonly busy = input(false);

  readonly next = output();
  /** La colonne touchée : la manche part avec cette difficulté (quand les colonnes sont là). */
  readonly choose = output<RunDifficulty>();

  protected readonly selected = signal<RunDifficulty>('safe');
  /** Normal quand la manche le propose, sinon la première difficulté offerte. */
  protected readonly effective = computed(() => {
    const options = this.options() ?? [];
    return options.some(o => o.difficulty === this.selected()) ? this.selected() : (options[0]?.difficulty ?? 'safe');
  });

  protected readonly glyph = cardGlyph;
  protected readonly color = cardColor;
  /** L'étagère : un disque par manche, gagné ou à venir (pointillé). */
  protected readonly shelf = computed(() => Array.from({ length: this.rounds() }, (_, i) => this.wonDiscs()[i] ?? null));
  /** Le repère de l'objectif sur la jauge du score : la jauge est le score de la manche, le repère là où l'objectif a été franchi. */
  protected readonly mark = computed(() => {
    const { score, objective } = this.passed();
    return score <= 0 ? 0 : Math.min(1, objective / score);
  });

  /** « Suite » (le bouton n'existe que sans difficulté à choisir) : la manche suivante part. */
  protected advance(): void {
    this.next.emit();
  }

  private readonly disc = viewChild<ElementRef<HTMLElement>>('disc');
  private readonly score = viewChild<ElementRef<HTMLElement>>('score');
  private readonly fill = viewChild<ElementRef<HTMLElement>>('fill');
  private readonly earned = viewChild<ElementRef<HTMLElement>>('earned');

  constructor() {
    // Le disque se pose, le score monte avec sa jauge, la carte gagnée arrive (rien en mouvement réduit : la façade s'en charge).
    afterNextRender(() => {
      const disc = this.disc()?.nativeElement;
      if (disc) enterCard(disc);
      const score = this.score()?.nativeElement;
      if (score) tweenNumber(score, 0, this.passed().score, 0.2);
      const fill = this.fill()?.nativeElement;
      if (fill) fillBar(fill, 0.2);
      const earned = this.earned()?.nativeElement;
      if (earned) revealInTurn([earned], 0.45);
    });
  }
}
