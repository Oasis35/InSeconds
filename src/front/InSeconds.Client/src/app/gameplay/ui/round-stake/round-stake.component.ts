import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { motionReduced } from '../../../ui/motion/reduced-motion';

/** Durée du décompte quand les points baissent. */
const DROP_MS = 450;
/** Durée de vie du « −150 » qui s'envole (son animation `stake-drop`). */
const DROP_LABEL_MS = 900;

/**
 * Les points en jeu, à gauche du bouton du lecteur. Quand ils baissent (le joueur prolonge l'écoute ou prend un indice), le chiffre
 * décompte, la perte s'envole au-dessus (« −150 ») et le bloc rebondit un peu ; en mouvement réduit, le chiffre change simplement.
 */
@Component({
  selector: 'app-round-stake',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex flex-col items-center' },
  template: `
    @for (d of drops(); track d.id) {
      <span class="stake-drop absolute left-1/2 -top-5 text-xs font-semibold tabular-nums whitespace-nowrap pointer-events-none"
        style="font-family:var(--font-clock);color:var(--text-muted)" aria-hidden="true">−{{ d.amount }}</span>
    }
    <!-- Recréé à chaque baisse (identifiant neuf) : deux baisses rapprochées rebondissent deux fois. -->
    @for (bump of bumps(); track bump) {
      <span data-testid="round-stake" class="tabular-nums" [class.stake-bump]="bump > 0"
        style="font-family:var(--font-score);font-size:1.9rem;font-weight:900;line-height:0.95;letter-spacing:-0.02em;color:var(--text-hi)">{{ shown() }}</span>
    }
    <span class="text-xs mt-1" style="color:var(--text-muted)">{{ 'gameplay.round.stake' | translate }}</span>
  `,
  styles: `
    .stake-drop { animation: stake-drop 900ms ease-out forwards; }
    @keyframes stake-drop {
      0% { opacity: 0; transform: translate(-50%, 4px); }
      20% { opacity: 1; transform: translate(-50%, 0); }
      100% { opacity: 0; transform: translate(-50%, -14px); }
    }
    .stake-bump { display: inline-block; animation: stake-bump 350ms ease-out; }
    @keyframes stake-bump {
      50% { transform: scale(0.92); }
    }
  `,
})
export class RoundStakeComponent {
  readonly value = input.required<number>();

  protected readonly shown = signal(0);
  /** La dernière baisse, le temps que « −150 » s'envole (un identifiant neuf relance l'animation). */
  protected readonly drops = signal<readonly { id: number; amount: number }[]>([]);
  /** Le chiffre, sous un identifiant qui change à chaque baisse (0 : pas de rebond). */
  protected readonly bumps = signal<readonly number[]>([0]);

  constructor() {
    const reduced = motionReduced();
    let previous: number | null = null;
    let frame: number | null = null;
    let dropTimer: ReturnType<typeof setTimeout> | null = null;
    let nextId = 0;
    inject(DestroyRef).onDestroy(() => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (dropTimer !== null) clearTimeout(dropTimer);
    });
    effect(() => {
      const value = this.value();
      untracked(() => {
        const from = previous === null ? value : this.shown();
        previous = value;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        // Un nouveau morceau (les points remontent) ou le mouvement réduit : le chiffre change sans animation.
        if (reduced || value >= from) {
          this.shown.set(value);
          return;
        }
        if (dropTimer !== null) clearTimeout(dropTimer);
        const id = ++nextId;
        this.drops.set([{ id, amount: from - value }]);
        this.bumps.set([id]);
        dropTimer = setTimeout(() => this.drops.set([]), DROP_LABEL_MS);
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(Math.max((now - start) / DROP_MS, 0), 1);
          const eased = 1 - (1 - t) ** 3;
          this.shown.set(Math.round(from + (value - from) * eased));
          frame = t < 1 ? requestAnimationFrame(step) : null;
        };
        frame = requestAnimationFrame(step);
      });
    });
  }
}
