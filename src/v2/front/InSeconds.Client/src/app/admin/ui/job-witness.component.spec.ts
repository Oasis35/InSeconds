import { DatePipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Witness } from '../domain/actions';
import { JobWitnessComponent } from './job-witness.component';

const AT = '2026-10-09T00:00:03Z';
const NEXT = '2026-10-10T00:00:00Z';

describe('JobWitnessComponent', () => {
  const local = new DatePipe('en-US');

  async function render(inputs: { witness?: Witness | null; nextRunAt?: string | null; failed?: boolean }) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', {
      admin: {
        actions: {
          previews: 'Previews Deezer',
          witness: {
            previewsReport: 'Contrôlé le {{ date }} à {{ time }} : {{ checked }} vérifié(s), {{ updated }} corrigé(s), {{ failed }} échec(s) Deezer.',
            retry: 'Nouvel essai le {{ date }} à {{ time }}.',
            next: 'Prochain passage le {{ date }} à {{ time }}.',
            never: 'Aucun passage ces 7 derniers jours.',
            loadError: 'Impossible de lire le dernier passage des tâches.',
          },
        },
      },
    });
    translate.use('fr');
    const fixture = TestBed.createComponent(JobWitnessComponent);
    fixture.componentRef.setInput('titleKey', 'admin.actions.previews');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('date et heure locales du passage (JJ/MM/AA, HH:MM), nombres du compte rendu, prochain passage', async () => {
    const text = await render({
      witness: { tone: 'warn', key: 'previewsReport', counts: { checked: 12, updated: 3, failed: 2 }, at: AT, retryAt: null },
      nextRunAt: NEXT,
    });

    expect(text).toContain('Previews Deezer');
    expect(text).toContain('⚠️');
    expect(text).toContain(`Contrôlé le ${local.transform(AT, 'dd/MM/yy')} à ${local.transform(AT, 'HH:mm')} : 12 vérifié(s), 3 corrigé(s), 2 échec(s) Deezer.`);
    expect(text).toContain(`Prochain passage le ${local.transform(NEXT, 'dd/MM/yy')} à ${local.transform(NEXT, 'HH:mm')}.`);
    expect(text).not.toContain('Nouvel essai');
  });

  it('prochain essai après un échec', async () => {
    const retryAt = '2026-10-09T00:10:03Z';
    const text = await render({ witness: { tone: 'error', key: 'never', counts: {}, at: AT, retryAt } });

    expect(text).toContain('❌');
    expect(text).toContain(`Nouvel essai le ${local.transform(retryAt, 'dd/MM/yy')} à ${local.transform(retryAt, 'HH:mm')}.`);
  });

  it('rien sous le titre tant que les passages ne sont pas lus ; un message si la lecture a échoué', async () => {
    expect(await render({ witness: null })).not.toContain('Aucun passage');
    TestBed.resetTestingModule();
    expect(await render({ failed: true })).toContain('Impossible de lire le dernier passage des tâches.');
  });
});
