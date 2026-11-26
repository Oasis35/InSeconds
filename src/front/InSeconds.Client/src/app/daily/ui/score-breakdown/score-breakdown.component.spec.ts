import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ScoreBreakdown } from '../../domain/score-breakdown';
import { ScoreBreakdownComponent } from './score-breakdown.component';

describe('ScoreBreakdownComponent', () => {
  function render(breakdown: ScoreBreakdown | null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ScoreBreakdownComponent);
    fixture.componentRef.setInput('breakdown', breakdown);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, lines: () => element.querySelectorAll('[data-motion="breakdown-line"]') };
  }
  const base: ScoreBreakdown = { seconds: 1, base: 850, missed: null, hintPenaltyPercent: 0, score: 850 };

  it('tout trouvé sans indice : une seule ligne, le barème du palier', () => {
    const { element, lines } = render(base);
    expect(lines()).toHaveLength(1);
    expect(element.querySelector('[data-testid="breakdown-base"]')?.textContent).toContain('850');
  });

  it('un seul des deux trouvé : la ligne de la moitié, avec ce qui manque', () => {
    const { element, lines } = render({ ...base, missed: 'title', score: 425 });
    expect(lines()).toHaveLength(2);
    expect(element.textContent).toContain('daily.round.breakdown.missedTitle');
    expect(element.textContent).toContain('daily.round.breakdown.half');
  });

  it('un indice pris : la ligne de sa pénalité', () => {
    const { element, lines } = render({ ...base, hintPenaltyPercent: 30, score: 595 });
    expect(lines()).toHaveLength(2);
    expect(element.textContent).toContain('daily.round.breakdown.hintPenalty');
  });

  it('rien à expliquer : rien d\'affiché', () => {
    expect(render(null).lines()).toHaveLength(0);
  });
});
