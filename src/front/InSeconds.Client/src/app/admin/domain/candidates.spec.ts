import { candidate } from '../data-access/testing/fake-catalogue-api';
import { candidatesOf, isAddable, parseCandidateImport, sortCandidates } from './candidates';

describe('parseCandidateImport', () => {
  it('lit un identifiant par ligne, avec ou sans priorité', () => {
    const { items, issues } = parseCandidateImport('101\n102 A\n103;b\n104,C');
    expect(issues).toEqual([]);
    expect(items).toEqual([
      { deezerTrackId: 101, priority: null }, { deezerTrackId: 102, priority: 'A' },
      { deezerTrackId: 103, priority: 'B' }, { deezerTrackId: 104, priority: 'C' },
    ]);
  });

  it('applique la priorité par défaut aux identifiants sans priorité, sur une ou plusieurs par ligne', () => {
    const { items } = parseCandidateImport('1 2, 3\n4 A', 'B');
    expect(items.map(i => [i.deezerTrackId, i.priority])).toEqual([[1, 'B'], [2, 'B'], [3, 'B'], [4, 'A']]);
  });

  it('reconnaît une adresse Deezer, ignore commentaires, lignes vides, en-tête et doublons', () => {
    const { items, issues } = parseCandidateImport('﻿id;priorité\n# note\n\nhttps://www.deezer.com/fr/track/555?utm=1\n555\n');
    expect(issues).toEqual([]);
    expect(items).toEqual([{ deezerTrackId: 555, priority: null }]);
  });

  it('signale les lignes illisibles sans bloquer les autres', () => {
    const { items, issues } = parseCandidateImport('12\nbonjour\n13 Z\n14 15 A');
    expect(items.map(i => i.deezerTrackId)).toEqual([12]);
    expect(issues.map(i => i.line)).toEqual([2, 3, 4]);
  });
});

describe('candidats', () => {
  it('trie A, B, C, sans priorité, puis par rang décroissant', () => {
    const sorted = sortCandidates([
      candidate({ id: 1, priority: null, rank: 900 }), candidate({ id: 2, priority: 'B', rank: 10 }),
      candidate({ id: 3, priority: 'A', rank: 5 }), candidate({ id: 4, priority: 'A', rank: 50 }),
    ]);
    expect(sorted.map(c => c.id)).toEqual([4, 3, 2, 1]);
  });

  it('filtre par vue et par priorité', () => {
    const list = [candidate({ id: 1, priority: 'A' }), candidate({ id: 2, isDismissed: true }), candidate({ id: 3 })];
    expect(candidatesOf(list, 'todo', null).map(c => c.id)).toEqual([1, 3]);
    expect(candidatesOf(list, 'dismissed', null).map(c => c.id)).toEqual([2]);
    expect(candidatesOf(list, 'todo', 'none').map(c => c.id)).toEqual([3]);
    expect(candidatesOf(list, 'todo', 'A').map(c => c.id)).toEqual([1]);
  });

  it('ne laisse cocher que ce qui est lu, écoutable, pas au pool ni en cours d’ajout', () => {
    expect(isAddable(candidate())).toBe(true);
    expect(isAddable(candidate({ status: 'pending' }))).toBe(false);
    expect(isAddable(candidate({ preview: 'missing' }))).toBe(false);
    expect(isAddable(candidate({ inCatalogue: true }))).toBe(false);
    expect(isAddable(candidate({ isAdding: true }))).toBe(false);
  });
});
