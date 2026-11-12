import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { InstagramLinkComponent } from './instagram-link.component';

describe('InstagramLinkComponent', () => {
  it("mène à la page Instagram dans un nouvel onglet, sans référent", () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(InstagramLinkComponent);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('[data-testid="header-instagram"]')!;
    expect(link.href).toBe('https://www.instagram.com/inseconds.cc/');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });
});
