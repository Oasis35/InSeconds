// CI utilise 5171 (port standard), local utilise 5172 (évite le conflit avec le dev normal)
const BASE = process.env['CI'] ? 'http://localhost:5171' : 'http://localhost:5172';
const ADMIN_HEADERS = {
  Authorization: 'Bearer admin-token',
  'Content-Type': 'application/json',
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
