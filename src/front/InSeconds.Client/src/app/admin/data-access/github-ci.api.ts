import { Injectable, InjectionToken, inject } from '@angular/core';
import { CiRun, toCiState } from '../domain/system';

/** Le dépôt public d'InSeconds, dont l'admin lit l'intégration continue. */
export const GITHUB_REPOSITORY = 'Oasis35/InSeconds';

/** Ce que l'admin garde d'une lecture GitHub, en millisecondes : l'API publique sans jeton ne permet que 60 lectures par heure et par IP. */
export const GITHUB_CACHE_MS = 120_000;

/** La fonction `fetch` utilisée (remplacée dans les tests). */
export const GITHUB_FETCH = new InjectionToken<typeof fetch>('GITHUB_FETCH', { factory: () => globalThis.fetch.bind(globalThis) });

/** La page des passages de la CI d'une branche, chez GitHub. */
export function ciRunsPage(branch: string): string {
  const query = encodeURIComponent('branch:' + branch);
  return `https://github.com/${GITHUB_REPOSITORY}/actions/workflows/ci.yml?query=${query}`;
}

interface WorkflowRunsResponse {
  workflow_runs?: { head_sha?: string; status?: string | null; conclusion?: string | null; html_url?: string }[];
}

/**
 * Le dernier passage du workflow `ci.yml` d'une branche, lu dans l'API publique de GitHub (le dépôt est public : aucun jeton). Son
 * commit est le dernier poussé sur la branche (la CI tourne à chaque push) : c'est le commit attendu en prod ou au staging. Lu sans
 * cookie (`credentials: 'omit'`), gardé deux minutes. Un échec (réseau, limite atteinte) rend `null` : le panneau dit qu'il ne sait pas.
 */
@Injectable()
export class GithubCiApi {
  private readonly fetch = inject(GITHUB_FETCH);
  private readonly cache = new Map<string, { readonly at: number; readonly run: Promise<CiRun | null> }>();

  latestRun(branch: string): Promise<CiRun | null> {
    const cached = this.cache.get(branch);
    if (cached && Date.now() - cached.at < GITHUB_CACHE_MS) return cached.run;
    const run = this.read(branch);
    this.cache.set(branch, { at: Date.now(), run });
    // Un échec n'est pas gardé : la prochaine ouverture relit.
    void run.then(result => { if (result === null) this.cache.delete(branch); });
    return run;
  }

  private async read(branch: string): Promise<CiRun | null> {
    const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(branch)}&per_page=1`;
    try {
      const response = await this.fetch(url, { credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) return null;
      const latest = ((await response.json()) as WorkflowRunsResponse).workflow_runs?.[0];
      if (!latest?.head_sha) return null;
      return { branch, headSha: latest.head_sha, state: toCiState(latest.status, latest.conclusion), url: latest.html_url ?? ciRunsPage(branch) };
    } catch {
      return null;
    }
  }
}
