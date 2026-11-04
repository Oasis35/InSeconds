import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { challengePlayer, challengeStats } from '../../../data-access/testing/fake-challenges-api';
import { ChallengeTableComponent } from './challenge-table.component';

describe('ChallengeTableComponent', () => {
  function render(selectedId: number | null = null) {
    TestBed.configureTestingModule({ imports: [ChallengeTableComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ChallengeTableComponent);
    fixture.componentRef.setInput('challenges', [
      challengeStats({ id: 5, date: '2026-10-05', playerCount: 3, abandonedCount: 1, expiredCount: 1, scoreMedian: 2400,
        players: [challengePlayer({ pseudo: 'Alice' }), challengePlayer({ playerId: 'p2', pseudo: null })] }),
      challengeStats({ id: 4, date: '2026-10-04' }),
    ]);
    fixture.componentRef.setInput('selectedId', selectedId);
    fixture.detectChanges();
    return { fixture, rows: Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')) as HTMLElement[] };
  }

  it('une ligne par défi : date, joueurs, comptes, invités, finies, abandons et inachevées, médiane', () => {
    const { rows } = render();

    expect(rows).toHaveLength(2);
    expect(Array.from(rows[0].querySelectorAll('td')).map(td => td.textContent?.trim()))
      .toEqual(['05/10/2026', '2', '1', '1', '3', '2', '2400']);
  });

  it('marque la ligne sélectionnée, et annonce le défi cliqué', () => {
    const { fixture, rows } = render(5);
    const selected = vi.fn();
    fixture.componentInstance.selectChallenge.subscribe(selected);

    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    rows[1].click();
    (rows[1].querySelector('button') as HTMLButtonElement).click();

    expect(selected.mock.calls).toEqual([[4], [4]]);
  });
});
