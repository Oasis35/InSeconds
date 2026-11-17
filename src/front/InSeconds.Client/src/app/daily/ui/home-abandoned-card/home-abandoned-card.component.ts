import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { enterHomeCard } from '../../../ui/motion/motion';

/**
 * La carte du défi du jour abandonné sur l'accueil de la V4 : « Défi du jour », ce qui s'est passé et le compte à rebours jusqu'au prochain défi.
 * Contour discret : la prochaine action est la carte Survie.
 */
@Component({
  selector: 'app-home-abandoned-card',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-5 py-4 flex flex-col gap-1" data-testid="home-abandoned"
      style="background:var(--bg-surface);border:1px solid var(--border-medium)">
      <p class="text-sm" style="color:var(--text-light)">{{ 'daily.home.label' | translate }}</p>
      <h2 class="text-xl font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'daily.alreadyPlayed.abandonedTitle' | translate }}</h2>
      <p class="text-sm" style="color:var(--text-light)">
        {{ 'daily.alreadyPlayed.nextChallengeIn' | translate }}
        <b class="tabular-nums" style="font-family:var(--font-clock);color:var(--color-accent-2)" data-testid="home-abandoned-countdown">{{ countdown() }}</b>
      </p>
    </section>
  `,
})
export class HomeAbandonedCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => enterHomeCard(this.host.nativeElement));
  }

  readonly countdown = input.required<string>();
}
