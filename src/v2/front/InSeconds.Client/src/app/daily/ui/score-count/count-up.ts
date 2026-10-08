/**
 * Anime un compteur de 0 jusqu'à `target` par `requestAnimationFrame` (easing quadratique).
 *
 * Pas d'animation si le mouvement réduit est demandé (accessibilité) ou en contexte de test (drapeau `__disableAnimations` posé par
 * Playwright) : l'animation ne tourne pas sous une horloge figée par `page.clock`, la valeur finale est donc posée tout de suite.
 */
export function countUp(target: number, setter: (value: number) => void, duration = 600): void {
  if (target === 0) {
    setter(0);
    return;
  }
  const reduced =
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    (globalThis.window !== undefined && (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations === true);
  if (reduced) {
    setter(target);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    // Le premier rappel peut porter l'heure du début de l'image, un peu avant `start` : jamais de temps négatif.
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
    setter(Math.round(t * t * target));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
