// CI utilise 5171 (port standard), local utilise 5172 (évite le conflit avec le dev normal)
const BASE = process.env['CI'] ? 'http://localhost:5171' : 'http://localhost:5172';
const ADMIN_HEADERS = {
  Authorization: 'Bearer admin-token',
  'Content-Type': 'application/json',
};

export class ApiTestClient {
  async reset(options: { deleteChallenge?: boolean } = {}): Promise<void> {
    const url = `${BASE}/api/e2e/reset${options.deleteChallenge ? '?deleteChallenge=true' : ''}`;
    const res = await fetch(url, { method: 'DELETE', headers: ADMIN_HEADERS });
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
}
