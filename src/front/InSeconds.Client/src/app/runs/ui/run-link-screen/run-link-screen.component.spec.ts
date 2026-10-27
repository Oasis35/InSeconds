import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunLink } from '../../domain/run';
import { LINK } from '../../data-access/testing/fake-runs-api';
import { RunLinkScreenComponent } from './run-link-screen.component';

describe('RunLinkScreenComponent', () => {
  function render(link: RunLink = LINK()) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunLinkScreenComponent);
    fixture.componentRef.setInput('link', link);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it("annonce l'auteur de la playlist, ou « Invité » à défaut", () => {
    expect(render().element.querySelector('[data-testid="run-link-title"]')?.textContent).toContain('runs.link.title');
  });

  it('montre les quatre règles, tirées des règles figées de la playlist', () => {
    const { element } = render(LINK({ trackCount: 30, rounds: 6 }));

    const rules = Array.from(element.querySelectorAll('[data-testid="run-link-rules"] li')).map(item => item.textContent ?? '');
    expect(rules).toHaveLength(4);
    expect(rules[0]).toContain('runs.link.tracks');
    expect(rules[1]).toContain('runs.link.rounds');
    expect(rules[2]).toContain('runs.link.listen');
    expect(rules[3]).toContain('runs.link.goal');
  });

  it('ne montre ni nombre de joueurs ni morceau (piège 31), et un seul bouton : Jouer', () => {
    const { element } = render();

    expect(element.querySelectorAll('button')).toHaveLength(1);
    expect(element.textContent).not.toContain('runs.comparison');
  });

  it('« Jouer » prévient la page, qui lance la partie dans ce clic', () => {
    const { fixture, element } = render();
    const start = vi.fn();
    fixture.componentInstance.start.subscribe(start);

    (element.querySelector('[data-testid="run-link-play"]') as HTMLButtonElement).click();

    expect(start).toHaveBeenCalledTimes(1);
  });
});
