import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PillState } from '../../domain/run';
import { RunPillsComponent } from './run-pills.component';

describe('RunPillsComponent', () => {
  function render(pills: PillState[], position: number) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunPillsComponent);
    fixture.componentRef.setInput('pills', pills);
    fixture.componentRef.setInput('position', position);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("une pastille par morceau, dans l'ordre, avec son état", () => {
    const element = render(['found', 'half', 'current', 'todo', 'todo'], 3);

    expect(Array.from(element.querySelectorAll('[data-state]')).map(pill => pill.getAttribute('data-state'))).toEqual(['found', 'half', 'current', 'todo', 'todo']);
  });

  it('une pastille de morceau retiré est hachurée', () => {
    const element = render(['neutralized', 'current', 'todo'], 2);

    expect((element.querySelector('[data-state="neutralized"]') as HTMLElement).style.border).toContain('dashed');
  });

  it('dit « Morceau n sur N »', () => {
    const element = render(['found', 'current', 'todo'], 2);

    expect(element.querySelector('[data-testid="run-position"]')?.textContent).toContain('runs.pills.position');
  });
});
