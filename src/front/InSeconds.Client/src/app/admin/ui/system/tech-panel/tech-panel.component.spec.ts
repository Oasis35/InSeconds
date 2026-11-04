import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { TechPanelComponent } from './tech-panel.component';

describe('TechPanelComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [TechPanelComponent], providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(TechPanelComponent);
    fixture.componentRef.setInput('jobsUrl', '/jobs');
    fixture.componentRef.setInput('grafanaUrl', 'https://grafana.test');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, fixture, byTestId: (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null };
  }

  it('montre la date du déploiement et le verdict ; les commits abrégés du front, de l\'API et de la branche se déplient au clic', async () => {
    const { element, byTestId, fixture } = render({
      deployedAt: '2026-11-04T09:12:00Z', frontCommit: '4f2a9c1d8e', apiCommit: '4f2a9c1d8e', branch: 'main', branchHead: '4f2a9c1d8e', verdict: 'aligned',
    });

    expect(byTestId('deployed-at')?.textContent).toContain('admin.deployedAt');
    const verdict = byTestId('deployment-verdict')!;
    expect(verdict.textContent).toContain('admin.system.verdict.aligned');
    expect(verdict.style.color).toBe('var(--color-success)');
    expect(verdict.getAttribute('aria-expanded')).toBe('false');
    expect(byTestId('deployment-commits')).toBeNull();

    verdict.click();
    await fixture.whenStable();

    expect(verdict.getAttribute('aria-expanded')).toBe('true');
    expect(element.textContent?.match(/4f2a9c1/g)).toHaveLength(3);
  });

  it('déploiement en retard ou désaligné : les commits sont dépliés d\'office, et se replient au clic', async () => {
    const { byTestId, fixture } = render({ frontCommit: 'aaaaaaa', apiCommit: 'aaaaaaa', branch: 'main', branchHead: 'bbbbbbb', verdict: 'pending' });

    expect(byTestId('deployment-commits')?.textContent).toContain('bbbbbbb');
    byTestId('deployment-verdict')!.click();
    await fixture.whenStable();
    expect(byTestId('deployment-commits')).toBeNull();
  });

  it('un build local : ni date, ni commits, ni branche', () => {
    const { element, byTestId } = render();

    expect(byTestId('deployed-at')).toBeNull();
    expect(element.textContent).toContain('admin.system.localBuild');
    expect(element.textContent).not.toContain('admin.system.branchHead');
  });

  it('front et API désalignés : le verdict en rouge', () => {
    const { byTestId } = render({ frontCommit: 'aaaaaaa', apiCommit: 'bbbbbbb', verdict: 'mismatch' });

    expect(byTestId('deployment-verdict')?.style.color).toBe('var(--text-error)');
  });

  it('santé : la latence de l\'API, ou injoignable ; la sauvegarde, manquée en rouge, absente au staging', () => {
    expect(render({ latencyMs: 38 }).byTestId('api-health')?.textContent).toContain('admin.system.latency');
    TestBed.resetTestingModule();
    expect(render({ apiDown: true }).byTestId('api-health')?.textContent).toContain('admin.system.apiDown');
    TestBed.resetTestingModule();
    const stale = render({ backup: 'stale', backupAt: '2026-11-02T03:00:00Z', backupOffSite: true });
    expect(stale.byTestId('backup')?.style.color).toBe('var(--text-error)');
    expect(stale.byTestId('backup')?.textContent).toContain('02/11');
    // Copiée sur R2 (« hors site ») : la normale, rien de plus à dire.
    expect(stale.byTestId('backup-local')).toBeNull();
    TestBed.resetTestingModule();
    expect(render({ backup: 'ok', backupAt: '2026-11-04T03:00:00Z', backupOffSite: false }).byTestId('backup-local')?.textContent)
      .toContain('admin.system.backupLocal');
    TestBed.resetTestingModule();
    expect(render().byTestId('backup')?.textContent).toContain('admin.system.noBackup');
  });

  it('sauvegarde en échec : la dernière réussie reste ✓, l\'échec en rouge dessous avec son message', () => {
    const { byTestId } = render({
      backup: 'failed', backupAt: '2026-11-03T03:00:00Z', backupOffSite: true,
      backupFailure: { at: '2026-11-04T03:00:30Z', step: 'dump', message: 'étape 1/3 dump : dump vide' },
    });

    expect(byTestId('backup')?.style.color).toBe('');
    expect(byTestId('backup')?.parentElement?.textContent).toContain('✓');
    expect(byTestId('backup-failure')?.textContent).toContain('admin.system.backupFailed');
    expect(byTestId('backup-failure')?.textContent).toContain('étape 1/3 dump : dump vide');
  });

  it('restauration testée : la date en vert, l\'échec en rouge avec son message, « jamais » sans contrôle', () => {
    const ok = render({ restoreTest: 'ok', restoreTestAt: '2026-11-04T04:01:37Z' });
    expect(ok.byTestId('restore-test')?.style.color).toBe('');
    expect(ok.byTestId('restore-test')?.parentElement?.textContent).toContain('✓');
    expect(ok.byTestId('restore-test-failure')).toBeNull();
    TestBed.resetTestingModule();
    const failed = render({
      restoreTest: 'failed', restoreTestAt: '2026-11-03T04:01:00Z',
      restoreTestFailure: { at: '2026-11-04T04:01:00Z', step: 'freshness', message: 'aucune sauvegarde dans daily/ sur R2.' },
    });
    expect(failed.byTestId('restore-test')?.style.color).toBe('');
    expect(failed.byTestId('restore-test')?.parentElement?.textContent).toContain('✓');
    expect(failed.byTestId('restore-test-failure')?.textContent).toContain('aucune sauvegarde dans daily/ sur R2.');
    TestBed.resetTestingModule();
    expect(render().byTestId('restore-test')?.textContent).toContain('admin.system.noRestoreTest');
  });

  it('les tâches de la nuit, chacune avec son état, et le lien vers Hangfire', () => {
    const { element } = render({
      jobs: [{ id: 'catalogue-refresh', tone: 'ok', at: '2026-11-03T23:00:00Z' }, { id: 'daily-close-day', tone: 'error', at: null }],
    });

    const rows = element.querySelectorAll('[data-testid="nightly-job"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('admin.system.jobs.catalogue-refresh');
    expect(rows[1].textContent).toContain('admin.system.jobTone.error');
    expect(element.querySelector('a[href="/jobs"]')).not.toBeNull();
  });

  it('la CI de chaque branche, liée à son passage chez GitHub', () => {
    const { element } = render({
      ci: [
        { labelKey: 'admin.system.ciProd', url: 'https://github.test/main', run: { branch: 'main', headSha: 'a', state: 'failure', url: 'https://github.test/run/1' } },
        { labelKey: 'admin.system.ciStaging', url: 'https://github.test/staging', run: null },
      ],
    });

    const lines = Array.from(element.querySelectorAll<HTMLAnchorElement>('[data-testid="ci-line"]'));
    expect(lines.map(l => l.getAttribute('href'))).toEqual(['https://github.test/run/1', 'https://github.test/staging']);
    expect(lines[0].textContent).toContain('admin.system.ciState.failure');
    expect(lines[0].querySelector('.tech-icon')?.textContent).toBe('✗');
    expect(lines[1].textContent).toContain('admin.system.ciState.none');
    // La prod et le staging côte à côte, sur une même ligne.
    expect(lines[0].parentElement).toBe(lines[1].parentElement);
  });

  it('le catalogue : un lien vers les morceaux sans extrait, les formes d\'onde manquantes', () => {
    const { byTestId } = render({ catalogue: { missingPreviewCount: 3, missingWaveformCount: 0 } });

    const link = byTestId('missing-previews') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/admin/catalogue?extrait=absent');
    expect(link.textContent).toContain('admin.system.tracksCount');
    expect(byTestId('missing-waveforms')?.textContent).toContain('0');
    // L'indicateur à gauche de la ligne : ✓ à zéro, ! sinon.
    expect(byTestId('missing-waveforms')?.parentElement?.querySelector('.tech-icon')?.textContent).toBe('✓');
    expect(byTestId('missing-previews')?.parentElement?.querySelector('.tech-icon')?.textContent).toBe('!');
  });

  it('rien du catalogue tant qu\'il n\'est pas lu ; aucun morceau sans extrait : pas de lien', () => {
    expect(render().byTestId('tech-catalogue')).toBeNull();
    TestBed.resetTestingModule();
    expect(render({ catalogue: { missingPreviewCount: 0, missingWaveformCount: 2 } }).byTestId('missing-previews')?.tagName).toBe('SPAN');
  });

  it('le défi de demain : prêt en vert, pas assez de morceaux ou génération en échec en rouge', () => {
    const ready = render({ nextChallenge: { kind: 'ready', eligibleCount: 212, generated: false } }).byTestId('next-challenge')!;
    expect(ready.textContent).toContain('admin.system.nextChallengeReady');
    expect(ready.querySelector('span')?.style.color).toBe('var(--color-success)');

    TestBed.resetTestingModule();
    const retrying = render({ nextChallenge: { kind: 'retrying', retryAt: '2026-11-04T00:10:00Z' } }).byTestId('next-challenge')!;
    expect(retrying.textContent).toContain('admin.system.nextChallengeRetryAt');
    expect(retrying.textContent).toContain('admin.system.todayChallenge');
    expect(retrying.querySelector('span')?.style.color).toBe('var(--text-error)');

    TestBed.resetTestingModule();
    const short = render({ nextChallenge: { kind: 'insufficient', eligibleCount: 2, requiredCount: 5 } }).byTestId('next-challenge')!;
    expect(short.textContent).toContain('admin.system.nextChallengeInsufficient');
  });
});
