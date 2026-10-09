import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { SessionStore } from '../../core/session/session.store';
import { ModalService } from '../../ui/modal/modal.service';
import { AdminCounts } from '../data-access/admin-counts';
import { problem } from '../data-access/testing/fake-catalogue-api';
import {
  FakeChallengesApi, challengePlayer, challengeStats, challengeTrack, fakeChallengesApi, historyEntry, provideChallengesApiFake,
} from '../data-access/testing/fake-challenges-api';
import { ChallengeStats } from '../domain/challenge';
import { ChallengesPage } from './challenges.page';
import { TrackChartDialog } from './track-chart.dialog';

describe('ChallengesPage', () => {
  const MINE = 'abcdef12-3456-7890-abcd-ef1234567890';
  const OTHER = '99999999-0000-0000-0000-000000000000';

  const today = challengeStats({
    id: 5, date: '2026-10-05', playerCount: 2, abandonedCount: 1, scoreMedian: 1500, scoreMin: 1000, scoreMax: 2000, scoreAvg: 1500,
    players: [challengePlayer({ playerId: MINE }), challengePlayer({ playerId: OTHER, status: 'Abandoned', pseudo: 'Alice' })],
    tracks: [challengeTrack({ position: 1, artist: 'Eminem', title: 'Lose Yourself' })],
  });
  const older = challengeStats({ id: 4, date: '2026-10-04', canRecompute: true, computedAt: '2026-10-05T00:05:00Z', players: [challengePlayer({ playerId: MINE })] });
  const september = challengeStats({ id: 3, date: '2026-09-30' });

  let api: FakeChallengesApi;
  let modal: { open: ReturnType<typeof vi.fn> };
  let copy: ReturnType<typeof vi.fn>;

  async function render(overrides: Partial<FakeChallengesApi> = {}, stats: ChallengeStats[] = [today, older, september]) {
    api = fakeChallengesApi({
      loadStats: vi.fn(async () => stats),
      listHistory: vi.fn(async () => [
        historyEntry({ id: 5, date: '2026-10-05' }), historyEntry({ id: 4, date: '2026-10-04' }), historyEntry({ id: 3, date: '2026-09-30' }),
      ]),
      ...overrides,
    });
    modal = { open: vi.fn() };
    copy = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideChallengesApiFake(api),
        { provide: ModalService, useValue: modal },
        { provide: ClipboardService, useValue: { copy } },
      ],
    });
    TestBed.inject(SessionStore).signedIn({ id: MINE, pseudo: null, email: null, isGuest: true, isAdmin: true });
    const fixture = TestBed.createComponent(ChallengesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const row = (date: string) =>
      Array.from(element.querySelectorAll('div.py-3')).find(d => d.textContent?.includes(date)) as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      fixture.detectChanges();
    };
    return { fixture, element, row, settle };
  }

  it('lit les deux listes à l\'ouverture de la page', async () => {
    await render();

    expect(api.loadStats).toHaveBeenCalledTimes(1);
    expect(api.listHistory).toHaveBeenCalledTimes(1);
  });

  it('annonce le nombre de défis des stats pour la barre des onglets', async () => {
    await render();

    expect(TestBed.inject(AdminCounts).challenges()).toBe(3);
  });

  it('affiche le mois, les défis du mois et une ligne d\'historique par défi du mois', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="challenge-month"]')?.textContent).toContain('Octobre 2026');
    expect(element.textContent).toContain('2026-10-05');
    expect(element.textContent).toContain('2026-10-04');
    expect(element.textContent).not.toContain('2026-09-30');
    expect(element.querySelectorAll('ul > li > p.font-mono')).toHaveLength(2);
  });

  it('change de mois avec ‹ ›', async () => {
    const { element, settle } = await render();

    element.querySelector<HTMLButtonElement>('button[aria-label="admin.challenges.previousMonth"]')!.click();
    await settle();

    expect(element.querySelector('[data-testid="challenge-month"]')?.textContent).toContain('Septembre 2026');
    expect(element.textContent).toContain('2026-09-30');
    expect(element.textContent).not.toContain('2026-10-05');
  });

  it('dit qu\'il n\'y a aucun défi', async () => {
    const { element } = await render({ listHistory: vi.fn(async () => []) }, []);

    expect(element.textContent).toContain('admin.dashboard.noChallenge');
    expect(element.textContent).toContain('admin.challenges.noChallenge');
    expect(element.querySelector('[data-testid="challenge-month"]')).toBeNull();
  });

  it('affiche l\'erreur de chargement avec son code', async () => {
    const { element } = await render({ loadStats: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) });

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('errors.common.unexpected');
    expect(element.querySelector('[data-testid="error-code"]')?.textContent).toContain('0123456789abcdef');
  });

  describe('chips joueur', () => {
    it('met « toi » et l\'identifiant court sur le joueur du navigateur, le pseudo sur un compte', async () => {
      const { row } = await render();

      const chips = Array.from(row('2026-10-05').querySelectorAll('button')).slice(1);
      expect(chips[0].textContent).toContain('abcdef12');
      expect(chips[0].textContent).toContain('admin.dashboard.you');
      expect(chips[1].textContent).toContain('Alice');
    });

    it('clic gauche : entoure le même joueur sur tous les défis ; second clic : le lâche', async () => {
      const { row, settle } = await render();
      const mineIn = (date: string) => Array.from(row(date).querySelectorAll('button')).find(b => b.textContent?.includes('abcdef12'))!;

      mineIn('2026-10-05').click();
      await settle();
      expect(mineIn('2026-10-05').style.boxShadow).not.toBe('');
      expect(mineIn('2026-10-04').style.boxShadow).not.toBe('');

      mineIn('2026-10-05').click();
      await settle();
      expect(mineIn('2026-10-04').style.boxShadow).toBe('');
    });

    it('clic droit : copie l\'identifiant complet sans menu, et affiche « Copié ! » dans la ligne du défi', async () => {
      const { row, settle } = await render();
      const chip = Array.from(row('2026-10-05').querySelectorAll('button')).find(b => b.textContent?.includes('abcdef12'))!;
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

      chip.dispatchEvent(event);
      await settle();

      expect(event.defaultPrevented).toBe(true);
      expect(copy).toHaveBeenCalledWith(MINE);
      expect(row('2026-10-05').textContent).toContain('admin.dashboard.copied');
    });
  });

  describe('accordéon', () => {
    it('le premier bouton de la ligne déplie les stats du défi et les taux de ses morceaux', async () => {
      const { row, settle } = await render();
      expect(row('2026-10-05').textContent).not.toContain('Lose Yourself');

      row('2026-10-05').querySelector('button')!.click();
      await settle();

      expect(row('2026-10-05').textContent).toContain('1. Eminem — Lose Yourself');
      expect(row('2026-10-05').textContent).toContain('75%');
    });

    it('l\'icône d\'un morceau ouvre la pop-up de la répartition des temps', async () => {
      const { row, settle } = await render();
      row('2026-10-05').querySelector('button')!.click();
      await settle();

      row('2026-10-05').querySelector<HTMLButtonElement>('button[aria-label="admin.challenges.showChart"]')!.click();

      expect(modal.open).toHaveBeenCalledWith(TrackChartDialog, expect.objectContaining({ data: { track: today.tracks[0] } }));
    });
  });

  describe('recalcul des stats', () => {
    const expand = async (ctx: Awaited<ReturnType<typeof render>>, date: string) => {
      ctx.row(date).querySelector('button')!.click();
      await ctx.settle();
    };
    const recomputeButton = (row: HTMLElement) =>
      Array.from(row.querySelectorAll('button')).find(b => b.textContent?.includes('admin.challenges.recompute'));

    it('montre la date de calcul et le bouton sur un défi figé qui peut être recalculé, pas sur les autres', async () => {
      const ctx = await render();
      await expand(ctx, '2026-10-04');
      await expand(ctx, '2026-10-05');

      expect(ctx.row('2026-10-04').querySelector('[data-testid="challenge-computed-at"]')).not.toBeNull();
      expect(recomputeButton(ctx.row('2026-10-04'))).toBeDefined();
      expect(recomputeButton(ctx.row('2026-10-05'))).toBeUndefined();
    });

    it('recalcule le jour et remplace le défi par la réponse', async () => {
      const recomputed = { ...older, canRecompute: false, computedAt: '2026-10-09T10:00:00Z', playerCount: 9 };
      const ctx = await render({ recompute: vi.fn(async () => recomputed) });
      await expand(ctx, '2026-10-04');

      recomputeButton(ctx.row('2026-10-04'))!.click();
      await ctx.settle();

      expect(api.recompute).toHaveBeenCalledWith('2026-10-04');
      expect(ctx.row('2026-10-04').textContent).toContain('9');
      expect(recomputeButton(ctx.row('2026-10-04'))).toBeUndefined();
    });

    it('affiche « en cours » pendant le recalcul', async () => {
      const ctx = await render({ recompute: vi.fn(() => new Promise<ChallengeStats>(() => undefined)) });
      await expand(ctx, '2026-10-04');

      recomputeButton(ctx.row('2026-10-04'))!.click();
      await ctx.settle();

      expect(ctx.row('2026-10-04').textContent).toContain('admin.challenges.recomputing');
      expect(ctx.row('2026-10-04').querySelector<HTMLButtonElement>('button:disabled')).not.toBeNull();
    });

    it('explique que le jour n\'est pas fini', async () => {
      const ctx = await render({ recompute: vi.fn(async () => Promise.reject(problem(409, 'admin.day_not_over'))) });
      await expand(ctx, '2026-10-04');

      recomputeButton(ctx.row('2026-10-04'))!.click();
      await ctx.settle();

      expect(ctx.row('2026-10-04').querySelector('[role="alert"]')?.textContent).toContain('admin.challenges.recomputeNotOver');
    });
  });
});
