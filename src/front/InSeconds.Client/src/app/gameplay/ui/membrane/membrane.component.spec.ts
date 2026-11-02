import { TestBed } from '@angular/core/testing';
import { MembraneComponent } from './membrane.component';

describe('MembraneComponent', () => {
  afterEach(() => {
    delete (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations;
  });

  function render(level = 0) {
    const fixture = TestBed.createComponent(MembraneComponent);
    fixture.componentRef.setInput('level', level);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const setLevel = (value: number) => {
      fixture.componentRef.setInput('level', value);
      fixture.detectChanges();
    };
    return { element, setLevel, skin: () => element.querySelector<HTMLElement>('div')!.style.transform, waves: () => element.querySelectorAll('.membrane-wave').length };
  }

  it('se gonfle avec les basses', () => {
    const { skin, setLevel } = render(0);
    expect(skin()).toBe('scale(1)');
    setLevel(1);
    expect(skin()).toBe('scale(1.07)');
  });

  it('lance une onde sur un coup de basse, pas tant que la basse reste haute', () => {
    const { waves, setLevel } = render(0);
    setLevel(0.9);
    expect(waves()).toBe(1);
    setLevel(0.95);
    expect(waves()).toBe(1);
  });

  it('ne bouge pas quand les animations sont coupées', () => {
    (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations = true;
    const { skin, waves, setLevel } = render(0);
    setLevel(1);
    expect(skin()).toBe('');
    expect(waves()).toBe(0);
  });
});
