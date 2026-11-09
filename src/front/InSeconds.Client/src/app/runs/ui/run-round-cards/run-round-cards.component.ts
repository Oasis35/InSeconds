import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, viewChildren } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { riseCard } from '../../../ui/motion/motion';
import { RunCardKey, RunCardValues, RunHandCard, RunTrackEffects, cardColor, cardGlyph, isPlayable, playedCards } from '../../domain/run-cards';

/**
 * Les coups de pouce sur l'écran de manche, au-dessus du champ de saisie (docs/runs/proto2.md § Les coups de pouce) : d'abord ce que les cartes
 * actives sur ce morceau révèlent (l'année, les initiales, le genre…, une tuile par carte, sans clic : une carte durable agit tant qu'on la garde),
 * puis les cartes à toucher pour les jouer (le Joker seul, dans une playlist durable ; toutes celles de la main dans une playlist d'avant).
 * Présentation seule : la page relaie le toucher au store, le serveur calcule chaque effet.
 */
@Component({
  selector: 'app-run-round-cards',
  imports: [TranslatePipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (played().length > 0 || playableHand().length > 0 || refused()) {
      <!-- Un écart avant le champ : le pouce qui vise la saisie ne joue pas une carte par erreur. -->
      <div class="grid grid-cols-2 gap-2 mb-2" data-testid="run-round-cards">
        <!-- Une carte jouée prend toute la largeur : les initiales « D. P. – O. M. T. » tiennent sur une ligne, même sur un petit téléphone. -->
        @for (chip of played(); track chip.card) {
          <div #chip class="col-span-2 flex items-center gap-2 px-3 py-1.5" data-testid="run-card-effect" [attr.data-card]="chip.card"
            [style.border-color]="color(chip.card).color" [style.background]="'rgb(' + color(chip.card).rgb + ' / 0.08)'"
            style="min-height:44px;border:1px solid;border-radius:var(--radius-button)">
            @if (chip.value) {
              <span class="text-[15px] font-bold whitespace-nowrap" style="font-family:var(--font-clock)" [style.color]="color(chip.card).color">{{ chip.value }}</span>
            }
            <span class="text-[13px] font-semibold leading-tight" style="color:var(--text-hi)">
              @switch (chip.card) {
                @case ('net') { {{ (values()?.durable ? 'runs.roundCards.netQuarter' : 'runs.roundCards.net') | translate }} }
                @case ('either_or') { {{ 'runs.roundCards.eitherOr' | translate }} }
                @case ('lower_target') { {{ 'runs.roundCards.lowerTarget' | translate }} }
                @case ('hourglass') { {{ 'runs.roundCards.hourglass' | translate: { seconds: (effects()!.clockBonusSeconds | appSeconds) } }} }
                @case ('three_choices') { {{ 'runs.roundCards.choicesHint' | translate }} }
                @case ('extend') { {{ 'runs.roundCards.extend' | translate: { seconds: (listenSeconds() | appSeconds) } }} }
                @default { {{ 'runs.cards.' + chip.card + '.name' | translate }} }
              }
            </span>
          </div>
        }
        @for (card of playableHand(); track card.slot) {
          <button type="button" class="flex items-center gap-2 px-3 py-1.5 text-left touch-manipulation disabled:opacity-50" [disabled]="busy() || !playable()"
            style="min-height:44px;background:var(--bg-surface-2);border:1px solid var(--border-neutral);border-radius:var(--radius-button)"
            (click)="playCard.emit(card.slot)" [attr.aria-label]="'runs.roundCards.play' | translate: { card: ('runs.cards.' + card.card + '.name' | translate) }"
            [attr.data-testid]="'run-play-' + card.card">
            <span class="text-[13px] font-bold" style="font-family:var(--font-clock)" [style.color]="color(card.card).color" aria-hidden="true">{{ glyph(card.card, values()) }}</span>
            <span class="text-[14px] font-semibold leading-tight" style="color:var(--text-hi)">{{ 'runs.cards.' + card.card + '.name' | translate }}</span>
          </button>
        }
      </div>
      @if (refused()) {
        <p class="text-[13px] mb-2" role="status" style="color:var(--text-muted)" data-testid="run-card-refused">{{ 'runs.roundCards.refused' | translate }}</p>
      }
    }
  `,
})
export class RunRoundCardsComponent {
  readonly hand = input.required<readonly RunHandCard[]>();
  readonly effects = input<RunTrackEffects | null>(null);
  /** Ce que valent les cartes de la playlist (règles figées). */
  readonly values = input<RunCardValues | null>(null);
  /** L'écoute du morceau en cours (celle de la Prolongation une fois jouée). */
  readonly listenSeconds = input(0);
  readonly busy = input(false);
  /** La manche accepte une carte (pendant la saisie seulement). */
  readonly playable = input(true);
  /** Le serveur a refusé la dernière carte jouée. */
  readonly refused = input(false);
  readonly playCard = output<number>();

  readonly lang = input('fr');
  protected readonly glyph = (card: RunCardKey, values: RunCardValues | null): string => cardGlyph(card, values, this.lang());
  protected readonly color = cardColor;
  protected readonly played = computed(() => playedCards(this.effects(), this.values(), this.lang()));
  protected readonly playableHand = computed(() => this.hand().filter(c => isPlayable(c.card, this.values())));

  private readonly playedChips = viewChildren<ElementRef<HTMLElement>>('chip');
  /** Les cartes jouées déjà affichées ; `null` avant le premier affichage (une reprise montre les siennes sans les animer). */
  private shown: number | null = null;

  constructor() {
    // Une carte jouée monte dans la carte du morceau (seulement celles qui viennent d'arriver ; rien en mouvement réduit).
    effect(() => {
      const chips = this.playedChips();
      if (this.shown !== null) chips.slice(this.shown).forEach(chip => riseCard(chip.nativeElement));
      this.shown = chips.length;
    });
  }
}
