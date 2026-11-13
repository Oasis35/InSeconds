import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { HomeLegalLineComponent } from './home-legal-line.component';

describe('HomeLegalLineComponent', () => {
  it('porte les trois liens : mentions légales, confidentialité, contact', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(HomeLegalLineComponent);
    fixture.detectChanges();
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(links).toEqual(['/legal', '/privacy', 'mailto:contact@inseconds.cc']);
  });
});
