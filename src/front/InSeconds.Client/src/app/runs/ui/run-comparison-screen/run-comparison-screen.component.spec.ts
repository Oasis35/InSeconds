import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RunComparison } from '../../domain/run';
import { COMPARISON } from '../../data-access/testing/fake-runs-api';
import { RunComparisonScreenComponent } from './run-comparison-screen.component';

describe('RunComparisonScreenComponent', () => {
  function render(comparison: RunComparison = COMPARISON(), inputs: { copied?: boolean; failed?: boolean } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunComparisonScreenComponent);
    fixture.componentRef.setInput('comparison', comparison);
    fixture.componentRef.setInput('shareCopied', inputs.copied ?? false);
    fixture.componentRef.setInput('shareFailed', inputs.failed ?? false);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const rows = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>('tbody tr'));

  it("montre le surtitre de l'auteur et le nombre de joueurs", () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="run-comparison-eyebrow"]')?.textContent).toContain('runs.comparison.eyebrow');
    expect(element.querySelector('[data-testid="run-comparison-title"]')?.textContent).toContain('runs.comparison.title');
  });

  it('un seul joueur : le titre au singulier', () => {
    const { element } = render(COMPARISON({ playerCount: 1, rows: [COMPARISON().rows[0]] }));

    expect(element.querySelector('[data-testid="run-comparison-title"]')?.textContent).toContain('runs.comparison.titleOne');
  });

  it('une colonne par manche de la playlist, puis le total', () => {
    const { element } = render(COMPARISON({ roundCount: 4 }));

    const headers = Array.from(element.querySelectorAll('thead th')).map(cell => cell.textContent?.trim());
    expect(headers).toEqual(['runs.comparison.player', 'runs.comparison.roundShort', 'runs.comparison.roundShort', 'runs.comparison.roundShort', 'runs.comparison.roundShort', 'runs.comparison.total']);
  });

  it("garde l'ordre reçu, montre « Toi » sur la ligne du joueur, « Invité » sans pseudo, et le disque dessous", () => {
    const { element } = render();

    const [first, second] = rows(element);
    expect(first.querySelector('[data-testid="run-comparison-name"]')?.textContent).toContain('Clément');
    expect(first.getAttribute('data-me')).toBe('false');
    expect(first.textContent).toContain('runs.discs.gold');
    expect(second.querySelector('[data-testid="run-comparison-name"]')?.textContent).toContain('runs.comparison.you');
    expect(second.getAttribute('data-me')).toBe('true');
  });

  it("un joueur invité qui n'est pas « Toi » s'appelle « Invité »", () => {
    const { element } = render(COMPARISON({ rows: [{ ...COMPARISON().rows[1], isMe: false }] }));

    expect(rows(element)[0].querySelector('[data-testid="run-comparison-name"]')?.textContent).toContain('runs.link.guest');
  });

  it('une manche non jouée est un ✕, les autres montrent leur score, le total est en dernière colonne', () => {
    const { element } = render();

    const cells = Array.from(rows(element)[1].querySelectorAll('td')).map(cell => cell.textContent?.trim());
    expect(cells).toEqual(['480', '0', '✕', '✕', '480']);
  });

  it('les étoiles au-delà de la liste des disques', () => {
    const { element } = render(COMPARISON({ rows: [{ ...COMPARISON().rows[0], disc: { key: 'runs.discs.gold', stars: 2 } }] }));

    expect(rows(element)[0].textContent).toContain('★2');
  });

  it("« Partager la playlist » prévient la page ; l'état du bouton suit la copie", () => {
    const { fixture, element } = render();
    const share = vi.fn();
    fixture.componentInstance.share.subscribe(share);

    (element.querySelector('[data-testid="run-share"] button') as HTMLButtonElement).click();

    expect(share).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="run-share"]')?.textContent).toContain('runs.finished.share');
  });

  it('le bouton dit « Lien copié ! » une fois copié', () => {
    expect(render(COMPARISON(), { copied: true }).element.querySelector('[data-testid="run-share"]')?.textContent).toContain('runs.finished.shareCopied');
  });
});
