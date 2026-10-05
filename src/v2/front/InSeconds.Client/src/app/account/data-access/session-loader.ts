import { Injectable, inject } from '@angular/core';
import { SessionStore } from '../../core/session/session.store';
import { PlayersApi } from './players.api';

/**
 * Charge l'identité du joueur dans `SessionStore` (`GET /api/players/me`, 204 sans identité). Une
 * seule requête au démarrage, partagée par tous ceux qui attendent l'identité (gardes, pages) ;
 * `reload()` la relit après une connexion, un changement de pseudo ou d'email. En cas d'échec
 * (réseau, serveur), la session reste telle quelle : l'intercepteur a déjà remonté l'erreur et
 * l'overlay « Service indisponible » prend le relais si l'API est tombée.
 */
@Injectable({ providedIn: 'root' })
export class SessionLoader {
  private readonly api = inject(PlayersApi);
  private readonly session = inject(SessionStore);

  private loading: Promise<void> | null = null;

  /** Attend la première lecture de l'identité (la lance si besoin). */
  ensureLoaded(): Promise<void> {
    if (this.loading === null) this.loading = this.read();
    return this.loading;
  }

  /** Relit l'identité auprès de l'API. */
  reload(): Promise<void> {
    this.loading = this.read();
    return this.loading;
  }

  /**
   * Crée l'invité si ce navigateur n'a encore aucune identité (`POST /api/players/guest`, jamais
   * un `GET`), puis relit l'identité. Sert à l'identifiant navigateur de l'admin, qui doit exister
   * même si la personne ne joue jamais.
   */
  async ensureGuest(): Promise<void> {
    await this.ensureLoaded();
    if (this.session.isKnown()) return;
    try {
      await this.api.createGuest();
    } catch {
      return;
    }
    await this.reload();
  }

  private async read(): Promise<void> {
    try {
      const player = await this.api.getMe();
      if (player) this.session.signedIn(player);
      else this.session.signedOut();
    } catch {
      // Identité inconnue : on garde l'état courant.
    } finally {
      this.session.markLoaded();
    }
  }
}
