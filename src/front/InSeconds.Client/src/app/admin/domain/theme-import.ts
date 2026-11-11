import { PoolTheme, PoolTrack, ThemeAssignment } from './pool-track';
import { foldText } from './themes';

/** Une ligne d'un classement : un thème (tel qu'écrit) et un morceau du pool (son identifiant). */
export interface ClassificationLine {
  readonly line: number;
  readonly themeName: string;
  readonly trackId: number;
}

/** Une ligne qu'on n'a pas pu lire (numéro à partir de 1, texte tel qu'écrit). */
export interface ClassificationIssue {
  readonly line: number;
  readonly text: string;
}

export interface ParsedClassification {
  readonly lines: readonly ClassificationLine[];
  readonly issues: readonly ClassificationIssue[];
}

/**
 * Lit un classement collé ou lu dans un fichier : une ligne par couple « thème ; id du morceau » (séparateur `;` ou tabulation), plusieurs
 * identifiants possibles après le thème (séparés par des espaces ou des virgules). Les lignes vides, celles qui commencent par `#` et
 * l'en-tête d'un fichier exporté (première ligne dont le second champ n'est pas un nombre) sont ignorées.
 */
export function parseClassification(text: string): ParsedClassification {
  const lines: ClassificationLine[] = [];
  const issues: ClassificationIssue[] = [];
  let first = true;
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const isFirst = first;
    first = false;
    const cut = separatorIndex(trimmed);
    const themeName = cut < 0 ? '' : unquote(trimmed.slice(0, cut));
    const ids = cut < 0 ? [] : trimmed.slice(cut + 1).split(/[\s,;]+/).filter(Boolean);
    if (themeName !== '' && ids.length > 0 && ids.every(id => /^\d+$/.test(id))) {
      for (const id of ids) lines.push({ line, themeName, trackId: Number(id) });
    } else if (!(isFirst && /^(id|identifiant)$/i.test(ids[0] ?? ''))) {
      // Seule la première ligne dont le second champ est « id » est l'en-tête d'un fichier exporté ; toute autre ligne illisible est signalée.
      issues.push({ line, text: trimmed });
    }
  });
  return { lines, issues };
}

/** Où finit le nom du thème : le premier `;` ou tabulation, sauf dans un nom entre guillemets (`-1` : aucun). */
function separatorIndex(text: string): number {
  if (!text.startsWith('"')) return text.search(/[;\t]/);
  let i = 1;
  while (i < text.length) {
    if (text[i] === '"') {
      if (text[i + 1] === '"') { i += 2; continue; }
      const rest = text.slice(i + 1).search(/[;\t]/);
      return rest < 0 ? -1 : i + 1 + rest;
    }
    i++;
  }
  return -1;
}

function unquote(value: string): string {
  const v = value.trim();
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replaceAll('""', '"').trim() : v;
}

/** Un morceau d'un thème dans l'aperçu : nouveau (sera ajouté) ou déjà dans le thème. */
export interface PreviewTrack {
  readonly track: PoolTrack;
  readonly alreadyIn: boolean;
}

/** Ce que le classement fait à un thème. */
export interface PreviewGroup {
  readonly themeName: string;
  /** `null` : aucun thème de ce nom (le classement n'en crée jamais). */
  readonly themeId: number | null;
  readonly tracks: readonly PreviewTrack[];
  /** Les morceaux qui seront ajoutés (ni déjà là, ni retirés de l'aperçu). */
  readonly toAdd: number;
}

export interface ImportPreview {
  readonly groups: readonly PreviewGroup[];
  /** Les identifiants absents du pool, avec la ligne où on les a lus. */
  readonly unknownTracks: readonly ClassificationLine[];
  readonly issues: readonly ClassificationIssue[];
}

/**
 * L'aperçu d'un classement avant de l'appliquer, calculé sur le pool et les thèmes déjà lus : rien ne se crée (un thème inconnu est signalé),
 * rien ne se retire. Un morceau cité deux fois pour le même thème compte une fois. `excluded` : les `thème|morceau` que l'admin a décochés.
 */
