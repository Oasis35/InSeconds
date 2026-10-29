import { Signal } from '@angular/core';
import { AudioStatus } from '../domain/track-round';

/**
 * Le lecteur d'extraits de la manche. L'arrêt au palier se cale sur le son
 * réellement joué, jamais sur l'heure de l'appel (pièges 44 et 46) : implémenté par `HtmlAudioPort`.
 *
 * États : `idle` (rien de chargé) → `loading` → `ready` (chargé, pas encore joué) → `playing` →
 * `finished` (le palier demandé est joué). Un échec de chargement ou de lecture est `error`, jamais
 * `idle` : un retour au repos relancerait une écoute automatique en boucle (piège 33).
 */
export abstract class AudioPort {
  abstract readonly state: Signal<AudioStatus>;
  /** Position de lecture en secondes ; au repos, l'endroit où le dernier palier s'est arrêté. */
  abstract readonly position: Signal<number>;

  /**
   * Charge l'extrait. `nextUrl` est annoncé au navigateur, qui peut le précharger pendant qu'on joue
   * le morceau en cours.
   */
  abstract load(url: string, nextUrl?: string | null): void;

  /**
   * Joue jusqu'à `seconds`, depuis l'endroit où l'on en est : le début après `load`, la position
   * atteinte pendant une lecture ou à la fin d'un palier. Pendant le chargement, la demande est
   * gardée et jouée dès que le son est prêt (piège 40).
   */
  abstract playUntil(seconds: number): void;

  /** Rejoue depuis le début jusqu'à `seconds`. */
  abstract replay(seconds: number): void;

  /** Joue tout l'extrait, depuis le début (après la révélation). */
  abstract playFull(): void;

  /** Coupe le son et revient au repos. */
  abstract stop(): void;

  /**
   * Déverrouille le son du navigateur. À appeler **dans le gestionnaire du clic** du joueur, avant
   * toute attente (réseau…) : sur iPhone, un son lancé plus tard, hors du geste, serait refusé.
   * Sans effet si le son est déjà déverrouillé.
   */
  abstract unlock(): void;
}
