import { AdminGroup, filterGroups } from './admin-group';

function group(overrides: Partial<AdminGroup>): AdminGroup {
  return { id: 1, name: 'Les copains', memberCount: 3, ownerId: 'a', ownerPseudo: 'Alice', createdAt: '2026-11-01T10:00:00Z', ...overrides };
}

describe('admin-group', () => {
  const copains = group({});
  const voisins = group({ id: 2, name: 'Les voisins', ownerId: 'b', ownerPseudo: 'Bob' });
  const orphan = group({ id: 3, name: 'Sans pseudo', ownerPseudo: null });

  it('rend tout sans texte', () => {
    expect(filterGroups([copains, voisins], '  ')).toEqual([copains, voisins]);
  });

  it('cherche dans le nom et dans le pseudo du créateur, sans tenir compte de la casse', () => {
    expect(filterGroups([copains, voisins], 'VOISINS')).toEqual([voisins]);
    expect(filterGroups([copains, voisins], 'bob')).toEqual([voisins]);
  });

  it('un créateur sans pseudo ne correspond à rien mais le nom suffit', () => {
    expect(filterGroups([orphan], 'sans')).toEqual([orphan]);
    expect(filterGroups([orphan], 'alice')).toEqual([]);
  });
});
