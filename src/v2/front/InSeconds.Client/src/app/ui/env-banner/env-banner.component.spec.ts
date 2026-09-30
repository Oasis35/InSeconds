import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EnvBannerComponent } from './env-banner.component';

describe('EnvBannerComponent', () => {
  function render(environmentName: string): HTMLElement {
    TestBed.configureTestingModule({
      imports: [EnvBannerComponent],
      providers: [provideTranslateService()],
    });
    const fixture = TestBed.createComponent(EnvBannerComponent);
    fixture.componentRef.setInput('environmentName', environmentName);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche le bandeau DEV sur le staging', () => {
    const banner = render('staging').querySelector('[data-testid="env-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('DEV');
  });

  for (const name of ['production', 'development', 'e2e']) {
    it(`n'affiche rien en ${name}`, () => {
      expect(render(name).querySelector('[data-testid="env-banner"]')).toBeNull();
    });
  }
});
