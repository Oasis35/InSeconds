/**
 * Avance au plus de cette durée au-delà de la dernière position reçue : la lecture peut se bloquer (réseau, `waiting`) sans que le
 * navigateur le dise tout de suite, la position affichée ne doit pas partir loin devant le son.
 */
export const PLAYHEAD_MAX_LEAD_SECONDS = 0.3;

/** Un recul plus grand que celui-ci est un nouveau départ (relecture depuis 0), pas un à-coup de `currentTime`. */
const RESTART_SECONDS = 0.05;

/**
 * La position affichée par la waveform, lissée entre deux mises à jour de la position de lecture. Sur mobile, `currentTime` avance par
 * à-coups (plusieurs images de suite avec la même valeur) : sans lissage, même un balayage continu avancerait par saccades.
 *
 * Entre deux valeurs reçues, la position avance au rythme de l'horloge (lecture à vitesse 1), sans dépasser la dernière valeur reçue de
 * plus de `PLAYHEAD_MAX_LEAD_SECONDS`, ni la limite (le palier) ; elle ne recule jamais, sauf sur un nouveau départ. Tant que la position
 * n'a pas bougé depuis le départ, rien n'est anticipé : sur iPhone, `playing` part avant le son (piège 46), le balayage attend le vrai
 * premier son.
 *
 * Purement visuel : l'arrêt du palier reste calé sur `currentTime` par le lecteur (pièges 44 et 46).
 */
export class SmoothPlayhead {
  private anchor = 0;
  private anchorAt = 0;
  private shown = 0;
  private moving = false;
  private started = false;

  /** Repart de `position` (début ou fin d'une lecture). */
  reset(position: number, now: number): void {
    this.anchor = position;
    this.anchorAt = now;
    this.shown = position;
    this.moving = false;
    this.started = true;
  }

  /** La position à afficher à l'instant `now` (millisecondes), pour une position de lecture `position` et un palier `limit` (secondes). */
  next(position: number, limit: number, now: number): number {
    if (!this.started || position < this.anchor - RESTART_SECONDS) {
      this.reset(position, now);
    } else if (position !== this.anchor) {
      this.moving ||= position > this.anchor;
      this.anchor = position;
      this.anchorAt = now;
    }
    const predicted = this.moving ? this.anchor + Math.max(0, now - this.anchorAt) / 1000 : this.anchor;
    const capped = Math.min(predicted, this.anchor + PLAYHEAD_MAX_LEAD_SECONDS, limit);
    this.shown = Math.min(Math.max(this.shown, capped), Math.max(limit, this.anchor));
    return this.shown;
  }
}
