import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import fr from '../../../../../public/i18n/fr.json';
import { SessionLoader } from '../../../account/data-access/session-loader';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { VersionService } from '../../../core/version/version.service';
import { AnswerSearchPort } from '../../../gameplay/data-access/answer-search.port';
import { FakeAudioPort, provideFakeAudio } from '../../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../../gameplay/data-access/testing/fake-waveform.port';
import { ConfirmDialogData } from '../../../ui/modal/confirm-dialog.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { RunGameStore } from '../../data-access/run-game.store';
import { PendingInvite } from '../../../social/data-access/pending-invite';
import { FakeSocialApi, provideFakeSocialApi } from '../../../social/data-access/testing/fake-social-api';
import { RunShare } from '../../data-access/run-share';
import { CURRENT, FakeRunsApi, ME, PLAY, ROUND, SESSION, TRACK, provideFakeRunsApi } from '../../data-access/testing/fake-runs-api';
import { TrackRoundStore } from '../../../gameplay/data-access/track-round.store';
import { RunFinish } from '../../domain/run';
import { RunShareSheetComponent } from '../share-sheet/run-share-sheet.component';
import { RunsPage } from './runs.page';

/**
 * La page sans ses écrans (testés à part) : ce qui est propre au navigateur, la sortie de partie et le renvoi sans accès. Le dernier bloc, lui, monte le
 * vrai gabarit : c'est le seul endroit qui vérifie que la page branche le store sur les écrans.
 */
