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
    return { element, byTestId: (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null };
  }

  it('montre la date du déploiement et les commits abrégés du front, de l\'API et de la branche', () => {
    const { element, byTestId } = render({
      deployedAt: '2026-11-04T09:12:00Z', frontCommit: '4f2a9c1d8e', apiCommit: '4f2a9c1d8e', branch: 'main', branchHead: '4f2a9c1d8e', verdict: 'aligned',
    });

    expect(byTestId('deployed-at')?.textContent).toContain('admin.deployedAt');
    expect(element.textContent?.match(/4f2a9c1/g)).toHaveLength(3);
    expect(byTestId('deployment-verdict')?.textContent).toContain('admin.system.verdict.aligned');
    expect(byTestId('deployment-verdict')?.style.color).toBe('var(--color-success)');
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
    const stale = render({ backup: 'stale', backupAt: '2026-11-02T03:00:00Z', backupOffSite: true }).byTestId('backup');
    expect(stale?.style.color).toBe('var(--text-error)');
    expect(stale?.textContent).toContain('admin.system.backupOffSite');
    TestBed.resetTestingModule();
    expect(render().byTestId('backup')?.textContent).toContain('admin.system.noBackup');
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
    expect(lines[1].textContent).toContain('admin.system.ciState.none');
  });

  it('le catalogue : un lien vers les morceaux sans extrait, les formes d\'onde manquantes', () => {
    const { byTestId } = render({ catalogue: { missingPreviewCount: 3, missingWaveformCount: 0 } });

    const link = byTestId('missing-previews') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/admin/catalogue?extrait=absent');
    expect(link.textContent).toContain('admin.system.tracksCount');
    expect(byTestId('missing-waveforms')?.textContent).toContain('0');
    expect(byTestId('missing-waveforms')?.textContent).toContain('✓');
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
    expect(retrying.querySelector('span')?.style.color).toBe('var(--text-error)');

    TestBed.resetTestingModule();
    const short = render({ nextChallenge: { kind: 'insufficient', eligibleCount: 2, requiredCount: 5 } }).byTestId('next-challenge')!;
    expect(short.textContent).toContain('admin.system.nextChallengeInsufficient');
  });
});
