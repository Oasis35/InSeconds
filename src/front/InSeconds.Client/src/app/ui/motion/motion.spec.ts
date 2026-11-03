import { gsap } from 'gsap';
import { enterCard, enterRow, tweenNumber } from './motion';

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
});
