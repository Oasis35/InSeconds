import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ContentTabsComponent } from './content-tabs.component';

describe('ContentTabsComponent', () => {
  function render(candidates: number | null) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService()] });
    const fixture = TestBed.createComponent(ContentTabsComponent);
    fixture.componentRef.setInput('candidates', candidates);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lie les trois pages du contenu', () => {
    const links = Array.from(render(null).querySelectorAll('a')).map(a => a.getAttribute('href'));

    expect(links).toEqual(['/admin/catalogue', '/admin/themes', '/admin/a-valider']);
  });

  it('montre le nombre de candidats à traiter quand il est connu et non nul', () => {
    expect(render(12).querySelectorAll('a')[2].textContent).toContain('12');
    TestBed.resetTestingModule();
    expect(render(0).querySelectorAll('a')[2].textContent).not.toContain('0');
    TestBed.resetTestingModule();
    expect(render(null).querySelectorAll('a')[2].textContent).not.toMatch(/\d/);
  });
});
