import { toJobState } from './job';

describe('état du dernier passage', () => {
  it('lit les états connus', () => {
    for (const state of ['queued', 'processing', 'succeeded', 'failed', 'retry_scheduled', 'deleted'] as const) expect(toJobState(state)).toBe(state);
  });

  it('pas d\'état : aucun passage à montrer', () => {
    expect(toJobState(undefined)).toBeNull();
    expect(toJobState(null)).toBeNull();
  });

  it('un état inconnu est traité comme « en cours »', () => {
    expect(toJobState('nouvel_etat')).toBe('processing');
  });
});
