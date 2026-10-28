import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrandComponent } from './brand.component';

@Component({
  imports: [BrandComponent],
  template: `<app-brand><a brandRight>avatar</a></app-brand>`,
})
class Host {}

describe('BrandComponent', () => {
  it('affiche le titre IN//SECONDS dans un h1', () => {
    const fixture = TestBed.createComponent(BrandComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent?.replace(/\s+/g, '')).toBe('IN//SECONDS');
  });

  it('pose ce que la page projette à droite du titre', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="brand-right"] a')?.textContent).toBe('avatar');
  });

  it('défile avec la page : ni barre collante ni fond flouté', () => {
    const fixture = TestBed.createComponent(BrandComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(getComputedStyle(host).position).not.toBe('sticky');
    expect(host.innerHTML).not.toContain('backdrop-filter');
  });
});
