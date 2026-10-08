import { TestBed } from '@angular/core/testing';
import { DailyBrandComponent } from './daily-brand.component';

describe('DailyBrandComponent', () => {
  it('affiche le titre IN//SECONDS dans un h1', () => {
    const fixture = TestBed.createComponent(DailyBrandComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent?.replace(/\s+/g, '')).toBe('IN//SECONDS');
  });
});
