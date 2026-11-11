/** La priorité qu'un import peut donner à un candidat : une indication de l'admin (A d'abord), jamais calculée. */
export type CandidatePriority = 'A' | 'B' | 'C';

export const CANDIDATE_PRIORITIES: readonly CandidatePriority[] = ['A', 'B', 'C'];

/** Où en est la lecture chez Deezer : pas encore lu, lu, ou inconnu de Deezer. */
export type CandidateStatus = 'pending' | 'ready' | 'not_found';

/** Un morceau du sas « À valider » : pas dans le pool, donc jamais tiré, tant que l'admin ne l'a pas ajouté. */
export interface Candidate {
  readonly id: number;
  readonly deezerTrackId: number;
  readonly priority: CandidatePriority | null;
  readonly status: CandidateStatus;
  readonly artist: string | null;
  readonly title: string | null;
  readonly releaseYear: number | null;
  readonly rank: number | null;
  /** L'état de l'extrait chez Deezer (`unknown` tant que le candidat n'est pas lu). */
  readonly preview: 'unknown' | 'available' | 'missing';
  /** Un morceau du pool a déjà cet identifiant Deezer. */
  readonly inCatalogue: boolean;
  readonly isDismissed: boolean;
  /** L'ajout au pool est demandé et pas encore fait. */
  readonly isAdding: boolean;
}

/** Ce qu'on peut cocher, ajouter ou écouter : lu, avec un extrait, pas déjà au pool, pas déjà en cours d'ajout. */
export function isAddable(candidate: Candidate): boolean {
  return candidate.status === 'ready' && candidate.preview === 'available' && !candidate.inCatalogue && !candidate.isAdding;
}

/** Le filtre de la liste : à traiter, ou écartés. */
export type CandidateView = 'todo' | 'dismissed';

export type PriorityFilter = CandidatePriority | 'none' | null;

/** Les candidats d'une vue (les ajoutés quittent le sas : la liste n'en a plus). */
export function candidatesOf(candidates: readonly Candidate[], view: CandidateView, priority: PriorityFilter): Candidate[] {
  return candidates
    .filter(c => c.isDismissed === (view === 'dismissed'))
    .filter(c => priority === null || (priority === 'none' ? c.priority === null : c.priority === priority));
}

/** A, B, C puis sans priorité, et dans chacune le plus connu (rang Deezer) d'abord ; les morceaux pas encore lus à la fin. */
export function sortCandidates(candidates: readonly Candidate[]): Candidate[] {
  const order = (c: Candidate) => (c.priority === null ? CANDIDATE_PRIORITIES.length : CANDIDATE_PRIORITIES.indexOf(c.priority));
  return [...candidates].sort((a, b) =>
    order(a) - order(b) || (b.rank ?? -1) - (a.rank ?? -1) || a.id - b.id);
}

/** Une ligne d'un import qu'on n'a pas pu lire (numéro à partir de 1). */
export interface CandidateImportIssue {
  readonly line: number;
  readonly text: string;
}

export interface ParsedCandidateImport {
  readonly items: readonly { readonly deezerTrackId: number; readonly priority: CandidatePriority | null }[];
  readonly issues: readonly CandidateImportIssue[];
}

/** Le nombre de candidats qu'un import accepte d'un coup (le même que l'API). */
export const MAX_CANDIDATE_IMPORT = 1000;

/**
 * Lit ce que l'admin colle ou charge : un identifiant Deezer par ligne, suivi si l'on veut de sa priorité (`123 A`, `123;B`, `123,C`),
 * ou plusieurs identifiants sur une ligne (séparés par des espaces, des virgules ou des points-virgules) qui prennent alors la
 * priorité par défaut. Une adresse `https://www.deezer.com/fr/track/123` est reconnue. Les lignes vides, celles qui commencent par `#` et
 * l'en-tête d'un fichier (`id;priorité`) sont ignorées ; un identifiant en double garde sa première ligne.
 */
export function parseCandidateImport(text: string, defaultPriority: CandidatePriority | null = null): ParsedCandidateImport {
  const items: { deezerTrackId: number; priority: CandidatePriority | null }[] = [];
  const issues: CandidateImportIssue[] = [];
  const seen = new Set<number>();
  const add = (deezerTrackId: number, priority: CandidatePriority | null) => {
    if (seen.has(deezerTrackId)) return;
    seen.add(deezerTrackId);
    items.push({ deezerTrackId, priority });
  };
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const words = trimmed.replace(/https?:\/\/\S*?\/track\/(\d+)\S*/gi, '$1').split(/[\s,;\t]+/).filter(Boolean);
    const ids = words.filter(w => /^\d+$/.test(w));
    const rest = words.filter(w => !/^\d+$/.test(w));
    const priority = rest.length === 1 && /^[abc]$/i.test(rest[0]) ? (rest[0].toUpperCase() as CandidatePriority) : null;
    const isHeader = rest.length > 0 && ids.length === 0 && /^(id|identifiant|deezer)/i.test(rest[0]);
    if (isHeader) return;
    if (ids.length === 0 || (rest.length > 0 && priority === null) || (priority !== null && ids.length !== 1)) {
      issues.push({ line, text: trimmed });
      return;
    }
    for (const id of ids) add(Number(id), priority ?? defaultPriority);
  });
  return { items, issues };
}
