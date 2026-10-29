import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { motionReduced } from '../../../ui/motion/reduced-motion';

/** Seuil de basses au-delà duquel une onde part (sur une montée seulement). */
const WAVE_THRESHOLD = 0.72;
/** Écart minimal entre deux ondes, en millisecondes. */
const WAVE_GAP_MS = 220;
/** Durée de vie d'une onde : un peu plus que son animation `membrane-wave` (700 ms). */
const WAVE_LIFE_MS = 750;
/** Amplitude du mouvement : 7 % de plus au plus fort des basses. */
const SKIN_AMPLITUDE = 0.07;

/**
 * Une membrane de haut-parleur : ce qu'elle entoure (le bouton du lecteur, puis la pochette à la révélation) se gonfle avec les basses
 * de l'extrait (`level`, de 0 à 1, précalculé : jamais d'analyse en direct, pièges 44 et 46), et une onde cyan part sur chaque coup de
 * basse. Rien ne bouge en mouvement réduit.
 */
@Component({
  selector: 'app-membrane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-grid place-items-center' },
  template: `
    @for (wave of waves(); track wave) {
      <span class="membrane-wave" aria-hidden="true"></span>
    }
    <div class="relative" [style.transform]="skin()"><ng-content /></div>
  `,
  styles: `
    .membrane-wave {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 2px solid var(--color-accent-2);
      opacity: 0;
      pointer-events: none;
      animation: membrane-wave 700ms ease-out forwards;
    }
    @keyframes membrane-wave {
      from { opacity: 0.55; transform: scale(1); }
      to { opacity: 0; transform: scale(1.85); }
    }
  `,
})
export class MembraneComponent {
  /** L'énergie des basses à l'instant, de 0 à 1 (0 à l'arrêt). */
  readonly level = input(0);

  private readonly reduced = motionReduced();
  protected readonly waves = signal<readonly number[]>([]);
  protected readonly skin = computed(() => (this.reduced ? null : `scale(${1 + SKIN_AMPLITUDE * this.level()})`));

  constructor() {
    if (this.reduced) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    inject(DestroyRef).onDestroy(() => timers.forEach(clearTimeout));
    let smoothed = 0;
    let lastWave = -Infinity;
    let nextId = 0;
    effect(() => {
      const level = this.level();
      untracked(() => {
        const now = performance.now();
        if (level > WAVE_THRESHOLD && smoothed <= WAVE_THRESHOLD && now - lastWave > WAVE_GAP_MS) {
          lastWave = now;
          const id = nextId++;
          this.waves.update(waves => [...waves, id]);
          const timer = setTimeout(() => {
            timers.delete(timer);
            this.waves.update(waves => waves.filter(w => w !== id));
          }, WAVE_LIFE_MS);
          timers.add(timer);
        }
        smoothed = smoothed * 0.6 + level * 0.4;
      });
    });
  }
}
