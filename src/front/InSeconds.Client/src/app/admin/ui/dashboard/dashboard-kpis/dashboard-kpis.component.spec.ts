import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DayKpis } from '../../../domain/dashboard';
import { DashboardKpisComponent } from './dashboard-kpis.component';

const kpis = (overrides: Partial<DayKpis> = {}): DayKpis => ({
  day: '2026-11-20', completedCount: 40, abandonedCount: 3, expiredCount: 0, pendingCount: 0, totalSessions: 45, completionRate: 89,
  medianScore: 2410, newPlayersCount: 7, accountsCreatedCount: 1, firstTimeFinishersCount: 6, arrivals: [], ...overrides,
});

describe('DashboardKpisComponent', () => {
  function render(value: DayKpis | null, inputs: Partial<{ openByDefault: boolean; canRecompute: boolean; computedAt: string | null; recomputing: boolean; recomputeErrorKey: string | null }> = {}) {
    TestBed.resetTestingModule(); // un test peut afficher plusieurs jours : chaque rendu repart d'un module neuf
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DashboardKpisComponent);
    fixture.componentRef.setInput('kpis', value);
    for (const [name, input] of Object.entries(inputs)) fixture.componentRef.setInput(name, input);
    const recompute = vi.fn();
    fixture.componentInstance.recompute.subscribe(recompute);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byTestId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const click = (id: string) => { byTestId(id)!.click(); fixture.detectChanges(); };
    const text = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim();
    return { fixture, element, byTestId, click, text, recompute };
  }

  it('sans défi ce jour-là : le message à la place des chiffres', () => {
    const { element, byTestId } = render(null);

    expect(element.textContent).toContain('admin.dashboard.noChallengeForDay');
    expect(byTestId('kpi-completed')).toBeNull();
    expect(byTestId('kpi-toggle')).toBeNull();
  });

  it('les trois tuiles : ont fini, nouveaux joueurs, score médian', () => {
    const { text } = render(kpis({ completedCount: 40, newPlayersCount: 7, medianScore: 2410 }));

    expect(text('kpi-completed')).toContain('40');
    expect(text('kpi-new')).toContain('7');
    expect(text('kpi-median')).toContain('2');
    expect(text('kpi-median')).toContain('410');
  });

  it('sans score médian (personne n\'a fini), un trait', () => {
    expect(render(kpis({ completedCount: 0, medianScore: null })).text('kpi-median')).toContain('-');
  });

  describe('volet « Détail »', () => {
    it('replié d\'office sur téléphone, déplié et replié au clic', () => {
      const { byTestId, click } = render(kpis(), { openByDefault: false });

      expect(byTestId('kpi-details')).toBeNull();
      expect(byTestId('kpi-toggle')!.getAttribute('aria-expanded')).toBe('false');
      click('kpi-toggle');
      expect(byTestId('kpi-details')).not.toBeNull();
      expect(byTestId('kpi-toggle')!.getAttribute('aria-expanded')).toBe('true');
      click('kpi-toggle');
      expect(byTestId('kpi-details')).toBeNull();
    });

    it('déplié d\'office sur PC', () => {
      expect(render(kpis(), { openByDefault: true }).byTestId('kpi-details')).not.toBeNull();
    });

    it('le détail compte les abandons, la part qui finit et les comptes créés', () => {
      const details = render(kpis({ abandonedCount: 3, completionRate: 89, accountsCreatedCount: 1 }), { openByDefault: true }).text('kpi-details')!;

      expect(details).toContain('3');
      expect(details).toContain('admin.dashboard.abandons');
      expect(details).toContain('admin.dashboard.rate');
      expect(details).toContain('admin.dashboard.accountCreated');
    });

    it('un seul abandon ou un seul compte créé se dit au singulier', () => {
      const details = render(kpis({ abandonedCount: 1, accountsCreatedCount: 1 }), { openByDefault: true }).text('kpi-details')!;

      expect(details).toContain('admin.dashboard.abandon ');
      expect(details).not.toContain('admin.dashboard.abandons');
      expect(render(kpis({ accountsCreatedCount: 4 }), { openByDefault: true }).text('kpi-details')).toContain('admin.dashboard.accountsCreated');
    });

    it('les parties en cours et les inachevées ne figurent que quand il y en a', () => {
      const none = render(kpis({ pendingCount: 0, expiredCount: 0 }), { openByDefault: true }).text('kpi-details')!;
      expect(none).not.toContain('admin.dashboard.pending');
      expect(none).not.toContain('admin.dashboard.expired');

      const some = render(kpis({ pendingCount: 2, expiredCount: 1 }), { openByDefault: true }).text('kpi-details')!;
      expect(some).toContain('admin.dashboard.pending');
      expect(some).toContain('admin.dashboard.expiredOne');
      expect(render(kpis({ expiredCount: 3 }), { openByDefault: true }).text('kpi-details')).toContain('admin.dashboard.expired ');
    });

    it('les arrivées par source ne s\'affichent que s\'il y en a, une source connue par sa clé, une inconnue telle quelle', () => {
      expect(render(kpis({ arrivals: [] }), { openByDefault: true }).byTestId('kpi-arrivals')).toBeNull();

      const arrivals = render(kpis({ arrivals: [{ source: 'direct', count: 12 }, { source: 'blog-inconnu', count: 3 }] }), { openByDefault: true }).text('kpi-arrivals')!;
      expect(arrivals).toContain('12');
      expect(arrivals).toContain('admin.sources.direct');
      expect(arrivals).toContain('blog-inconnu');
      expect(arrivals).toContain('·');
    });

    it('habitués et nouveaux parmi ceux qui ont fini : les habitués sont les autres que les premières parties', () => {
      const loyalty = render(kpis({ completedCount: 40, firstTimeFinishersCount: 6 }), { openByDefault: true }).text('kpi-loyalty')!;

      expect(loyalty).toContain('34');
      expect(loyalty).toContain('6');
      expect(loyalty).toContain('admin.dashboard.newcomers');
    });

    it('un seul nouveau se dit au singulier, et personne n\'ayant fini : pas de ligne', () => {
      const one = render(kpis({ firstTimeFinishersCount: 1 }), { openByDefault: true }).text('kpi-loyalty')!;
      expect(one).toMatch(/admin.dashboard.newcomer(?!s)/);
      expect(one).not.toContain('admin.dashboard.newcomers');
      expect(render(kpis({ completedCount: 0, firstTimeFinishersCount: 0 }), { openByDefault: true }).byTestId('kpi-loyalty')).toBeNull();
    });
  });

  describe('recalcul des stats d\'un jour figé', () => {
    it('absent tant que le jour n\'est pas figé en base (la veille, le jour même)', () => {
      expect(render(kpis(), { openByDefault: true, canRecompute: false }).byTestId('kpi-frozen')).toBeNull();
    });

    it('un jour figé montre la date du calcul, ou « figé » quand elle n\'est pas connue', () => {
      const known = render(kpis(), { openByDefault: true, canRecompute: true, computedAt: '2026-11-22T01:05:00Z' }).text('kpi-frozen')!;
      expect(known).toContain('admin.dashboard.frozenAt');

      const unknown = render(kpis(), { openByDefault: true, canRecompute: true, computedAt: null }).text('kpi-frozen')!;
      expect(unknown).toContain('admin.dashboard.frozen');
      expect(unknown).not.toContain('admin.dashboard.frozenAt');
    });

    it('le lien demande d\'abord une confirmation, sans rien lancer', () => {
      const { byTestId, click, recompute } = render(kpis(), { openByDefault: true, canRecompute: true });

      expect(byTestId('recompute-confirm')).toBeNull();
      click('recompute-link');
      expect(byTestId('recompute-confirm')).not.toBeNull();
      expect(byTestId('recompute-link')!.hasAttribute('disabled')).toBe(true);
      expect(recompute).not.toHaveBeenCalled();
    });

    it('« Oui » lance le recalcul une fois et referme la confirmation', () => {
      const { byTestId, click, recompute } = render(kpis(), { openByDefault: true, canRecompute: true });

      click('recompute-link');
      click('recompute-yes');

      expect(recompute).toHaveBeenCalledTimes(1);
      expect(byTestId('recompute-confirm')).toBeNull();
    });

    it('« Non » referme la confirmation sans rien lancer', () => {
      const { byTestId, click, recompute } = render(kpis(), { openByDefault: true, canRecompute: true });

      click('recompute-link');
      click('recompute-no');

      expect(recompute).not.toHaveBeenCalled();
      expect(byTestId('recompute-confirm')).toBeNull();
      expect(byTestId('recompute-link')!.hasAttribute('disabled')).toBe(false);
    });

    it('pendant le recalcul, le lien est grisé et change de libellé', () => {
      const link = render(kpis(), { openByDefault: true, canRecompute: true, recomputing: true }).byTestId('recompute-link')!;

      expect(link.hasAttribute('disabled')).toBe(true);
      expect(link.textContent).toContain('admin.challenges.recomputing');
    });

    it('l\'erreur du dernier recalcul s\'affiche, dans une alerte', () => {
      const { element } = render(kpis(), { openByDefault: true, canRecompute: true, recomputeErrorKey: 'errors.admin.day_not_over' });

      expect(element.querySelector('[role="alert"]')?.textContent).toContain('errors.admin.day_not_over');
    });

    it('changer de jour referme une confirmation restée ouverte', () => {
      const { fixture, byTestId, click } = render(kpis({ day: '2026-11-20' }), { openByDefault: true, canRecompute: true });
      click('recompute-link');
      expect(byTestId('recompute-confirm')).not.toBeNull();

      fixture.componentRef.setInput('kpis', kpis({ day: '2026-11-19' }));
      fixture.detectChanges();

      expect(byTestId('recompute-confirm')).toBeNull();
    });
  });
});
