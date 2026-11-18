import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import fr from '../../../../../public/i18n/fr.json';
import { SessionLoader } from '../../../account/data-access/session-loader';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { VersionService } from '../../../core/version/version.service';
import { FakeAudioPort, provideFakeAudio } from '../../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../../gameplay/data-access/testing/fake-waveform.port';
import { ConfirmDialogData } from '../../../ui/modal/confirm-dialog.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { RunGameStore } from '../../data-access/run-game.store';
import { PendingInvite } from '../../../social/data-access/pending-invite';
import { FakeSocialApi, provideFakeSocialApi } from '../../../social/data-access/testing/fake-social-api';
import { RunShare } from '../../data-access/run-share';
import { FakeRunsApi, ME, provideFakeRunsApi } from '../../data-access/testing/fake-runs-api';
import { RunFinish } from '../../domain/run';
import { RunShareSheetComponent } from '../share-sheet/run-share-sheet.component';
import { RunsPage } from './runs.page';

/** La page sans ses écrans (testés à part) : ce qui est propre au navigateur, la sortie de partie et le renvoi sans accès. */
describe('RunsPage', () => {
  let api: FakeRunsApi;
  let sheet: { component: unknown; data: ConfirmDialogData; closed: Subject<boolean | undefined>; close: (result: boolean) => void } | null;
  let navigate: ReturnType<typeof vi.spyOn>;

  function create(query: Record<string, string> = {}) {
    api = new FakeRunsApi();
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
        provideTranslateService(), provideRouter([]), provideFakeRunsApi(api), provideFakeAudio(new FakeAudioPort()), provideFakeWaveform(new FakeWaveformPort()),
        provideFakeSocialApi(new FakeSocialApi()),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap(query) } } },
        { provide: ModalService, useValue: modal },
        { provide: SessionLoader, useValue: { ensureGuest: () => Promise.resolve() } },
        { provide: VersionService, useValue: { allowReload: () => undefined } },
      ],
    });
    TestBed.overrideComponent(RunsPage, { set: { template: '' } });
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
    expect(link()).toBe(`/history/setlist/${store.session()?.sessionId}`);
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

    it('sous la V4, ouvre la feuille à trois choix', () => {
      const { page } = create();
      TestBed.inject(ShellChromeStore).setV4(true);

      shareFinish(page);

      expect(sheet?.component).toBe(RunShareSheetComponent);
      expect((sheet?.data as unknown as { finish: RunFinish }).finish).toBe(finish);
    });

    it('sans la V4, partage le score sans feuille', () => {
      const { fixture, page } = create();
      TestBed.inject(ShellChromeStore).setV4(false);
      const shareScore = vi.spyOn(fixture.debugElement.injector.get(RunShare), 'shareScore').mockResolvedValue();

      shareFinish(page);

      expect(sheet).toBeNull();
      expect(shareScore).toHaveBeenCalledWith(finish, expect.any(String), null);
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
});