describe('RunsPage', () => {
  let api: FakeRunsApi;
  let sheet: { component: unknown; data: ConfirmDialogData; closed: Subject<boolean | undefined>; close: (result: boolean) => void } | null;
  let navigate: ReturnType<typeof vi.spyOn>;
  let audio: FakeAudioPort;

  function create(query: Record<string, string> = {}, withTemplate = false) {
    api = new FakeRunsApi();
    audio = new FakeAudioPort();
    sheet = null;
    const modal = {
      openSheet: (component: unknown, options: { data: ConfirmDialogData }) => {
        const closed = new Subject<boolean | undefined>();
        sheet = { component, data: options.data, closed, close: result => closed.next(result) };
        return { closed, close: (result: boolean) => closed.next(result) };
      },
      confirm: () => Promise.resolve(false),
    };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), provideFakeRunsApi(api), provideFakeAudio(audio), provideFakeWaveform(new FakeWaveformPort()),
        provideFakeSocialApi(new FakeSocialApi()), { provide: AnswerSearchPort, useValue: { search: () => Promise.resolve([]) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap(query) } } },
        { provide: ModalService, useValue: modal },
        { provide: SessionLoader, useValue: { ensureGuest: () => Promise.resolve() } },
        { provide: VersionService, useValue: { allowReload: () => undefined } },
      ],
    });
    if (!withTemplate) TestBed.overrideComponent(RunsPage, { set: { template: '' } });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RunsPage);
    const store = fixture.debugElement.injector.get(RunGameStore);
    return { fixture, page: fixture.componentInstance, store };
  }

  async function playing() {
    const created = create();
    await created.store.init();
    await created.store.begin();
    expect(created.store.screen()).toBe('playing');
    return created;
  }

  describe("l'écran de départ", () => {
    it("n'ouvre aucune partie avant le clic sur « Commencer » (ni requête de lancement, ni son)", async () => {
      const { store } = create();

      await store.init();

      expect(store.screen()).toBe('welcome');
      expect(api.calls.some(call => call.startsWith('launch'))).toBe(false);
    });

    it("arrivée par « Jouer » de l'accueil (?go=1) : la partie démarre seule et le paramètre est retiré", async () => {
      const { fixture, store } = create({ go: '1' });
      const navigateTo = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      fixture.detectChanges();

      await vi.waitFor(() => expect(store.screen()).toBe('playing'));
      expect(navigateTo).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { go: null }, replaceUrl: true }));
    });

    it("sans ?go=1, rien ne démarre seul", async () => {
      const { fixture, store } = create();

      fixture.detectChanges();
      await vi.waitFor(() => expect(store.screen()).toBe('welcome'));

      expect(api.calls.some(call => call.startsWith('launch'))).toBe(false);
    });
  });

  describe('quitter la page en pleine manche', () => {
    it("« Quitter quand même » est la confirmation, « Continuer à jouer » l'annulation (comme au Daily)", async () => {
      const { page } = await playing();

      void page.canLeave();

      expect(sheet?.data.confirmLabel).toBe('Quitter quand même');
      expect(sheet?.data.cancelLabel).toBe('Continuer à jouer');
    });

    it('« Continuer à jouer » garde le joueur sur la page', async () => {
      const { page } = await playing();

      const leaving = page.canLeave() as Promise<boolean>;
      sheet!.close(false);

      expect(await leaving).toBe(false);
    });

    it('« Quitter quand même » laisse partir', async () => {
      const { page } = await playing();

      const leaving = page.canLeave() as Promise<boolean>;
      sheet!.close(true);

      expect(await leaving).toBe(true);
    });

    it("hors d'une manche, on part sans fenêtre", async () => {
      const { page, store } = create();
      await store.init();

      expect(page.canLeave()).toBe(true);
      expect(sheet).toBeNull();
    });
  });

  it('en manche, la barre du bas disparaît ; elle revient quand on quitte la page', async () => {
    const { fixture, store } = create();
    const chrome = TestBed.inject(ShellChromeStore);
    await store.init();
    TestBed.tick();
    expect(chrome.immersive()).toBe(false);

    await store.begin();
    TestBed.tick();
    expect(chrome.immersive()).toBe(true);

    fixture.destroy();
    expect(chrome.immersive()).toBe(false);
  });

  it('« Revoir » de la fin de run mène à la partie dans l\'historique ; rien sans partie', async () => {
    const { page, store } = create();
    const link = (page as unknown as { reviewLink: () => string | null }).reviewLink;
    await store.init();
    expect(link()).toBeNull();

    await store.begin();
    expect(link()).toBe(`/history/survie/${store.session()?.sessionId}`);
  });

  it('sans accès sur invitation, renvoie au jeu du jour sans écran', async () => {
    const { fixture } = create();
    api.meResult = ME({ hasAccess: false });

    fixture.detectChanges(); // ngOnInit : la page lit l'accès
    await fixture.whenStable();
    TestBed.tick();

    expect(navigate).toHaveBeenCalledWith('/daily', { replaceUrl: true });
  });

  it('avec accès, reste sur le mode', async () => {
    const { fixture } = create();

    fixture.detectChanges(); // ngOnInit : la page lit l'accès
    await fixture.whenStable();
    TestBed.tick();

    expect(navigate).not.toHaveBeenCalled();
  });

  describe('« Défier un ami » à la fin d\'une partie', () => {
    const finish = { challengeCode: 'K7Q2M9' } as RunFinish;
    const shareFinish = (page: RunsPage) => (page as unknown as { shareFinish: (finish: RunFinish) => void }).shareFinish(finish);

    it('ouvre la feuille à trois choix', () => {
      const { page } = create();

      shareFinish(page);

      expect(sheet?.component).toBe(RunShareSheetComponent);
      expect((sheet?.data as unknown as { finish: RunFinish }).finish).toBe(finish);
    });

  });

  it('un lien de playlist qui invite dans un groupe garde l\'invitation pour la fin de la partie', async () => {
    const { fixture } = create({ group: 'ABCD2345' });
    const invite = TestBed.inject(PendingInvite);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(invite.get()).toBe('ABCD2345');
    invite.clear();
  });

  describe('le gabarit de la page, câblé au store', () => {
    afterEach(() => vi.useRealTimers());

    /** La page se lance seule (son `ngOnInit` lit l'accueil du mode) : on attend l'écran qu'elle atteint. */
    async function open(screen: 'welcome' | 'resume', configure: (api: FakeRunsApi) => void = () => undefined) {
      const created = create({}, true);
      configure(api);
      created.fixture.detectChanges();
      await vi.waitFor(() => expect(created.store.screen()).toBe(screen));
      return { ...created, element: created.fixture.nativeElement as HTMLElement };
    }

    /** « Commencer », puis le lecteur annonce l'extrait prêt : la manche rend sa saisie. */
    async function startPlaying(opened: Awaited<ReturnType<typeof open>>) {
      await opened.store.begin();
      audio.emit('ready');
      TestBed.tick();
      opened.fixture.detectChanges();
      return { ...opened, round: opened.fixture.debugElement.injector.get(TrackRoundStore) };
    }

    const withThemes = (themes: { round: number; name: string }[]) => (api: FakeRunsApi) => {
      api.launchResult = { kind: 'ok', play: PLAY({ session: SESSION({ themes }) }) };
    };

    it('un morceau retiré montre sa carte à la place du champ de réponse, puis le suivant rend le champ', async () => {
      const { fixture, store, round, element } = await startPlaying(await open('welcome'));
      const withdrawnTrack = TRACK({ position: 2, neutralized: true, points: 0, artist: null, title: null });
      api.answerResult = PLAY({
        session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK(), withdrawnTrack], playedTracks: [TRACK(), withdrawnTrack] }),
        revealed: TRACK(), neutralized: [{ position: 2, round: 1 }], current: CURRENT({ position: 3, positionInRound: 3, previewUrl: 'https://cdn/preview-3.mp3' }),
      });
      expect(element.querySelector('app-run-withdrawn-card')).toBeNull();
      expect(element.querySelector('input')).not.toBeNull();

      await store.submit(round.submit({ artist: 'Daft Punk', title: 'One More Time' })!);
      store.next();
      fixture.detectChanges();

      expect(element.querySelector('app-run-withdrawn-card')).not.toBeNull();
      expect(element.querySelector('input')).toBeNull();

      store.next();
      fixture.detectChanges();

      expect(element.querySelector('app-run-withdrawn-card')).toBeNull();
    });

    it('le thème de la manche en cours est dit dans une pastille ; celui d\'une autre manche, non', async () => {
      const withTheme = await startPlaying(await open('welcome', withThemes([{ round: 1, name: 'Rap français' }])));
      expect(withTheme.element.querySelector('[data-testid="run-theme-pill"]')?.textContent?.trim()).toBe('Rap français');
    });

    it('sans thème pour la manche en cours, pas de pastille', async () => {
      const without = await startPlaying(await open('welcome', withThemes([{ round: 2, name: 'Rap français' }])));
      expect(without.element.querySelector('[data-testid="run-theme-pill"]')).toBeNull();
    });

    it('le chrono à zéro envoie ce qui est tapé, sans demander de confirmation', async () => {
      vi.useFakeTimers();
      const { fixture, store, element } = await startPlaying(await open('welcome'));
      audio.emit('playing');
      TestBed.tick();
      const input = element.querySelector<HTMLInputElement>('input')!;
      input.value = 'Daft Punk - One More Time';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      vi.advanceTimersByTime(46_000);
      TestBed.tick();
      fixture.detectChanges();
      await vi.waitFor(() => expect(api.calls.some(call => call.startsWith('submitAnswer'))).toBe(true));

      expect(store.timeUp()).toBe(true);
    });

    it('la reprise : « Reprendre » relance la partie en cours depuis l\'accueil du mode', async () => {
      const opened = await open('resume', mode => { mode.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } }); });

      opened.element.querySelector<HTMLButtonElement>('app-resume-screen button')!.click();
      await vi.waitFor(() => expect(opened.store.screen()).toBe('playing'));

      expect(api.calls).toEqual(expect.arrayContaining(['session:7', 'join:ABC234']));
    });
  });
});
