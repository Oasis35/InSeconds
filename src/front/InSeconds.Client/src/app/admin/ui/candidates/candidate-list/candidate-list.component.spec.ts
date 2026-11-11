import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Candidate } from '../../../domain/candidates';
import { candidate } from '../../../data-access/testing/fake-catalogue-api';
import { CandidateListComponent } from './candidate-list.component';

describe('CandidateListComponent', () => {
  function render(candidates: Candidate[], selectedIds: number[] = [], dismissedView = false) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(CandidateListComponent);
    fixture.componentRef.setInput('candidates', candidates);
    fixture.componentRef.setInput('selectedIds', selectedIds);
    fixture.componentRef.setInput('dismissedView', dismissedView);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggled: number[] = [];
    const listened: number[] = [];
    fixture.componentInstance.selectionToggle.subscribe(id => toggled.push(id));
    fixture.componentInstance.listen.subscribe(c => listened.push(c.id));
    const rows = () => Array.from(el.querySelectorAll('[data-testid="candidate"]'));
    return { el, rows, toggled, listened };
  }

  it('met le ▶ à gauche de la ligne, avant le titre, et la case à droite', () => {
    const { rows } = render([candidate({ id: 1, priority: 'A' })]);
    const [first, last] = [rows()[0].firstElementChild!, rows()[0].lastElementChild!];

    expect(first.getAttribute('data-testid')).toBe('candidate-listen');
    expect(last.querySelector('[data-testid="candidate-check"]')).not.toBeNull();
    expect(rows()[0].textContent).toContain('Titre');
    expect(rows()[0].querySelector('[data-testid="candidate-priority"]')?.textContent).toBe('A');
  });

  it('émet l\'écoute et la case cochée', () => {
    const { rows, toggled, listened } = render([candidate({ id: 7 })]);

    rows()[0].querySelector<HTMLButtonElement>('[data-testid="candidate-listen"]')!.click();
    rows()[0].querySelector<HTMLInputElement>('[data-testid="candidate-check"]')!.click();

    expect(listened).toEqual([7]);
    expect(toggled).toEqual([7]);
  });

  it('grise le ▶ et la case d\'un candidat qu\'on ne peut pas ajouter, et dit pourquoi', () => {
    const { rows } = render([
      candidate({ id: 1, status: 'pending', preview: 'unknown', artist: null, title: null }),
      candidate({ id: 2, preview: 'missing' }),
      candidate({ id: 3, inCatalogue: true }),
      candidate({ id: 4, isAdding: true }),
      candidate({ id: 5, status: 'not_found', preview: 'unknown', artist: null, title: null }),
    ]);

    const notes = rows().map(r => r.querySelector('[data-testid="candidate-note"]')?.textContent?.trim());
    expect(notes).toEqual([
      'admin.candidates.reading', 'admin.candidates.noPreview', 'admin.candidates.inCatalogue', 'admin.candidates.adding', 'admin.candidates.notFound',
    ]);
    expect(rows().every(r => r.querySelector<HTMLInputElement>('[data-testid="candidate-check"]')!.disabled)).toBe(true);
    expect(rows()[0].querySelector<HTMLButtonElement>('[data-testid="candidate-listen"]')!.disabled).toBe(true);
  });

  it('laisse tout cocher dans la vue des écartés, pour les remettre', () => {
    const { rows } = render([candidate({ id: 1, preview: 'missing', isDismissed: true })], [], true);

    expect(rows()[0].querySelector<HTMLInputElement>('[data-testid="candidate-check"]')!.disabled).toBe(false);
  });
});
