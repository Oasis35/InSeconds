import { isSettled, toJobState } from './job';

describe('état d\'une exécution', () => {
  it('attend tant que la tâche est en file ou en cours', () => {
    expect(isSettled('queued')).toBe(false);
    expect(isSettled('processing')).toBe(false);
  });

  it('arrête d\'attendre une tâche réussie, échouée, supprimée ou en attente d\'un réessai', () => {
    for (const state of ['succeeded', 'failed', 'deleted', 'retry_scheduled'] as const) expect(isSettled(state)).toBe(true);
  });

  it('un état inconnu est traité comme « en cours »', () => {
    expect(toJobState('succeeded')).toBe('succeeded');
    expect(toJobState('nouvel_etat')).toBe('processing');
  });
});
