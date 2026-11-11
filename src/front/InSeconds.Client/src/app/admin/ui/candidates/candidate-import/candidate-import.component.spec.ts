import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ParsedCandidateImport } from '../../../domain/candidates';
import { CandidateImportComponent } from './candidate-import.component';

describe('CandidateImportComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(CandidateImportComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const emitted: ParsedCandidateImport[] = [];
    fixture.componentInstance.imported.subscribe(p => emitted.push(p));
    const type = (value: string) => {
      const area = el.querySelector<HTMLTextAreaElement>('[data-testid="candidates-text"]')!;
      area.value = value;
      area.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const button = () => el.querySelector<HTMLButtonElement>('[data-testid="candidates-import"]')!;
    return { fixture, el, emitted, type, button };
  }

  it('reste désactivé sans identifiant lisible', () => {
    const { button, type } = render();
    expect(button().disabled).toBe(true);
    type('bonjour');
    expect(button().disabled).toBe(true);
  });

  it('envoie les identifiants lus, avec la priorité par défaut, puis vide le champ', () => {
    const { el, emitted, type, button, fixture } = render();
    const select = el.querySelector<HTMLSelectElement>('[data-testid="candidates-priority"]')!;
    select.value = 'B';
    select.dispatchEvent(new Event('change'));
    type('101\n102 A');

    button().click();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].items).toEqual([{ deezerTrackId: 101, priority: 'B' }, { deezerTrackId: 102, priority: 'A' }]);
    fixture.detectChanges();
    expect(el.querySelector<HTMLTextAreaElement>('[data-testid="candidates-text"]')!.value).toBe('');
  });

  it('signale les lignes illisibles sans empêcher l\'import des autres', () => {
    const { el, type, button } = render();
    type('101\nbonjour');

    expect(el.querySelector('[data-testid="candidates-issues"]')).not.toBeNull();
    expect(button().disabled).toBe(false);
  });

  it('refuse plus de 1000 morceaux d\'un coup', () => {
    const { el, type, button } = render();
    type(Array.from({ length: 1001 }, (_, i) => String(i + 1)).join('\n'));

    expect(el.querySelector('[data-testid="candidates-too-many"]')).not.toBeNull();
    expect(button().disabled).toBe(true);
  });
});
