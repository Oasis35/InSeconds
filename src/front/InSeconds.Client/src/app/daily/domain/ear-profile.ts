/** Le profil d'oreille : les chiffres du joueur dans la durée, comparés à tous les joueurs au-dessus des seuils. TypeScript pur. */

export type ProfilePeriod = '8w' | '6m' | 'all';

/** Un point de la courbe : la semaine (8 semaines) ou le mois (6 mois, depuis le début) qui commence à `start`. */
export interface ProfilePoint {
  /** `aaaa-mm-jj`. */
  readonly start: string;
  readonly average: number | null;
  readonly playersAverage: number | null;
  readonly games: number;
}

export interface ProfileStep {
  readonly seconds: number;
  readonly percent: number;
  readonly playersPercent: number | null;
}

export interface EarProfile {
  readonly period: ProfilePeriod;
  readonly points: readonly ProfilePoint[];
  readonly averageScore: number | null;
  readonly trendPercent: number | null;
  readonly gamesPlayed: number;
  readonly bestScore: number | null;
  readonly bestStreak: number;
  readonly firstStepSeconds: number;
  readonly firstStepFound: number;
  readonly steps: readonly ProfileStep[];
  readonly notFoundPercent: number | null;
  readonly playersNotFoundPercent: number | null;
  readonly artistFoundPercent: number | null;
  readonly titleFoundPercent: number | null;
  readonly playersArtistFoundPercent: number | null;
  readonly playersTitleFoundPercent: number | null;
}

/** Le palier où il trouve le plus souvent (le premier en cas d'égalité) ; `null` s'il n'a rien trouvé. */
export function favouriteStep(steps: readonly ProfileStep[]): number | null {
  let best: ProfileStep | null = null;
  for (const step of steps) if (step.percent > 0 && (best === null || step.percent > best.percent)) best = step;
  return best?.seconds ?? null;
}

/** La même chose chez les joueurs ; `null` sans comparaison. */
export function playersFavouriteStep(steps: readonly ProfileStep[]): number | null {
  let best: ProfileStep | null = null;
  for (const step of steps) if ((step.playersPercent ?? 0) > 0 && (best === null || step.playersPercent! > best.playersPercent!)) best = step;
  return best?.seconds ?? null;
}

/** Une courbe en points SVG : chaque valeur sur une hauteur de `height`, entre `min` et `max`, réparties sur `width`. Les trous sont sautés. */
export interface ChartLine {
  readonly points: string;
  readonly last: { readonly x: number; readonly y: number } | null;
}

export function chartLine(values: readonly (number | null)[], min: number, max: number, width: number, height: number, pad = 4): ChartLine {
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const coords: { x: number; y: number }[] = [];
  values.forEach((value, i) => {
    if (value === null) return;
    coords.push({ x: Math.round(pad + i * step), y: Math.round(height - pad - ((value - min) / span) * (height - pad * 2)) });
  });
  return { points: coords.map(c => `${c.x},${c.y}`).join(' '), last: coords.at(-1) ?? null };
}

/** Les bornes de la courbe : un peu de marge autour des valeurs des deux courbes ; `null` sans aucune valeur. */
export function chartBounds(points: readonly ProfilePoint[]): { min: number; max: number } | null {
  const values = points.flatMap(p => [p.average, p.playersAverage]).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const margin = Math.max(100, Math.round((max - min) * 0.15));
  return { min: Math.max(0, min - margin), max: max + margin };
}
