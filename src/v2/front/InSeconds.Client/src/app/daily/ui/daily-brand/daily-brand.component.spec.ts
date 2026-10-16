import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DailyBrandComponent } from './daily-brand.component';

@Component({
  imports: [DailyBrandComponent],
  template: `<app-daily-brand><button brandLeft>série</button><a brandRight>avatar</a></app-daily-brand>`,
})
class Host {}

describe('DailyBrandComponent', () => {
  it('affiche le titre IN//SECONDS dans un h1', () => {
    const fixture = TestBed.createComponent(DailyBrandComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent?.replace(/\s+/g, '')).toBe('IN//SECONDS');
  });

  it('pose la gélule à gauche et le lien de compte à droite, dans la barre', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="brand-left"] button')?.textContent).toBe('série');
    expect(element.querySelector('[data-testid="brand-right"] a')?.textContent).toBe('avatar');
  });
});
