import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { EAR_PROFILE } from '../../data-access/testing/fake-daily-api';
import { EarProfileCardComponent } from './ear-profile-card.component';

describe('EarProfileCardComponent', () => {
  function render(profile = EAR_PROFILE()) {
    TestBed.configureTestingModule({ imports: [EarProfileCardComponent], providers: [provideRouter([]), provideTranslateService()] });
    const fixture = TestBed.createComponent(EarProfileCardComponent);
    fixture.componentRef.setInput('profile', profile);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mène à la page du profil, avec sa moyenne, sa tendance et sa courbe', () => {
    const el = render();

    expect(el.querySelector('[data-testid="ear-profile-card"]')?.getAttribute('href')).toBe('/history/daily/profil');
    expect(el.querySelector('[data-testid="ear-profile-card-average"]')?.textContent?.replace(/\s/g, '')).toBe('2000');
    expect(el.querySelector('[data-testid="ear-profile-card-trend"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ear-profile-chart"]')).not.toBeNull();
  });

  it('sans tendance, pas de ligne de tendance', () => {
    const el = render(EAR_PROFILE({ trendPercent: null }));

    expect(el.querySelector('[data-testid="ear-profile-card-trend"]')).toBeNull();
  });
});
