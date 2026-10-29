import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RoundStakeComponent } from './round-stake.component';

describe('RoundStakeComponent', () => {
  afterEach(() => {
    delete (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations;
  });

  function render(value: number) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RoundStakeComponent);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const setValue = (next: number) => {
      fixture.componentRef.setInput('value', next);
      fixture.detectChanges();
    };
    return {
      element, setValue, fixture,
      shown: () => element.querySelector('[data-testid="round-stake"]')!.textContent,
      drop: () => element.querySelector('.stake-drop')?.textContent ?? null,
    };
  }

  it('affiche les points en jeu', () => {
    const { shown, drop, element } = render(1000);
    expect(shown()).toBe('1000');
    expect(drop()).toBeNull();
    expect(element.textContent).toContain('gameplay.round.stake');
  });

  it('décompte quand les points baissent, et la perte s\'envole', async () => {
    const { shown, drop, setValue, fixture } = render(1000);
    setValue(850);
    expect(drop()).toBe('−150');
    await new Promise(resolve => setTimeout(resolve, 600));
    fixture.detectChanges();
    expect(shown()).toBe('850');
  });

  it('change sans animation quand les points remontent (morceau suivant)', () => {
    const { shown, drop, setValue } = render(100);
    setValue(1000);
    expect(shown()).toBe('1000');
    expect(drop()).toBeNull();
  });

  it('change sans animation quand les animations sont coupées', () => {
    (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations = true;
    const { shown, drop, setValue } = render(1000);
    setValue(850);
    expect(shown()).toBe('850');
    expect(drop()).toBeNull();
  });
});
