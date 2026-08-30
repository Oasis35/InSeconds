// CI utilise 5171 (port standard), local utilise 5172 (évite le conflit avec le dev normal)
const BASE = process.env['CI'] ? 'http://localhost:5171' : 'http://localhost:5172';
// LoginEndpoint.IsAdminAuthenticated vérifie aussi l'origine (cf. OriginValidator) — un
// fetch() Node (pas un vrai navigateur) n'envoie jamais d'Origin automatiquement, il faut
// le poser explicitement ici avec le port réel du front (cf. playwright.config.ts baseURL).
const FRONT_ORIGIN = process.env['CI'] ? 'http://localhost:5173' : 'http://localhost:5174';
const ADMIN_HEADERS = {
  Authorization: 'Bearer admin-token',
  'Content-Type': 'application/json',
  Origin: FRONT_ORIGIN,
};

export class ApiTestClient {
  async reset(options: { deleteChallenge?: boolean; emptyPool?: boolean } = {}): Promise<void> {
    const params = new URLSearchParams();
    if (options.deleteChallenge) params.set('deleteChallenge', 'true');
    if (options.emptyPool) params.set('emptyPool', 'true');
    const query = params.size > 0 ? `?${params}` : '';
    const res = await fetch(`${BASE}/api/e2e/reset${query}`, { method: 'DELETE', headers: ADMIN_HEADERS });
    if (!res.ok) throw new Error(`E2E reset failed: ${res.status}`);
  }

  // Purge complète + re-seed : recrée tracks, défis et joueur dev dans l'ordre connu
  async reseed(): Promise<void> {
    const res = await fetch(`${BASE}/api/e2e/reseed`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
    });
    if (!res.ok) throw new Error(`E2E reseed failed: ${res.status}`);
  }

  // Le token brut n'est jamais persisté en base (seul son hash l'est) — cet endpoint
  // E2E-only relit l'URL depuis le dernier email capturé (NullEmailSender en Testing).
  async getLastMagicLinkUrl(email: string): Promise<string> {
    const res = await fetch(`${BASE}/api/e2e/last-magic-link?email=${encodeURIComponent(email)}`, {
      headers: ADMIN_HEADERS,
    });
    if (!res.ok) throw new Error(`getLastMagicLinkUrl failed: ${res.status}`);
    const body = (await res.json()) as { url: string };
    return body.url;
  }

  async generateToday(): Promise<void> {
    const res = await fetch(`${BASE}/api/admin/generate-today`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
    });
    if (!res.ok && res.status !== 409) throw new Error(`generate-today failed: ${res.status}`);
  }

  /** Complète la partie du joueur identifié par son cookie (extrait depuis la page Playwright). */
  async completeSessionAs(cookieHeader: string): Promise<void> {
    const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader };

    const startRes = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers });
    if (!startRes.ok) throw new Error(`startSession failed: ${startRes.status}`);
    const session = await startRes.json();

    for (const track of session.tracks) {
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
    }
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
