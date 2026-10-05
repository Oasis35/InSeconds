import { expect } from '@playwright/test';
import { inSequence } from './sequence';

// CI utilise 5175 (port de l'API v2), local utilise 5177 (évite le conflit avec le dev normal)
const BASE = process.env['CI'] ? 'http://localhost:5175' : 'http://localhost:5177';
// L'auth admin est désormais un rôle sur le cookie joueur (Player.IsAdmin, cf. refonte
// profils admin) — plus d'OriginValidator sur ces routes, donc plus besoin d'Origin ici.
// Bearer admin-token reste le bypass Testing-only posé dans PlayerAuthMiddleware.
const ADMIN_HEADERS = {
  Authorization: 'Bearer admin-token',
  'Content-Type': 'application/json',
};

/** Répond (réponse vide, palier 1 s) à chaque morceau de la session, dans l'ordre. */
function submitEmptyAnswers(
  session: { sessionId: string; tracks: { id: number }[] },
  headers: Record<string, string>,
): Promise<void> {
  return inSequence(session.tracks, async (track) => {
    const submitRes = await fetch(`${BASE}/api/sessions/${session.sessionId}/answers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dailyChallengeTrackId: track.id,
        listenedDurationSeconds: 1,
        wasExtended: false,
        artistAnswer: null,
        titleAnswer: null,
      }),
    });
    if (!submitRes.ok) throw new Error(`submitAnswer failed: ${submitRes.status}`);
  });
}

/** Les liens que l'API envoie par email (adresse publique + chemin du front + jeton). */
const MAGIC_LINK = /https?:\/\/[^\s"'<>]+\/account\/login\/verify\?token=[\w-]+/;
const EMAIL_CHANGE_LINK = /https?:\/\/[^\s"'<>]+\/account\/confirm-email\?token=[\w-]+/;

export class ApiTestClient {
  /** Dernier lien lu par adresse : un nouveau lien est attendu tant qu'il n'a pas changé (chaque jeton est neuf). */
  private readonly lastLinks = new Map<string, string>();

  // Vide les tables des modules et les emails capturés (hôte de test v2 : POST, sans authentification).
  async reset(options: { deleteChallenge?: boolean; emptyPool?: boolean } = {}): Promise<void> {
    const params = new URLSearchParams();
    if (options.deleteChallenge) params.set('deleteChallenge', 'true');
    if (options.emptyPool) params.set('emptyPool', 'true');
    const query = params.size > 0 ? `?${params}` : '';
    const res = await fetch(`${BASE}/api/e2e/reset${query}`, { method: 'POST' });
    if (!res.ok) throw new Error(`E2E reset failed: ${res.status}`);
    this.lastLinks.clear();
  }

  // Purge complète + re-seed : recrée tracks, défis et joueur dev dans l'ordre connu
  async reseed(): Promise<void> {
    const res = await fetch(`${BASE}/api/e2e/reseed`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
    });
    if (!res.ok) throw new Error(`E2E reseed failed: ${res.status}`);
  }

  // Le token brut n'est jamais persisté en base (seul son hash l'est) : on relit l'URL dans le
  // dernier email capturé par l'hôte de test (/api/e2e/last-email). L'email part de l'outbox, donc un
  // peu après la réponse 204 : on attend qu'un lien différent du précédent apparaisse.
  getLastMagicLinkUrl(email: string): Promise<string> {
    return this.waitForNewLink(email, MAGIC_LINK);
  }

  // Même principe que getLastMagicLinkUrl, pour le flux de changement d'email.
  getLastEmailChangeLinkUrl(email: string): Promise<string> {
    return this.waitForNewLink(email, EMAIL_CHANGE_LINK);
  }

  private async waitForNewLink(email: string, pattern: RegExp): Promise<string> {
    const key = `${pattern.source}|${email.toLowerCase()}`;
    const previous = this.lastLinks.get(key);
    let found: string | undefined;
    await expect
      .poll(async () => {
        const res = await fetch(`${BASE}/api/e2e/last-email?to=${encodeURIComponent(email)}`);
        if (!res.ok) return undefined;
        const { htmlBody } = (await res.json()) as { htmlBody: string };
        const url = pattern.exec(htmlBody)?.[0];
        found = url !== previous ? url : undefined;
        return found;
      }, { message: `Aucun nouvel email à ${email}`, timeout: 15_000 })
      .toBeTruthy();
    this.lastLinks.set(key, found!);
    return found!;
  }

  async generateToday(): Promise<void> {
    const res = await fetch(`${BASE}/api/admin/generate-today`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
    });
    if (!res.ok && res.status !== 409) throw new Error(`generate-today failed: ${res.status}`);
  }

  /**
   * Pose directement l'état de série d'un joueur (Testing-only) — pour tester les états du
   * gel de série sans simuler des jours de jeu. `lastPlayedDaysAgo` : 1 = hier.
   */
  async setStreak(playerId: string, state: { streak: number; lastPlayedDaysAgo: number | null; freezes: number }): Promise<void> {
    const res = await fetch(`${BASE}/api/e2e/set-streak`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ playerId, ...state }),
    });
    if (!res.ok) throw new Error(`set-streak failed: ${res.status}`);
  }

  /** Complète la partie du joueur identifié par son cookie (extrait depuis la page Playwright). */
  async completeSessionAs(cookieHeader: string): Promise<void> {
    const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader };

    const startRes = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers });
    if (!startRes.ok) throw new Error(`startSession failed: ${startRes.status}`);
    const session = await startRes.json();

    await submitEmptyAnswers(session, headers);
  }

  /** `GET /api/stats/today` sans cookie (visiteur qui n'a pas joué). */
  async getTodayStatsAnonymously(): Promise<{ totalPlayers: number; tracks: unknown[] }> {
    const res = await fetch(`${BASE}/api/stats/today`);
    if (!res.ok) throw new Error(`stats/today failed: ${res.status}`);
    return res.json();
  }

  /**
   * Fait jouer une partie complète (réponses vides → 0 pt) à un nouvel invité : le cookie
   * posé par `POST /api/sessions` est réutilisé pour les réponses.
   */
  async completeSessionAsNewGuest(): Promise<void> {
    const startRes = await fetch(`${BASE}/api/sessions`, { method: 'POST' });
    if (!startRes.ok) throw new Error(`startSession failed: ${startRes.status}`);
    const cookieHeader = startRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const session = await startRes.json();
    const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader };

    await submitEmptyAnswers(session, headers);
  }

  /** Abandonne la partie du joueur identifié par son cookie. */
  async abandonSessionAs(cookieHeader: string): Promise<void> {
    const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader };

    const startRes = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers });
    if (!startRes.ok) throw new Error(`startSession failed: ${startRes.status}`);
    const session = await startRes.json();

    // Soumettre une réponse d'abord (abandon nécessite une session Pending active)
    const track = session.tracks[0];
    await fetch(`${BASE}/api/sessions/${session.sessionId}/answers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dailyChallengeTrackId: track.id,
        listenedDurationSeconds: 1,
        wasExtended: false,
        artistAnswer: null,
        titleAnswer: null,
      }),
    });

    const abandonRes = await fetch(`${BASE}/api/sessions/${session.sessionId}/abandon`, {
      method: 'PUT',
      headers,
    });
    if (!abandonRes.ok) throw new Error(`abandon failed: ${abandonRes.status}`);
  }
}
