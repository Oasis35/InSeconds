// Étapes E2E qui doivent s'enchaîner dans l'ordre (morceau après morceau, palier après palier) :
// chaque étape attend la fin de la précédente. Remplace un `await` dans une boucle `for` (Sonar S9382)
// sans paralléliser, ce qui casserait le parcours.

/** Exécute `step` sur chaque élément, l'un après l'autre. */
export function inSequence<T>(
  items: readonly T[],
  step: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
  return items.reduce<Promise<void>>(
    (previous, item, index) =>
      previous.then(async () => {
        await step(item, index);
      }),
    Promise.resolve(),
  );
}

/** Exécute `step` `count` fois, l'une après l'autre. */
export function times(count: number, step: (index: number) => Promise<unknown>): Promise<void> {
  return inSequence(
    Array.from({ length: count }, (_, index) => index),
    step,
  );
}
