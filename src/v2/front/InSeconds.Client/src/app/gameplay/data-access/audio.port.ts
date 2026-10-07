import { Signal } from '@angular/core';
import { AudioStatus } from '../domain/track-round';

/**
 * Le lecteur d'extraits de la manche (§ 6.3 du plan v2). Le son est décodé en mémoire et le
 * navigateur s'arrête lui-même au palier : aucune minuterie ne coupe le son, donc rien ne peut le
 * couper trop tôt ou trop tard (pièges 44 et 46 de la v1).
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
   * Charge l'extrait et libère les autres. `nextUrl` est chargé en arrière-plan : on ne garde en
   * mémoire que le morceau en cours et le suivant (un extrait décodé pèse environ 10 Mo).
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

  /** Coupe le son et revient au repos ; garde l'extrait en mémoire. */
  abstract stop(): void;
}