export function previewImport(
  parsed: ParsedClassification, themes: readonly PoolTheme[], tracks: readonly PoolTrack[], excluded: ReadonlySet<string> = new Set(),
): ImportPreview {
  const themeByName = new Map(themes.map(t => [foldText(t.name.trim()), t]));
  const trackById = new Map(tracks.map(t => [t.id, t]));
  const order: string[] = [];
  const byTheme = new Map<string, { name: string; theme: PoolTheme | null; ids: Set<number> }>();
  const unknownTracks: ClassificationLine[] = [];

  for (const line of parsed.lines) {
    if (!trackById.has(line.trackId)) { unknownTracks.push(line); continue; }
    const key = foldText(line.themeName);
    let group = byTheme.get(key);
    if (!group) {
      group = { name: themeByName.get(key)?.name ?? line.themeName, theme: themeByName.get(key) ?? null, ids: new Set() };
      byTheme.set(key, group);
      order.push(key);
    }
    group.ids.add(line.trackId);
  }

  const groups = order.map(key => {
    const g = byTheme.get(key)!;
    const previewTracks = [...g.ids].map(id => trackById.get(id)!).map(track => ({ track, alreadyIn: !!g.theme && track.themeIds.includes(g.theme.id) }));
    const toAdd = g.theme ? previewTracks.filter(p => !p.alreadyIn && !excluded.has(exclusionKey(g.theme!.id, p.track.id))).length : 0;
    return { themeName: g.name, themeId: g.theme?.id ?? null, tracks: previewTracks, toAdd };
  });
  return { groups, unknownTracks, issues: parsed.issues };
}

export function exclusionKey(themeId: number, trackId: number): string {
  return `${themeId}|${trackId}`;
}

/** Ce que l'aperçu envoie au serveur : les morceaux à ajouter, thème par thème, sans les déjà-là ni les décochés. */
export function assignmentsOf(preview: ImportPreview, excluded: ReadonlySet<string> = new Set()): ThemeAssignment[] {
  return preview.groups.flatMap(group => {
    if (group.themeId === null) return [];
    const themeId = group.themeId;
    const trackIds = group.tracks.filter(p => !p.alreadyIn && !excluded.has(exclusionKey(themeId, p.track.id))).map(p => p.track.id);
    return trackIds.length > 0 ? [{ themeId, trackIds }] : [];
  });
}

export function totalToAdd(preview: ImportPreview): number {
  return preview.groups.reduce((sum, g) => sum + g.toAdd, 0);
}

/** Le nom du fichier d'export du pool, avec la date et l'heure locales (aaaa-mm-jj_hh-mm-ss) : plusieurs exports de suite ne s'écrasent pas. */
export function poolCsvFileName(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const time = `${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;
  return `inseconds-pool-${day}_${time}.csv`;
}

/**
 * Le pool en CSV (séparateur `;`, ouvert tel quel par un tableur français, d'où le BOM UTF-8 : sans lui Excel lit les accents en ANSI) : une ligne par morceau avec son identifiant, son artiste, son
 * titre, son année, ses genres et ses thèmes actuels. C'est ce fichier qu'on donne à Claude pour qu'il rende un classement.
 */
export function poolToCsv(tracks: readonly PoolTrack[], themes: readonly PoolTheme[]): string {
  const names = new Map(themes.map(t => [t.id, t.name]));
  const rows = tracks.map(t => [
    String(t.id), t.artist, t.title, t.releaseYear === null ? '' : String(t.releaseYear), t.genres.join(' / '),
    t.themeIds.map(id => names.get(id)).filter((n): n is string => !!n).join(' / '),
  ]);
  return '\uFEFF' + [['id', 'artiste', 'titre', 'année', 'genres', 'thèmes'], ...rows].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
