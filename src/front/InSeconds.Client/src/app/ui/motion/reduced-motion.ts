/**
 * Le mouvement doit rester sobre : le joueur a demandé un mouvement réduit (accessibilité), ou les tests de bout en bout ont coupé les
 * animations (drapeau `__disableAnimations` posé par Playwright : une animation ne tourne pas sous une horloge figée par `page.clock`).
 */
export function motionReduced(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    || (globalThis.window as { __disableAnimations?: boolean } | undefined)?.__disableAnimations === true;
}
