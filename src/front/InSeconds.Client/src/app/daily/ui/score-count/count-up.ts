import { motionReduced } from '../../../ui/motion/reduced-motion';

/**
 * Anime un compteur de `from` (0 par défaut) jusqu'à `target` par `requestAnimationFrame` (easing quadratique).
 *
 * Pas d'animation si le mouvement réduit est demandé (accessibilité) ou en contexte de test (drapeau `__disableAnimations` posé par
 * Playwright) : l'animation ne tourne pas sous une horloge figée par `page.clock`, la valeur finale est donc posée tout de suite.
 */
export function countUp(target: number, setter: (value: number) => void, duration = 600, from = 0): void {
  if (target === from || motionReduced()) {
    setter(target);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    // Le premier rappel peut porter l'heure du début de l'image, un peu avant `start` : jamais de temps négatif.
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
    setter(Math.round(from + t * t * (target - from)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
