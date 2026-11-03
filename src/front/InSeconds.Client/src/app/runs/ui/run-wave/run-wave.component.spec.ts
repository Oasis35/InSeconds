import { TestBed } from '@angular/core/testing';
import { RunWaveComponent } from './run-wave.component';

describe('RunWaveComponent', () => {
  function render(peaks: readonly number[] | null) {
    const fixture = TestBed.createComponent(RunWaveComponent);
    fixture.componentRef.setInput('peaks', peaks);
    fixture.componentRef.setInput('height', 22);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('une barre par valeur de la forme, à sa hauteur', () => {
    const bars = [...render([0.5, 1, 0.25]).querySelectorAll<HTMLElement>('i')];

    expect(bars.map(b => b.style.height)).toEqual(['50%', '100%', '25%']);
  });

  it('sans forme, des barres plates', () => {
    const bars = [...render(null).querySelectorAll<HTMLElement>('i')];

    expect(bars).toHaveLength(60);
    expect(new Set(bars.map(b => b.style.height))).toEqual(new Set(['14%']));
  });

  it('décorative : cachée au lecteur d\'écran', () => {
    expect(render(null).getAttribute('aria-hidden')).toBe('true');
  });
});
