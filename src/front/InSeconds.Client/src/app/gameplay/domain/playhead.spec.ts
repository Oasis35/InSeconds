import { PLAYHEAD_MAX_LEAD_SECONDS, SmoothPlayhead } from './playhead';

describe('SmoothPlayhead', () => {
  it('avance au rythme de l\'horloge entre deux positions reçues', () => {
    const playhead = new SmoothPlayhead();
    playhead.next(0, 2, 0);
    expect(playhead.next(0.1, 2, 100)).toBeCloseTo(0.1);
    // currentTime ne bouge pas pendant deux images : la position affichée continue.
    expect(playhead.next(0.1, 2, 116)).toBeCloseTo(0.116);
    expect(playhead.next(0.1, 2, 133)).toBeCloseTo(0.133);
    // La valeur suivante arrive : on repart d'elle.
    expect(playhead.next(0.2, 2, 200)).toBeCloseTo(0.2);
  });

  it('n\'anticipe rien tant que le son n\'a pas démarré (faux `playing` de Safari, piège 46)', () => {
    const playhead = new SmoothPlayhead();
    playhead.next(0, 2, 0);
    expect(playhead.next(0, 2, 400)).toBe(0);
    expect(playhead.next(0, 2, 900)).toBe(0);
  });

  it('ne part pas loin devant une lecture bloquée', () => {
    const playhead = new SmoothPlayhead();
    playhead.next(0, 5, 0);
    playhead.next(0.5, 5, 500);
    expect(playhead.next(0.5, 5, 3000)).toBeCloseTo(0.5 + PLAYHEAD_MAX_LEAD_SECONDS);
  });

  it('ne dépasse jamais le palier', () => {
    const playhead = new SmoothPlayhead();
    playhead.next(0, 1, 0);
    playhead.next(0.9, 1, 900);
    expect(playhead.next(0.9, 1, 1100)).toBe(1);
  });

  it('ne recule pas sur un à-coup, mais repart de 0 sur une relecture', () => {
    const playhead = new SmoothPlayhead();
    playhead.next(0, 2, 0);
    playhead.next(0.5, 2, 500);
    const ahead = playhead.next(0.5, 2, 700);
    // La valeur reçue suivante est un peu derrière ce qui était anticipé : rien ne recule.
    expect(playhead.next(0.68, 2, 710)).toBeCloseTo(ahead);
    expect(playhead.next(0, 2, 800)).toBe(0);
  });

  it('reset repart de la position donnée', () => {
    const playhead = new SmoothPlayhead();
    playhead.next(0, 2, 0);
    playhead.next(1, 2, 1000);
    playhead.reset(0.5, 1200);
    expect(playhead.next(0.5, 2, 1300)).toBe(0.5);
  });
});
