import { TestBed } from '@angular/core/testing';
import { HeaderSlot } from './header-slot';

describe('HeaderSlot', () => {
  it("l'en-tête global est affiché tant qu'aucune page n'a le sien", () => {
    expect(TestBed.inject(HeaderSlot).takenOver()).toBe(false);
  });

  it('une page prend la place en arrivant et la rend en partant', () => {
    const slot = TestBed.inject(HeaderSlot);
    const page = {};

    slot.takeOver(page);
    expect(slot.takenOver()).toBe(true);

    slot.release(page);
    expect(slot.takenOver()).toBe(false);
  });

  it("une page qui part ne rend pas la place qu'une autre page a prise entre-temps", () => {
    const slot = TestBed.inject(HeaderSlot);
    const leaving = {};
    const arriving = {};

    slot.takeOver(leaving);
    slot.takeOver(arriving);
    slot.release(leaving);

    expect(slot.takenOver()).toBe(true);
  });
});
