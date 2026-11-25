import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { todayUtc } from '../../core/game-day/game-day';
import { SessionStore } from '../../core/session/session.store';
import { ShellChromeStore } from '../../core/shell/shell-chrome.store';
import { StoragePort } from '../../core/storage/storage.port';
import { Group } from '../domain/group';
import { announceActive } from '../domain/groups-announce';

const CLOSED_KEY = 'inseconds.announce.groups.closed';
const RANKING_SEEN_KEY = 'inseconds.announce.groups.rankingSeen';

/**
 * L'annonce « Les groupes sont là » : d'abord une carte au-dessus du défi (`card`), puis, une fois fermée, une pastille « Nouveau » sur la carte
 * amis et un point sur l'onglet Groupes (`chip`, `dot`) pour un joueur qui n'a pas de groupe. Tout s'arrête au dernier jour de
 * `GROUPS_ANNOUNCE_UNTIL`. Ce que le joueur a fermé ou vu ne vit que dans son navigateur (`localStorage`, deux drapeaux, aucun identifiant, rien
 * n'est envoyé au serveur). Les groupes du joueur sont posés par la carte amis, qui les lit déjà.
 */
@Injectable({ providedIn: 'root' })
export class GroupsAnnounce {
  private readonly storage = inject(StoragePort);
  private readonly chrome = inject(ShellChromeStore);
  private readonly session = inject(SessionStore);

  private readonly active = announceActive(todayUtc(new Date()));
  private readonly _closed = signal(this.storage.get(CLOSED_KEY) === '1');
  private readonly _rankingSeen = signal(this.storage.get(RANKING_SEEN_KEY) === '1');
  private readonly _groups = signal<readonly Group[] | 'failed' | null>(null);
  private readonly _maxGroups = signal<number | null>(null);

  /** Les groupes du joueur : `null` tant qu'ils ne sont pas lus, `'failed'` si la lecture a échoué (la carte ne s'affiche pas). */
  readonly groups = this._groups.asReadonly();
  /** Le joueur peut encore créer un groupe (il n'a pas atteint le maximum rendu par le serveur) : sans lui, la carte n'offre pas « Créer un groupe ». */
  readonly canCreate = computed(() => {
    const groups = this._groups();
    const max = this._maxGroups();
    return Array.isArray(groups) && (max === null || groups.length < max);
  });
  /** La carte d'annonce est à montrer (pas encore fermée). */
  readonly card = computed(() => this.active && !this._closed());
  private readonly member = computed(() => { const groups = this._groups(); return Array.isArray(groups) ? groups.length > 0 : null; });
  /** La pastille « Nouveau » de la carte amis : compte, carte fermée, pas de groupe. */
  readonly chip = computed(() => this.active && this.session.isLinked() && this._closed() && this.member() === false);
  /** Le point de l'onglet Groupes : comme la pastille, jusqu'à ce que le joueur ait ouvert l'onglet Groupes. */
  readonly dot = computed(() => this.chip() && !this._rankingSeen());

  constructor() {
    effect(() => this.chrome.setGroupsNew(this.dot()));
    // Les groupes sont ceux du compte connecté : un autre compte (ou la déconnexion) les efface, la carte amis les relit.
    let wasLinked: boolean | null = null;
    effect(() => {
      const linked = this.session.isLinked();
      if (wasLinked !== null && wasLinked !== linked) untracked(() => { this._groups.set(null); this._maxGroups.set(null); });
      wasLinked = linked;
    });
  }

  setGroups(groups: readonly Group[] | 'failed', maxGroups: number | null = null): void {
    this._groups.set(groups);
    this._maxGroups.set(maxGroups);
  }

  close(): void {
    this.storage.set(CLOSED_KEY, '1');
    this._closed.set(true);
  }

  markRankingSeen(): void {
    this.storage.set(RANKING_SEEN_KEY, '1');
    this._rankingSeen.set(true);
  }
}
