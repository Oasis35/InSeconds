import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ScoreRow } from '../../domain/group-scores';
import { ScoreListComponent } from './score-list.component';

describe('ScoreListComponent', () => {
  const week: ScoreRow[] = [
    { rank: 1, pseudo: 'Théo', isMe: false, value: 980, days: [false, false, true, false, true, false, true] },
    { rank: 2, pseudo: 'Clément', isMe: true, value: 600, days: [true, false, false, false, false, false, true] },
    { rank: null, pseudo: 'Sam', isMe: false, value: null, days: [false, false, false, false, false, false, false] },
  ];

  function render(rows: readonly ScoreRow[], unplayedKey?: string) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ScoreListComponent);
    fixture.componentRef.setInput('rows', rows);
    if (unplayedKey) fixture.componentRef.setInput('unplayedKey', unplayedKey);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-testid="score-row"]')];
  }

  const text = (row: HTMLElement, id: string) => row.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();

  it('une ligne par membre : rang, pseudo et points', () => {
    const rows = render(week);

    expect(rows).toHaveLength(3);
    expect(text(rows[0], 'score-rank')).toBe('1');
    expect(text(rows[0], 'score-pseudo')).toBe('Théo');
    expect(text(rows[0], 'score-value')).toBe('980');
  });

  it('sept points sous le pseudo, allumés les jours joués, du plus ancien au jour en cours', () => {
    const rows = render(week);

    const dots = [...rows[0].querySelectorAll('[data-testid="score-day"]')].map(dot => dot.getAttribute('data-on') === 'true');
    expect(dots).toEqual([false, false, true, false, true, false, true]);
    expect(rows[0].querySelector('[data-testid="score-days"]')?.getAttribute('data-played')).toBe('3');
    expect(rows[0].querySelector('[data-testid="score-days"]')?.getAttribute('aria-label')).toBe('social.scores.daysPlayed');
  });

  it('la ligne du joueur est en orange et dit « Toi », ses jours aussi ; les autres en violet', () => {
    const rows = render(week);

    expect(rows[1].getAttribute('data-me')).toBe('true');
    expect(text(rows[1], 'score-pseudo')).toBe('social.ranking.me');
    expect(rows[1].querySelector<HTMLElement>('[data-testid="score-value"]')?.style.color).toBe('var(--color-accent-3)');
    expect(rows[1].querySelector<HTMLElement>('[data-on="true"]')?.style.background).toBe('var(--color-accent-3)');
    expect(rows[0].querySelector<HTMLElement>('[data-testid="score-value"]')?.style.color).toBe('var(--color-violet)');
    expect(rows[0].querySelector<HTMLElement>('[data-on="true"]')?.style.background).toBe('var(--color-violet)');
  });

  it('un membre sans partie : pas de rang ni de valeur, le libellé demandé', () => {
    const rows = render(week, 'social.scores.notYet');

    expect(text(rows[2], 'score-rank')).toBe('–');
    expect(rows[2].querySelector('[data-testid="score-value"]')).toBeNull();
    expect(text(rows[2], 'score-unplayed')).toBe('social.scores.notYet');
  });

  it('le jour : pas de points de semaine', () => {
    const rows = render([{ rank: 1, pseudo: 'Théo', isMe: false, value: 900, days: null }]);

    expect(rows[0].querySelector('[data-testid="score-days"]')).toBeNull();
    expect(text(rows[0], 'score-value')).toBe('900');
  });
});
