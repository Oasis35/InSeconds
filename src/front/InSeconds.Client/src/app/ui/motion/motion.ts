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

/** Une jauge qui se remplit de gauche à droite (transform seulement), puis se pose à sa largeur. `delay` en secondes. */
export function fillBar(element: HTMLElement, delay = 0): void {
  if (motionReduced()) return;
  gsap.from(element, { scaleX: 0, transformOrigin: 'left center', duration: 0.6, delay, ease: SETTLE, clearProps: 'transform' });
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

/** Une carte de l'accueil qui monte à sa place, l'une après l'autre (`delay` en secondes). Rien en mouvement réduit. */
export function enterHomeCard(element: HTMLElement, delay = 0): void {
  if (motionReduced()) return;
  gsap.from(element, { y: 16, opacity: 0, duration: 0.42, delay, ease: SETTLE, clearProps: MOVED });
}

/** Les disques de l'échelle de niveau qui s'allument l'un après l'autre (`data-motion="ladder-disc"`), avec un léger rebond. */
export function lightLadder(root: HTMLElement, delay = 0): void {
  if (motionReduced()) return;
  const discs = Array.from(root.querySelectorAll<HTMLElement>('[data-motion="ladder-disc"]'));
  gsap.from(discs, { scale: 0.2, opacity: 0, duration: 0.35, delay, stagger: 0.07, ease: 'back.out(2)', clearProps: 'transform,opacity' });
}

/** Un bandeau qui glisse depuis le côté avec un léger rebond (le défi d'un ami sur la carte Setlist). Rien en mouvement réduit. */
export function slideBanner(element: HTMLElement, delay = 0): void {
  if (motionReduced()) return;
  gsap.from(element, { x: -24, opacity: 0, duration: 0.5, delay, ease: 'back.out(1.6)', clearProps: MOVED });
}

/** Des barres qui se remplissent l'une après l'autre, de gauche à droite (le score qu'on va partager). `delay` en secondes. */
export function fillBarsInTurn(elements: readonly HTMLElement[], delay = 0): void {
  if (motionReduced() || elements.length === 0) return;
  gsap.from(elements, { scaleX: 0, transformOrigin: 'left center', duration: 0.3, delay, stagger: 0.12, ease: SETTLE, clearProps: 'transform' });
}

/** Une carte qui monte à sa place (un coup de pouce joué entre dans la carte du morceau). */
export function riseCard(element: HTMLElement): void {
  if (motionReduced()) return;
  gsap.fromTo(element, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: SETTLE, clearProps: 'transform,opacity' });
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

/**
 * La séquence de fin d'un run, 2,2 s au plus : le disque se pose, le score compte (`data-value` : sa valeur, écrite par `format`), le badge de
 * record se pose, les carrés se remplissent un à un, les cases des manches puis le reste arrivent. Les éléments sont marqués
 * `data-motion="finish-disc"`, `"finish-score"`, `"finish-record"`, `"finish-square"`, `"finish-round"`, `"finish-bar"` (la jauge du niveau), `"finish-groups"`, `"finish-late"` et `"finish-band"` (la bande du défi du jour). Les boutons ne
 * s'animent pas : ils restent actifs dès le début. Rend la fonction qui saute la séquence (un toucher), ou ne fait rien en mouvement réduit.
 */
export function finishSequence(root: HTMLElement, format: (value: number) => string): () => void {
  if (motionReduced()) return () => undefined;
  const part = (name: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-motion="${name}"]`));
  const [score] = part('finish-score');
  const target = Number(score?.dataset['value'] ?? 0);
  const count = { n: 0 };
  const timeline = gsap.timeline({ defaults: { ease: SETTLE } });
  timeline.from(part('finish-disc'), { opacity: 0, rotation: -90, duration: 0.5, clearProps: MOVED + ',rotation' }, 0);
  if (score) {
    score.textContent = format(0);
    timeline.to(count, {
      n: target, duration: 0.9, ease: 'power1.out',
      onUpdate: () => { score.textContent = format(Math.round(count.n)); },
      onComplete: () => { score.textContent = format(target); },
    }, 0.15);
  }
  timeline
    .from(part('finish-record'), { opacity: 0, scale: 0.6, duration: 0.3, clearProps: 'opacity,transform' }, 1)
    .from(part('finish-square'), { opacity: 0, duration: 0.2, stagger: 0.04, clearProps: 'opacity' }, 0.5)
    .from(part('finish-round'), { opacity: 0, y: 6, duration: 0.35, stagger: 0.1, clearProps: MOVED }, 1.2)
    .from(part('finish-bar'), { scaleX: 0, transformOrigin: 'left center', duration: 0.7, clearProps: 'transform,transformOrigin' }, 0.6)
    .from(part('finish-groups'), { opacity: 0, y: 12, duration: 0.35, clearProps: MOVED }, 1.2)
    .from(part('finish-late'), { opacity: 0, duration: 0.4, clearProps: 'opacity' }, 1.6)
    .from(part('finish-band'), { opacity: 0, y: 16, duration: 0.4, clearProps: MOVED }, 1.8);
  return () => {
    timeline.progress(1);
    if (score) score.textContent = format(target);
  };
}
