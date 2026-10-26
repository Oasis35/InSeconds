import { expect } from '@playwright/test';
import { inSequence } from './sequence';

// CI utilise 5175 (port de l'API v2), local utilise 5177 (évite le conflit avec le dev normal)
const BASE = process.env['CI'] ? 'http://localhost:5175' : 'http://localhost:5177';
// L'auth admin est désormais un rôle sur le cookie joueur (Player.IsAdmin, cf. refonte
// profils admin) - plus d'OriginValidator sur ces routes, donc plus besoin d'Origin ici.
// Bearer admin-token reste le bypass Testing-only posé dans PlayerAuthMiddleware.
const ADMIN_HEADERS = {
  Authorization: 'Bearer admin-token',
  'Content-Type': 'application/json',
};

/** Une partie démarrée : son identifiant, et les positions des morceaux qu'il reste à répondre. */
interface StartedGame {
  sessionId: number;
  remaining: number[];
}

/** Répond (réponse vide, palier 1 s) à chaque morceau restant de la partie, dans l'ordre. */
function submitEmptyAnswers(game: StartedGame, headers: Record<string, string>): Promise<void> {
  return inSequence(game.remaining, async (position) => {
    const submitRes = await fetch(`${BASE}/api/daily/sessions/${game.sessionId}/answers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ position, listenedSeconds: 1, wasExtended: false, artist: null, title: null }),
    });
    if (!submitRes.ok) throw new Error(`submitAnswer failed: ${submitRes.status}`);
  });
}

/** Démarre (ou reprend) la partie du joueur identifié par ce cookie. */
async function startGame(headers: Record<string, string>): Promise<StartedGame> {
  const res = await fetch(`${BASE}/api/daily/sessions`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`startSession failed: ${res.status}`);
  const session = (await res.json()) as { sessionId: number; tracks: unknown[]; nextPosition: number };
  const remaining = Array.from({ length: session.tracks.length - session.nextPosition + 1 }, (_, i) => session.nextPosition + i);
  return { sessionId: session.sessionId, remaining };
}

/** Crée un invité (cookie posé par `POST /api/players/guest`) : l'en-tête `Cookie` à rejouer. */
async function createGuestCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/players/guest`, { method: 'POST' });
  if (!res.ok) throw new Error(`createGuest failed: ${res.status}`);
  return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}

/** Les liens que l'API envoie par email (adresse publique + chemin du front + jeton). */
const MAGIC_LINK = /https?:\/\/[^\s"'<>]+\/account\/login\/verify\?token=[\w-]+/;
const EMAIL_CHANGE_LINK = /https?:\/\/[^\s"'<>]+\/account\/confirm-email\?token=[\w-]+/;

/** Un morceau de la dernière playlist de Run tirée (hôte de test) : de quoi y répondre juste, ou le priver d'extrait. */
export interface RunTrack {
  position: number;
  round: number;
  deezerTrackId: number;
  artist: string;
  title: string;
}

export class ApiTestClient {
  /** Dernier lien lu par adresse : un nouveau lien est attendu tant qu'il n'a pas changé (chaque jeton est neuf). */
  private readonly lastLinks = new Map<string, string>();

  // Remise à zéro entre deux tests. Comme en v1, les parties et les joueurs partent mais le pool et le défi du jour restent (re-semés) :
  // `emptyPool` vide tout (aucun défi possible), `deleteChallenge` ne retire que le défi du jour (le pool, lui, reste).
  async reset(options: { deleteChallenge?: boolean; emptyPool?: boolean } = {}): Promise<void> {
    const emptyOnly = options.emptyPool === true;
    const res = await fetch(`${BASE}/api/e2e/${emptyOnly ? 'reset' : 'reseed'}`, { method: 'POST', headers: ADMIN_HEADERS });
    if (!res.ok) throw new Error(`E2E reset failed: ${res.status}`);
    if (options.deleteChallenge && !emptyOnly) {
      const deleted = await fetch(`${BASE}/api/e2e/delete-challenge`, { method: 'POST' });
      if (!deleted.ok) throw new Error(`E2E delete-challenge failed: ${deleted.status}`);
    }
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

  /** Génère le défi du jour tout de suite (sans Hangfire). */
  async generateToday(): Promise<void> {
    const res = await fetch(`${BASE}/api/e2e/generate-today`, { method: 'POST' });
    if (!res.ok && res.status !== 422) throw new Error(`generate-today failed: ${res.status}`);
  }

  /**
   * Pose directement l'état de série d'un joueur (hôte de test) : les états du gel de série se testent sans simuler des jours de jeu.
   * `lastPlayedDaysAgo` : 1 = hier.
   */
  async setStreak(playerId: string, state: { streak: number; lastPlayedDaysAgo: number | null; freezes: number }): Promise<void> {
    const res = await fetch(`${BASE}/api/e2e/set-streak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, ...state }),
    });
    if (!res.ok) throw new Error(`set-streak failed: ${res.status}`);
  }

  /** Complète la partie du joueur identifié par son cookie (extrait depuis la page Playwright). */
  async completeSessionAs(cookieHeader: string): Promise<void> {
    const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader };
    await submitEmptyAnswers(await startGame(headers), headers);
  }

  /** `GET /api/daily/stats/today` sans cookie (visiteur qui n'a pas joué). */
  async getTodayStatsAnonymously(): Promise<{ totalPlayers: number; tracks: unknown[] }> {
    const res = await fetch(`${BASE}/api/daily/stats/today`);
    if (!res.ok) throw new Error(`stats/today failed: ${res.status}`);
    return res.json();
  }

  /** Fait jouer une partie complète (réponses vides → 0 pt) à un nouvel invité. */
  async completeSessionAsNewGuest(): Promise<void> {
    const headers = { 'Content-Type': 'application/json', Cookie: await createGuestCookie() };
    await submitEmptyAnswers(await startGame(headers), headers);
  }

  /** Abandonne la partie du joueur identifié par son cookie. */
  async abandonSessionAs(cookieHeader: string): Promise<void> {
    const headers = { 'Content-Type': 'application/json', Cookie: cookieHeader };
    const game = await startGame(headers);

    // Une réponse d'abord : la partie est bien en cours, avec de quoi la reprendre.
    await submitEmptyAnswers({ sessionId: game.sessionId, remaining: game.remaining.slice(0, 1) }, headers);

    const abandonRes = await fetch(`${BASE}/api/daily/sessions/${game.sessionId}/abandon`, { method: 'POST', headers });
    if (!abandonRes.ok) throw new Error(`abandon failed: ${abandonRes.status}`);
  }

  /** Les 20 morceaux de la dernière playlist de Run tirée, dans l'ordre (le tirage est aléatoire, rien ne les montre avant la réponse). */
  async latestRunTracks(): Promise<RunTrack[]> {
    const res = await fetch(`${BASE}/api/e2e/runs/latest-tracks`);
    if (!res.ok) throw new Error(`runs/latest-tracks failed: ${res.status}`);
    return ((await res.json()) as { tracks: RunTrack[] }).tracks;
  }

  /** Le faux Deezer ne donne plus d'extrait pour ces morceaux : un Run les retire de la manche quand il y arrive. */
  async removePreviews(deezerTrackIds: number[]): Promise<void> {
    const res = await fetch(`${BASE}/api/e2e/deezer/without-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deezerTrackIds }),
    });
    if (!res.ok) throw new Error(`deezer/without-preview failed: ${res.status}`);
  }

  /** L'admin ouvre le mode Run à ce joueur (interrupteur de l'onglet Joueurs). */
  async grantRunAccess(playerId: string): Promise<void> {
    // Le compte admin des tests, connecté hors du navigateur : son cookie ne touche pas celui de la page.
    const login = await fetch(`${BASE}/api/e2e/login-as-admin`, { method: 'POST' });
    if (!login.ok) throw new Error(`login-as-admin failed: ${login.status}`);
    const Cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const res = await fetch(`${BASE}/api/admin/runs/access/${playerId}`, { method: 'PUT', headers: { Cookie } });
    if (!res.ok) throw new Error(`grantRunAccess failed: ${res.status}`);
  }
}
