import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CohortRow } from '../../../domain/stats';
import { StatsCohortTableComponent } from './stats-cohort-table.component';

describe('StatsCohortTableComponent', () => {
  function render(rows: CohortRow[]) {
    TestBed.configureTestingModule({ imports: [StatsCohortTableComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(StatsCohortTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('labelPrefix', 'admin.sources');
    fixture.componentRef.setInput('knownKeys', ['instagram']);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('montre les nouveaux et les taux J+1 / J+7, un point sans éligible', () => {
    const element = render([
      { key: 'instagram', newPlayers: 12, day1Eligible: 10, day1Returned: 4, day7Eligible: 0, day7Returned: 0 },
      { key: 'google.com', newPlayers: 2, day1Eligible: 2, day1Returned: 1, day7Eligible: 0, day7Returned: 0 },
    ]);
    const rows = Array.from(element.querySelectorAll('[data-testid="cohort-row"]')).map(e => Array.from(e.children).map(c => c.textContent!.trim()).join(' '));
    expect(rows).toEqual(['admin.sources.instagram 12 40 % ·', 'google.com 2 50 % ·']);
  });
});
