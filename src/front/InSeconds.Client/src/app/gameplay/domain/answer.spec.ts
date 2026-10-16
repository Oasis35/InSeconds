import { moveHighlight, resolveAnswer, suggestionLabel } from './answer';

describe('resolveAnswer', () => {
  it('prend la proposition choisie telle quelle', () => {
    const answer = resolveAnswer({ query: 'Daft - Get', selected: { artist: ' Daft Punk ', title: 'Get Lucky' } });
    expect(answer).toEqual({ artist: 'Daft Punk', title: 'Get Lucky' });
  });

  it('coupe le texte libre au premier « - »', () => {
    expect(resolveAnswer({ query: 'Daft Punk - Get Lucky', selected: null })).toEqual({ artist: 'Daft Punk', title: 'Get Lucky' });
  });

  it('garde les « - » suivants dans le titre', () => {
    expect(resolveAnswer({ query: 'Jay-Z - 99 Problems - Remix', selected: null })).toEqual({
      artist: 'Jay-Z',
      title: '99 Problems - Remix',
    });
  });

  it('sans séparateur, le texte libre est l\'artiste', () => {
    expect(resolveAnswer({ query: 'Daft Punk', selected: null })).toEqual({ artist: 'Daft Punk', title: null });
  });

  it('donne null des deux côtés pour un champ vide ou blanc', () => {
    expect(resolveAnswer({ query: '', selected: null })).toEqual({ artist: null, title: null });
    expect(resolveAnswer({ query: '   ', selected: null })).toEqual({ artist: null, title: null });
  });
});

describe('moveHighlight', () => {
  it('descend et remonte en boucle', () => {
    expect(moveHighlight(0, 3, 1)).toBe(1);
    expect(moveHighlight(2, 3, 1)).toBe(0);
    expect(moveHighlight(0, 3, -1)).toBe(2);
    expect(moveHighlight(2, 3, -1)).toBe(1);
  });

  it('depuis « aucune », ↓ va au premier et ↑ au dernier', () => {
    expect(moveHighlight(-1, 4, 1)).toBe(0);
    expect(moveHighlight(-1, 4, -1)).toBe(3);
  });

  it('ne choisit rien dans une liste vide', () => {
    expect(moveHighlight(-1, 0, 1)).toBe(-1);
  });
});

it('suggestionLabel écrit « artiste - titre »', () => {
  expect(suggestionLabel({ artist: 'Daft Punk', title: 'Get Lucky' })).toBe('Daft Punk - Get Lucky');
});
