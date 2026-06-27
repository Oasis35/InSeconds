/**
 * Anime un compteur de 0 jusqu'à `target` via requestAnimationFrame (easing quadratique).
 *
 * Pas d'animation si mouvement réduit demandé (accessibilité) ou en contexte de test
 * (flag __disableAnimations posé par Playwright) : l'animation rAF ne tourne pas sous
 * une horloge figée par page.clock, la valeur finale doit donc être posée immédiatement.
 */
export function countUp(target: number, setter: (v: number) => void, duration = 600): void {
  if (target === 0) { setter(0); return; }
  const reduced =
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    || (typeof globalThis.window !== 'undefined' && (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations === true);
  if (reduced) { setter(target); return; }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    setter(Math.round(t * t * target));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
