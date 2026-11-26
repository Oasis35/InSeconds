import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { celebrateMilestone } from '../../../ui/motion/motion';
import { Streak, pluralKey, streakMilestoneState, streakPillMode } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/**
 * Relevé de série sous « Commencer » : flamme et jours de série, puis le stock de gels pour un compte connecté, en texte, sans pastille ni
 * lueur. Rien quand aucune série n'est en cours. Un toucher émet `open` (panneau de série). Un jalon (7, 14, 30 jours…) remplit la pastille
 * d'orange le jour où il est atteint ; la veille, elle prend un contour en pointillés. Le jour même, `celebrate` joue l'animation une fois.
 */
@Component({
  selector: 'app-streak-pill',
  imports: [TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-pill.component.html',
})
export class StreakPillComponent {
  readonly streak = input.required<Streak | null>();
  readonly linked = input.required<boolean>();
  /** Dans un conteneur `@container` : sous 22 rem de large, la flamme et le gel s'empilent (alignés à droite) au lieu d'être côte à côte. */
  readonly stackWhenNarrow = input(false);
  /** Joue l'animation du jalon à l'affichage (la carte du résultat, au moment où la partie vient de le donner). */
  readonly celebrate = input(false);
  readonly open = output<void>();

  protected readonly labelKey = computed(() => `daily.streakFreeze.pillLabel.${pluralKey(this.streak()?.streak ?? 0)}`);
  protected readonly daysKey = computed(() => `daily.streakFreeze.pillDays.${pluralKey(this.streak()?.streak ?? 0)}`);
  protected readonly freezesKey = computed(() => `daily.streakFreeze.pillFreezes.${pluralKey(this.streak()?.freezes ?? 0)}`);

  protected readonly milestone = computed(() => (this.pillMode() === 'lost' ? null : streakMilestoneState(this.streak(), new Date().toISOString().slice(0, 10))));

  private readonly ring = viewChild<ElementRef<HTMLElement>>('ring');
  private readonly flame = viewChild<ElementRef<HTMLElement>>('flame');
  private readonly days = viewChild<ElementRef<HTMLElement>>('days');

  private played = false;

  constructor() {
    // Une seule fois par pastille, dès que le jalon et ses éléments sont à l'écran (la série peut arriver après le premier rendu).
    effect(() => {
      const ring = this.ring()?.nativeElement;
      const flame = this.flame()?.nativeElement;
      const days = this.days()?.nativeElement;
      if (this.played || !this.celebrate() || this.milestone() !== 'reached' || !ring || !flame || !days) return;
      this.played = true;
      celebrateMilestone({ days, flame, ring });
    });
  }

  protected readonly pillMode = computed(() => streakPillMode(this.streak(), this.linked()));
}
