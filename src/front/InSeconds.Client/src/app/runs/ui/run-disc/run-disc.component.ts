import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** La couleur de chaque disque (`runs.discs.*`) ; un disque inconnu (échelle future) prend celle de l'or. */
const DISC_COLORS: Readonly<Record<string, string>> = {
  'runs.discs.scratched': 'var(--disc-scratched)',
  'runs.discs.wax': 'var(--disc-wax)',
  'runs.discs.bronze': 'var(--disc-bronze)',
  'runs.discs.silver': 'var(--disc-silver)',
  'runs.discs.gold': 'var(--disc-gold)',
};

/** Le disque dessiné (or, argent, bronze, cire, rayé) : sillons, étiquette, trou central ; le disque d'or brille. Purement décoratif. */
@Component({
  selector: 'app-run-disc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 100 100" aria-hidden="true" [attr.data-disc]="disc()"
      [style.filter]="gold() ? 'drop-shadow(0 0 10px rgb(var(--rgb-warning) / 0.55))' : null">
      <circle cx="50" cy="50" r="47" [attr.fill]="color()" stroke="rgb(255 255 255 / 0.35)" stroke-width="3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgb(0 0 0 / 0.14)" stroke-width="1.5" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgb(0 0 0 / 0.14)" stroke-width="1.5" />
      <circle cx="50" cy="50" r="19" [attr.fill]="color()" />
      <circle cx="50" cy="50" r="19" fill="rgb(255 255 255 / 0.28)" />
      <circle cx="50" cy="50" r="6" fill="var(--bg-page)" />
      @if (scratched()) {
        <path d="M22 30 L44 56 M60 18 L78 46 M30 72 L52 84" stroke="rgb(0 0 0 / 0.4)" stroke-width="1.6" stroke-linecap="round" />
      }
    </svg>
  `,
})
export class RunDiscComponent {
  /** La clé du disque (`runs.discs.gold`…). */
  readonly disc = input.required<string>();
  readonly size = input(96);

  protected readonly color = computed(() => DISC_COLORS[this.disc()] ?? DISC_COLORS['runs.discs.gold']);
  protected readonly gold = computed(() => this.disc() === 'runs.discs.gold');
  protected readonly scratched = computed(() => this.disc() === 'runs.discs.scratched');
}
