import { gsap } from 'gsap';
import { enterCard, enterHomeCard, enterRow, lightLadder, finishSequence, tweenNumber } from './motion';

const flag = globalThis.window as { __disableAnimations?: boolean };

describe('motion', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    element.style.color = 'red';
    document.body.append(element);
  });

  afterEach(() => {
    gsap.killTweensOf(element);
    element.remove();
    delete flag.__disableAnimations;
  });

  it('en mouvement réduit, rien ne bouge : le nombre est posé tout de suite', () => {
    flag.__disableAnimations = true;

    tweenNumber(element, 0, 120);
    enterCard(element);
    enterRow(element);

    expect(element.textContent).toBe('120');
    expect(element.style.opacity).toBe('');
    expect(element.style.transform).toBe('');
  });

  it('un nombre qui ne change pas est posé sans animation', () => {
    tweenNumber(element, 50, 50);

    expect(element.textContent).toBe('50');
  });

  it('un nombre finit sur sa valeur, et les styles posés à côté restent', () => {
    tweenNumber(element, 0, 300);
    gsap.globalTimeline.getChildren(true, true, false).forEach(tween => tween.progress(1));

    expect(element.textContent).toBe('300');
    expect(element.style.color).toBe('red');
  });

  it("une carte qui arrive ne garde ni décalage ni transparence à la fin, et garde ses autres styles", () => {
    enterCard(element);
    gsap.getTweensOf(element).forEach(tween => tween.progress(1));

    expect(element.style.transform).toBe('');
    expect(element.style.opacity).toBe('');
    expect(element.style.color).toBe('red');
  });
  describe('finishSequence', () => {
    const format = (value: number) => `${value} pts`;

    function screen(): HTMLElement {
      const root = document.createElement('div');
      root.innerHTML = '<p data-motion="finish-score" data-value="1284">1284 pts</p><i data-motion="finish-square"></i><i data-motion="finish-square"></i>';
      document.body.append(root);
      return root;
    }

    it('en mouvement réduit, rien ne bouge et le score reste posé', () => {
      flag.__disableAnimations = true;
      const root = screen();

      const skip = finishSequence(root, format);
      skip();

      expect(root.querySelector('[data-motion="finish-score"]')?.textContent).toBe('1284 pts');
      root.remove();
    });

    it('le score repart de zéro, un toucher saute la séquence : tout est posé sur la valeur finale', () => {
      const root = screen();
      const score = root.querySelector('[data-motion="finish-score"]')!;

      const skip = finishSequence(root, format);
      expect(score.textContent).toBe('0 pts');

      skip();
      expect(score.textContent).toBe('1284 pts');
      expect(root.querySelector<HTMLElement>('[data-motion="finish-square"]')?.style.opacity).toBe('');
      root.remove();
    });

    it('la jauge du niveau, les groupes et la bande du défi : posés d\'un toucher, sans style qui reste', () => {
      const root = screen();
      root.insertAdjacentHTML('beforeend', '<b data-motion="finish-bar"></b><section data-motion="finish-groups"></section><a data-motion="finish-band"></a>');

      finishSequence(root, format)();

      for (const name of ['finish-bar', 'finish-groups', 'finish-band']) {
        const el = root.querySelector<HTMLElement>(`[data-motion="${name}"]`)!;
        expect(el.style.opacity).toBe('');
        expect(el.style.transform).toBe('');
      }
      root.remove();
    });
  });

  describe('accueil', () => {
    it("une carte d'accueil et l'échelle des disques ne gardent aucun style à la fin", async () => {
      const root = document.createElement('div');
      root.innerHTML = '<i data-motion="ladder-disc"></i><i data-motion="ladder-disc"></i>';
      document.body.append(root);

      enterHomeCard(root);
      lightLadder(root);
      gsap.globalTimeline.progress(1);
      await new Promise((r) => setTimeout(r, 50));
      gsap.globalTimeline.getChildren().forEach((t) => t.progress(1));

      expect(root.style.transform).toBe('');
      for (const d of Array.from(root.querySelectorAll<HTMLElement>('i'))) expect(d.style.opacity).toBe('');
      root.remove();
    });
  });
});
