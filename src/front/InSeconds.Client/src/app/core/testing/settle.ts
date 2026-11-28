import { ComponentFixture } from '@angular/core/testing';

/**
 * Laisse passer les microtâches en attente (promesses déjà résolues, `await` en cours, modules déjà chargés) : un saut vers la tâche
 * suivante du navigateur, donc aucune durée à régler et rien qui dépende de la vitesse de la machine.
 *
 * Sous `vi.useFakeTimers()` le minuteur ne partirait jamais : utiliser alors `await vi.advanceTimersByTimeAsync(0)`.
 * Pour attendre un résultat qui doit arriver, préférer `await vi.waitFor(() => expect(…))` : ce helper-ci ne prouve que
 * « ce qui était déjà en route est arrivé », ce qui suffit pour affirmer qu'une chose n'a pas eu lieu.
 */
export const flushMicrotasks = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Laisse passer les promesses en attente (appels API simulés) puis rafraîchit l'écran. Un tour de
 * boucle d'événements entre les deux : `whenStable` n'attend pas les micro-tâches des stores.
 */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await flushMicrotasks();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
