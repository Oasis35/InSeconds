import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { challengeStats } from '../../../data-access/testing/fake-challenges-api';
import { ChallengeStats } from '../../../domain/challenge';
import { ChallengeScoreChartComponent } from './challenge-score-chart.component';

describe('ChallengeScoreChartComponent', () => {
  function render(challenge: ChallengeStats) {
    TestBed.configureTestingModule({ imports: [ChallengeScoreChartComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ChallengeScoreChartComponent);
    fixture.componentRef.setInput('challenge', challenge);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('dessine l\'égaliseur du défi, tout en violet, avec la moyenne', () => {
    const element = render(challengeStats({ scoreAvg: 1234.5 }));

    expect(element.querySelector('[data-testid="score-distribution-chart"]')).not.toBeNull();
    expect(element.textContent).toContain('1234.5');
    const lit = Array.from(element.querySelectorAll('rect[data-lit="true"]'));
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every(rect => rect.getAttribute('fill') === 'var(--color-violet)')).toBe(true);
    expect(element.querySelector('[data-testid="score-better-than"]')).toBeNull();
  });

  it('rien tant que personne n\'a fini', () => {
    const element = render(challengeStats({ scoreMin: null, scoreMax: null, scoreMedian: null, scoreAvg: null }));

    expect(element.querySelector('[data-testid="challenge-score-chart"]')).toBeNull();
  });
});
