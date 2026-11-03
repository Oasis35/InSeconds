import { gsap } from 'gsap';
import { motionReduced } from './reduced-motion';

/**
 * Les animations du site, sur GSAP : de petits gestes physiques (une ligne qui se pose, un chiffre qui compte, des points qui rejoignent le
 * total), jamais de rebond ni de lueur. Seuls `transform` et `opacity` bougent (plus la hauteur d'une ligne qui entre dans une liste), et rien ne
 * s'anime entre un clic et le son qu'il lance. En mouvement réduit (et dans les tests de bout en bout), tout est posé sans animation.
 */

/** La courbe des entrées : rapide au départ, posée à l'arrivée. */
const SETTLE = 'power3.out';
/**
 * Ce qu'une entrée anime, rendu au gabarit à la fin : jamais tous les styles en ligne, ce qui effacerait aussi ceux posés par le gabarit
 * (couleur, police, bordure).
 */
const OPENED = 'height,paddingTop,paddingBottom,marginTop,marginBottom,opacity';
const MOVED = 'opacity,transform';

/** Une ligne qui entre dans une liste : elle s'ouvre (hauteur) et apparaît, sans pousser le reste d'un coup. */
export function enterRow(element: HTMLElement): void {
  if (motionReduced()) return;
  gsap.from(element, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, opacity: 0, duration: 0.45, ease: SETTLE, clearProps: OPENED });
}

/**
 * La ligne d'une manche passée qui se pose : ses deux filets se tracent de gauche à droite, le disque apparaît, puis le nom et le score. Les
 * éléments sont marqués `data-motion="rule"`, `"disc"`, `"name"` et `"meta"`. `delay` en secondes (le morceau qui finit la manche entre d'abord).
 */
export function settleLine(element: HTMLElement, delay = 0): void {
  if (motionReduced()) return;
  const part = (name: string) => element.querySelectorAll<HTMLElement>(`[data-motion="${name}"]`);
  gsap.timeline({ delay, defaults: { ease: SETTLE } })
    .from(element, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, opacity: 0, duration: 0.42, clearProps: OPENED })
    .from(part('rule'), { scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.12, clearProps: 'transform' }, '-=0.1')
    .from(part('disc'), { opacity: 0, rotation: -90, duration: 0.5, clearProps: MOVED }, '<0.1')
    .from(part('name'), { opacity: 0, x: -8, duration: 0.35, clearProps: MOVED }, '<0.2')
    .from(part('meta'), { opacity: 0, duration: 0.35, clearProps: 'opacity' }, '<0.15');
}

/** Un nombre qui compte jusqu'à sa nouvelle valeur, puis marque un léger temps fort. `delay` en secondes. */
export function tweenNumber(element: HTMLElement, from: number, to: number, delay = 0): void {
  gsap.killTweensOf(element);
  if (motionReduced() || from === to) {
    element.textContent = String(to);
    return;
  }
  const value = { n: from };
  element.textContent = String(from);
  gsap.timeline({ delay })
    .to(value, { n: to, duration: 0.45, ease: 'power1.out', onUpdate: () => { element.textContent = String(Math.round(value.n)); } })
    .fromTo(element, { scale: 1.06 }, { scale: 1, duration: 0.45, ease: SETTLE, clearProps: 'transform' });
}

/** Des points gagnés qui montent, se posent un instant, puis rejoignent `target` (le total) en rétrécissant. */
export function flyTo(element: HTMLElement, target: HTMLElement | null): void {
  if (motionReduced()) return;
  const timeline = gsap.timeline().fromTo(element, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: SETTLE });
  if (!target) {
    timeline.to(element, { opacity: 0, duration: 0.3, delay: 0.5 });
    return;
  }
  const from = element.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  timeline.to(element, {
    x: to.right - from.right, y: to.top - from.top, scale: 0.6, opacity: 0, duration: 0.6, delay: 0.35, ease: 'power2.in',
  });
}

/** Une carte qui arrive : elle descend un peu et apparaît. */
export function enterCard(element: HTMLElement): void {
  if (motionReduced()) return;
  gsap.fromTo(element, { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: SETTLE, clearProps: 'transform,opacity' });
}

/** Un chiffre qui change avec un petit temps fort (le décompte des dernières secondes). */
export function pop(element: HTMLElement): void {
  if (motionReduced()) return;
  gsap.fromTo(element, { scale: 1.15 }, { scale: 1, duration: 0.35, ease: SETTLE, clearProps: 'transform' });
}

/** Les verdicts qui arrivent l'un après l'autre. */
export function revealInTurn(elements: readonly HTMLElement[], delay = 0.25): void {
  if (motionReduced() || elements.length === 0) return;
  gsap.from(elements, { opacity: 0, y: 4, duration: 0.25, stagger: 0.28, delay, ease: SETTLE, clearProps: MOVED });
}
