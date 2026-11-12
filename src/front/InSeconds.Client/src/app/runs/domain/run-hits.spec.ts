import { FIRST_GROUP_HIT, RunHit, earnedKeys, freshHits, hitPercent, withGroupHit } from './run-hits';

const hit = (key: string, earned = false, progress: number | null = null, target: number | null = null): RunHit => ({ key, earned, progress, target });

describe('run-hits (domaine)', () => {
  it('range le Hit des groupes après les débuts', () => {
    const hits = withGroupHit([hit('first_setlist', true), hit('first_risky_round'), hit('ten_setlists')], true);

    expect(hits.map(h => h.key)).toEqual(['first_setlist', 'first_risky_round', FIRST_GROUP_HIT, 'ten_setlists']);
    expect(hits[2].earned).toBe(true);
    expect(withGroupHit([hit('x')], false).map(h => h.key)).toEqual(['x', FIRST_GROUP_HIT]);
  });

  it('ne fête rien à la première lecture, puis seulement les nouveaux', () => {
    const hits = [hit('a', true), hit('b', true), hit('c')];

    expect(earnedKeys(hits)).toEqual(['a', 'b']);
    expect(freshHits(hits, null)).toEqual([]);
    expect(freshHits(hits, ['a'])).toEqual(['b']);
    expect(freshHits(hits, ['a', 'b'])).toEqual([]);
  });

  it('donne la part d\'un Hit qui se compte', () => {
    expect(hitPercent(hit('ten', false, 7, 10))).toBe(70);
    expect(hitPercent(hit('ten', true, 12, 10))).toBe(100);
    expect(hitPercent(hit('one'))).toBeNull();
  });
});
