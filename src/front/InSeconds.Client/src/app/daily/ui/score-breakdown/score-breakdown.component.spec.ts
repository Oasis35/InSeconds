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
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return { fixture, element, byId };
  }
  const base: ScoreBreakdown = { seconds: 1, base: 850, missed: null, hintPenaltyPercent: 0, score: 850 };

  it('tout trouvé sans indice : barre pleine, « maximum possible », aucune pastille', () => {
    const { byId } = render(base);
    expect((byId('breakdown-bar')?.firstElementChild as HTMLElement).style.width).toBe('100%');
    expect(byId('breakdown-base')?.textContent).toContain('daily.round.breakdown.max');
    expect(byId('breakdown-causes')).toBeNull();
  });

  it('un seul des deux trouvé : la barre ne montre que la part gagnée, les pastilles de la cause sont visibles d\'emblée', () => {
    const { byId } = render({ ...base, missed: 'title', hintPenaltyPercent: 30, score: 298 });
    expect(Number.parseFloat((byId('breakdown-bar')?.firstElementChild as HTMLElement).style.width)).toBeCloseTo(35, 0);
    expect(byId('breakdown-base')?.textContent).toContain('daily.round.breakdown.outOf');
    const causes = byId('breakdown-causes')!.textContent!;
    expect(causes).toContain('daily.round.breakdown.missedTitle');
    expect(causes).toContain('daily.round.breakdown.half');
    expect(causes).toContain('daily.round.breakdown.hintPenalty');
  });

  it('un indice seul : la pastille de sa pénalité, sans celle de la moitié', () => {
    const { byId } = render({ ...base, hintPenaltyPercent: 30, score: 595 });
    expect(byId('breakdown-causes')!.textContent).not.toContain('daily.round.breakdown.half');
    expect(byId('breakdown-causes')!.textContent).toContain('daily.round.breakdown.hintPenalty');
  });

  it('un nouveau morceau change les pastilles', () => {
    const { fixture, byId } = render({ ...base, missed: 'title', score: 425 });
    fixture.componentRef.setInput('breakdown', { ...base, missed: 'artist', score: 425 });
    fixture.detectChanges();
    expect(byId('breakdown-causes')!.textContent).toContain('daily.round.breakdown.missedArtist');
  });

  it('rien à expliquer : rien d\'affiché', () => {
    expect(render(null).byId('score-breakdown')).toBeNull();
  });
});
