import { TestBed } from '@angular/core/testing';
import { ScoreCountComponent } from './score-count.component';

type Flagged = { __disableAnimations?: boolean };

describe('ScoreCountComponent', () => {
  function render(inputs: { value: number; from?: number; delay?: number }) {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ScoreCountComponent);
    fixture.componentRef.setInput('value', inputs.value);
    if (inputs.from !== undefined) fixture.componentRef.setInput('from', inputs.from);
    if (inputs.delay !== undefined) fixture.componentRef.setInput('delay', inputs.delay);
    fixture.detectChanges();
    const shown = () => (fixture.nativeElement as HTMLElement).textContent!.trim();
    return { fixture, shown };
  }

  describe('mouvement réduit (ou animations coupées par les E2E)', () => {
    beforeEach(() => { (globalThis as Flagged).__disableAnimations = true; });
    afterEach(() => { delete (globalThis as Flagged).__disableAnimations; });

    it('affiche tout de suite la valeur, sans compter', () => {
      expect(render({ value: 850 }).shown()).toBe('850');
    });

    it('même avec un délai : le mouvement réduit n\'attend pas', () => {
      expect(render({ value: 850, delay: 5_000 }).shown()).toBe('850');
    });

    it('une nouvelle valeur remplace l\'ancienne tout de suite', () => {
      const { fixture, shown } = render({ value: 850 });

      fixture.componentRef.setInput('value', 1200);
      fixture.detectChanges();

      expect(shown()).toBe('1200');
    });

  });

  describe('avec animation', () => {
    afterEach(() => vi.useRealTimers());

    it('monte jusqu\'à la valeur, sans jamais la dépasser en route', async () => {
      const { fixture, shown } = render({ value: 300 });
      const seen: number[] = [];
      const watch = setInterval(() => seen.push(Number(shown())), 20);

      try {
        await vi.waitFor(() => expect(shown()).toBe('300'), { timeout: 3000 });
      } finally {
        clearInterval(watch);
      }

      expect(seen.every(value => value >= 0 && value <= 300)).toBe(true);
      expect(fixture.componentInstance.value()).toBe(300);
    });

    it('avant le départ différé, le compteur reste à son point de départ ; il ne part qu\'une fois le délai passé', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { shown } = render({ value: 500, from: 100, delay: 800 });
      expect(shown()).toBe('100');

      vi.advanceTimersByTime(799);
      expect(shown()).toBe('100');

      vi.advanceTimersByTime(1);
      vi.useRealTimers();
      await vi.waitFor(() => expect(shown()).toBe('500'), { timeout: 3000 });
    });

    it('détruit avant son délai, il ne démarre rien (aucun minuteur ne reste)', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { fixture } = render({ value: 500, delay: 800 });

      fixture.destroy();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
