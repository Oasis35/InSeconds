/** Un Hit : un jalon obtenu en jouant. `progress` et `target` pour ceux qui se comptent (« 7 / 10 »), vides sinon. */
export interface RunHit {
  /** Son nom d'API (`first_setlist`) : la clé de traduction est `runs.hits.names.<key>`. */
  readonly key: string;
  readonly earned: boolean;
  readonly progress: number | null;
  readonly target: number | null;
}

/** Le Hit des groupes : le seul que le mode ne connaît pas, il vient des groupes du joueur. */
export const FIRST_GROUP_HIT = 'first_group';
/** Il se range après ce Hit, avec les débuts. */
const FIRST_GROUP_AFTER = 'first_risky_round';

/** Les Hits du mode avec celui des groupes à sa place. */
export function withGroupHit(hits: readonly RunHit[], hasGroup: boolean): RunHit[] {
  const group: RunHit = { key: FIRST_GROUP_HIT, earned: hasGroup, progress: null, target: null };
  const index = hits.findIndex(hit => hit.key === FIRST_GROUP_AFTER);
  return index < 0 ? [...hits, group] : [...hits.slice(0, index + 1), group, ...hits.slice(index + 1)];
}

export const earnedKeys = (hits: readonly RunHit[]): string[] => hits.filter(hit => hit.earned).map(hit => hit.key);

/**
 * Les Hits obtenus que ce navigateur n'a pas encore montrés. `seen` vide (`null`) : première lecture sur ce navigateur, rien n'est nouveau (on ne
 * fête pas d'un coup tout ce qu'un joueur a déjà).
 */
export function freshHits(hits: readonly RunHit[], seen: readonly string[] | null): string[] {
  return seen === null ? [] : earnedKeys(hits).filter(key => !seen.includes(key));
}

/** La part d'un Hit qui se compte, de 0 à 100 ; vide pour les autres. */
export function hitPercent(hit: RunHit): number | null {
  if (hit.progress === null || hit.target === null || hit.target <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((hit.progress * 100) / hit.target)));
}
