import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, viewChildren } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { riseCard } from '../../../ui/motion/motion';
import { RunCardValues, RunTrackEffects, cardColor, playedCards } from '../../domain/run-cards';

/**
 * Ce que les cartes gagnées font sur le morceau en cours, au-dessus du champ de saisie (docs/runs/proto3.md § Les cartes) : une tuile par carte
 * active (l'Indice montre l'année, les initiales et le genre ; le QCM dit que les réponses sont proposées ; la Prolongation, l'écoute plus
 * longue). Aucun toucher : une carte gagnée agit toute seule sur la manche suivante. Présentation seule, le serveur calcule chaque effet.
 */
@Component({
  selector: 'app-run-round-cards',
  imports: [TranslatePipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (played().length > 0 || refused()) {
      <div class="grid gap-2 mb-2" data-testid="run-round-cards">
        <!-- Une tuile prend toute la largeur : « 1995 · D. P. – O. M. T. · Pop » tient sur une ligne, même sur un petit téléphone. -->
        @for (chip of played(); track chip.card) {
          <div #chip class="flex items-center gap-2 px-3 py-1.5" data-testid="run-card-effect" [attr.data-card]="chip.card"
            [style.border-color]="color(chip.card).color" [style.background]="'rgb(' + color(chip.card).rgb + ' / 0.08)'"
            style="min-height:44px;border:1px solid;border-radius:var(--radius-button)">
            @if (chip.value) {
              <span class="text-[15px] font-bold" style="font-family:var(--font-clock)" [style.color]="color(chip.card).color">{{ chip.value }}</span>
            }
            <span class="text-[13px] font-semibold leading-tight" style="color:var(--text-hi)">
              @switch (chip.card) {
                @case ('three_choices') { {{ 'runs.roundCards.choicesHint' | translate }} }
                @case ('extend') { {{ 'runs.roundCards.extend' | translate: { seconds: (listenSeconds() | appSeconds) } }} }
                @default { {{ 'runs.cards.' + chip.card + '.name' | translate }} }
              }
            </span>
          </div>
        }
      </div>
      @if (refused()) {
        <p class="text-[13px] mb-2" role="status" style="color:var(--text-muted)" data-testid="run-card-refused">{{ 'runs.roundCards.refused' | translate }}</p>
      }
    }
  `,
})
export class RunRoundCardsComponent {
  readonly effects = input<RunTrackEffects | null>(null);
  /** Ce que valent les cartes de la playlist (règles figées). */
  readonly values = input<RunCardValues | null>(null);
  /** L'écoute du morceau en cours (celle de la Prolongation, une fois ajoutée). */
  readonly listenSeconds = input(0);
  /** Le serveur a refusé le dernier échange de morceau. */
  readonly refused = input(false);

  protected readonly color = cardColor;
  protected readonly played = computed(() => playedCards(this.effects()));

  private readonly playedChips = viewChildren<ElementRef<HTMLElement>>('chip');
  /** Les tuiles déjà affichées ; `null` avant le premier affichage (une reprise montre les siennes sans les animer). */
  private shown: number | null = null;

  constructor() {
    // Une tuile qui vient d'arriver monte dans la carte du morceau (rien en mouvement réduit : la façade s'en charge).
    effect(() => {
      const chips = this.playedChips();
      if (this.shown !== null) chips.slice(this.shown).forEach(chip => riseCard(chip.nativeElement));
      this.shown = chips.length;
    });
  }
}
