import { GROUPS_ANNOUNCE_UNTIL, announceActive, announceVariant } from './groups-announce';

describe('annonce des groupes', () => {
  it("elle s'arrête après le dernier jour, ce jour compris", () => {
    expect(announceActive('2026-11-20')).toBe(true);
    expect(announceActive(GROUPS_ANNOUNCE_UNTIL)).toBe(true);
    expect(announceActive('2026-12-12')).toBe(false);
  });

  it('la variante suit les groupes du compte', () => {
    expect(announceVariant(0)).toBe('no_group');
    expect(announceVariant(2)).toBe('member');
  });
});
