import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StatsAnswers } from '../../../domain/stats';
import { StatsAnswersComponent } from './stats-answers.component';

describe('StatsAnswersComponent', () => {
  function render(answers: StatsAnswers) {
    TestBed.configureTestingModule({ imports: [StatsAnswersComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(StatsAnswersComponent);
    fixture.componentRef.setInput('answers', answers);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('montre les parts trouvées et un palier par ligne', () => {
    const element = render({ total: 100, artistFound: 60, titleFound: 50, withHint: 20, byListened: [{ seconds: 0.5, count: 10 }, { seconds: 1, count: 30 }] });
    const text = element.querySelector('[data-testid="stats-answers"]')!.textContent!;
    expect(text).toContain('60 %');
    expect(text).toContain('50 %');
    expect(text).toContain('20 %');
    expect(element.querySelectorAll('[data-testid="listened-tiers"] > div')).toHaveLength(2);
  });

  it('rien sans réponse', () => {
    expect(render({ total: 0, artistFound: 0, titleFound: 0, withHint: 0, byListened: [] }).querySelector('[data-testid="stats-answers"]')).toBeNull();
  });
});
