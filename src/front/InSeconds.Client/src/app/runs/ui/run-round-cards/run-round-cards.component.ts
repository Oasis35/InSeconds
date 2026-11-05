import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, viewChildren } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { enterCard } from '../../../ui/motion/motion';
import { RunCardKey, RunHandCard, RunTrackEffects, cardGlyph, initialsLabel } from '../../domain/run-cards';

/** Ce qu'une carte jouée affiche dans la carte du morceau. */
interface PlayedChip {
  readonly card: RunCardKey;
  /** Ce qu'elle révèle (année, initiales), à mettre en avant ; sinon son effet en clair. */
  readonly value: string | null;
}

/**
 * Les coups de pouce sur l'écran de manche, au-dessus du champ de saisie (docs/runs/proto2.md § Les coups de pouce) : d'abord ce que les cartes
 * déjà jouées sur ce morceau révèlent (l'année, les initiales…, montées dans la carte du morceau), puis les cartes de la main, à toucher pour les
 * jouer. Présentation seule : la page relaie le toucher au store, le serveur calcule chaque effet.
 */
@Component({
  selector: 'app-run-round-cards',
  imports: [TranslatePipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (played().length > 0 || hand().length > 0) {
      <div class="grid grid-cols-2 gap-2" data-testid="run-round-cards">
        @for (chip of played(); track chip.card) {
          <div #played class="flex items-center gap-2 px-3 py-1.5" data-testid="run-card-effect" [attr.data-card]="chip.card"
            style="min-height:44px;border:1px solid var(--color-accent);border-radius:var(--radius-button);background:rgb(var(--rgb-accent) / 0.08)">
            @if (chip.value) {
              <span class="text-[15px] font-bold" style="font-family:var(--font-clock);color:var(--color-accent)">{{ chip.value }}</span>
            }
            <span class="text-[13px] font-semibold leading-tight" style="color:var(--text-hi)">
              @switch (chip.card) {
                @case ('net') { {{ 'runs.roundCards.net' | translate }} }
                @case ('lower_target') { {{ 'runs.roundCards.lowerTarget' | translate }} }
                @case ('hourglass') { {{ 'runs.roundCards.hourglass' | translate: { seconds: (effects()!.clockBonusSeconds | appSeconds) } }} }
                @case ('three_choices') { {{ 'runs.roundCards.choicesHint' | translate }} }
                @default { {{ 'runs.cards.' + chip.card + '.name' | translate }} }
              }
            </span>
          </div>
        }
        @for (card of hand(); track card.slot) {
          <button type="button" class="flex items-center gap-2 px-3 py-1.5 text-left touch-manipulation" [disabled]="busy()"
            style="min-height:44px;background:var(--bg-surface-2);border:1px solid var(--border-strong);border-radius:var(--radius-button)"
            (click)="play.emit(card.slot)" [attr.aria-label]="'runs.roundCards.play' | translate: { card: ('runs.cards.' + card.card + '.name' | translate) }"
            [attr.data-testid]="'run-play-' + card.card">
            <span class="text-[13px] font-bold" style="font-family:var(--font-clock);color:var(--color-accent)" aria-hidden="true">{{ glyph(card.card) }}</span>
            <span class="text-[14px] font-semibold leading-tight" style="color:var(--text-hi)">{{ 'runs.cards.' + card.card + '.name' | translate }}</span>
          </button>
        }
      </div>
    }
  `,
})
export class RunRoundCardsComponent {
  readonly hand = input.required<readonly RunHandCard[]>();
  readonly effects = input<RunTrackEffects | null>(null);
  readonly busy = input(false);
  readonly play = output<number>();

  protected readonly glyph = cardGlyph;
  /** Les cartes jouées sur ce morceau, avec ce qu'elles révèlent ; le Joker n'en laisse rien (il a changé de morceau). */
  protected readonly played = computed<PlayedChip[]>(() => {
    const effects = this.effects();
    if (!effects) return [];
    return effects.cards.filter(card => card !== 'joker').map(card => ({ card, value: valueOf(card, effects) }));
  });

  private readonly playedChips = viewChildren<ElementRef<HTMLElement>>('played');
  private shown = 0;

  constructor() {
    // Une carte jouée monte dans la carte du morceau (seulement celles qui viennent d'arriver ; rien en mouvement réduit).
    effect(() => {
      const chips = this.playedChips();
      chips.slice(this.shown).forEach(chip => enterCard(chip.nativeElement));
      this.shown = chips.length;
    });
  }
}

function valueOf(card: RunCardKey, effects: RunTrackEffects): string | null {
  switch (card) {
    case 'year':
      return effects.year === null ? null : String(effects.year);
    case 'initials':
      return effects.artistInitials && effects.titleInitials
        ? `${initialsLabel(effects.artistInitials)} – ${initialsLabel(effects.titleInitials)}`
        : null;
    case 'lower_target':
      return '−20 %';
    default:
      return null;
  }
}
