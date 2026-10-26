import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunHomeCardComponent } from './run-home-card.component';

describe('RunHomeCardComponent', () => {
  it('ouvre Platines, avec le disque doré, le badge et la promesse', () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunHomeCardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="run-home-card"]')?.getAttribute('href')).toBe('/runs');
    expect(element.querySelector('[data-disc]')?.getAttribute('data-disc')).toBe('runs.discs.gold');
    expect(element.textContent).toContain('runs.welcome.badge');
    expect(element.textContent).toContain('runs.welcome.tagline');
  });
});
