import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RankingEntry } from '../../domain/group';
import { RankingListComponent } from './ranking-list.component';

describe('RankingListComponent', () => {
  const entries: RankingEntry[] = [
    { rank: 1, pseudo: 'Théo', isMe: false, points: 1910, badge: 'runs.discs.gold' },
    { rank: 2, pseudo: 'Clément', isMe: true, points: 1380, badge: 'runs.discs.silver' },
    { rank: null, pseudo: 'Sam', isMe: false, points: null, badge: null },
  ];

  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RankingListComponent);
    fixture.componentRef.setInput('entries', entries);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-testid="ranking-row"]')];
  }

  const text = (row: HTMLElement, id: string) => row.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();

  it('une ligne par membre : rang, pseudo, points au format de la langue et disque', () => {
    const rows = render();

    expect(rows).toHaveLength(3);
    expect(text(rows[0], 'ranking-rank')).toBe('1');
    expect(text(rows[0], 'ranking-pseudo')).toBe('Théo');
    expect(text(rows[0], 'ranking-points')).toBe('1 910');
    expect(rows[0].querySelector('[data-badge]')?.getAttribute('data-badge')).toBe('runs.discs.gold');
    expect(rows[0].querySelector<HTMLElement>('[data-badge]')?.style.background).toBe('var(--disc-gold)');
  });

  it('la ligne du joueur est en orange et dit « Toi », celles des autres en violet', () => {
    const rows = render();

    expect(rows[1].getAttribute('data-me')).toBe('true');
    expect(text(rows[1], 'ranking-pseudo')).toBe('social.ranking.me');
    expect(rows[1].querySelector<HTMLElement>('[data-testid="ranking-points"]')?.style.color).toBe('var(--color-accent-3)');
    expect(rows[0].getAttribute('data-me')).toBeNull();
    expect(rows[0].querySelector<HTMLElement>('[data-testid="ranking-points"]')?.style.color).toBe('var(--color-violet)');
  });

  it('un membre qui n\'a pas encore joué n\'a ni rang, ni points, ni disque', () => {
    const rows = render();

    expect(text(rows[2], 'ranking-rank')).toBe('–');
    expect(rows[2].querySelector('[data-testid="ranking-points"]')).toBeNull();
    expect(text(rows[2], 'ranking-unplayed')).toBe('social.ranking.unplayed');
    expect(rows[2].querySelector('[data-badge]')).toBeNull();
  });
});
