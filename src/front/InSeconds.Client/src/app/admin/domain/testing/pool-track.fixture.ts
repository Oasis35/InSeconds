import { ModeUsage, PoolTrack } from '../pool-track';

/**
 * Un morceau du pool pour les tests. `usageCount`, `lastUsedDate` et `unlockDate` décrivent l'usage du Daily (une entrée
 * `daily` dans `usages` dès qu'un d'eux est donné) ; `usedByMode` déclare le morceau joué par un autre mode, sans apparition.
 */
export type PoolTrackFixture = Partial<PoolTrack> & {
  readonly usageCount?: number;
  readonly lastUsedDate?: string | null;
  readonly unlockDate?: string | null;
  readonly usedByMode?: boolean;
};

export function poolTrack(overrides: PoolTrackFixture = {}): PoolTrack {
  const { usageCount, lastUsedDate, unlockDate, usedByMode, ...own } = overrides;
  const inToday = own.inTodayChallenge ?? false;
  const dailyPlayed = (usageCount ?? 0) > 0 || (lastUsedDate ?? null) !== null || inToday;
  const daily: ModeUsage[] = dailyPlayed
    ? [{ mode: 'daily', usageCount: usageCount ?? 1, lastUsedDate: lastUsedDate ?? null, unlockDate: unlockDate ?? null, inTodayChallenge: inToday }]
    : [];
  const usages = own.usages ?? daily;
  return {
    id: 1, deezerTrackId: 1000, artist: 'Artiste', title: 'Titre', preview: 'available', isDisabled: false,
    isUsed: usages.length > 0 || (usedByMode ?? false), usages, inTodayChallenge: inToday, ...own,
  };
}
