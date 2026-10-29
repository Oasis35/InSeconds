import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import fr from '../../../../../public/i18n/fr.json';
import { SessionLoader } from '../../../account/data-access/session-loader';
import { VersionService } from '../../../core/version/version.service';
import { FakeAudioPort, provideFakeAudio } from '../../../gameplay/data-access/testing/fake-audio.port';
import { ConfirmDialogData } from '../../../ui/modal/confirm-dialog.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { RunGameStore } from '../../data-access/run-game.store';
import { FakeRunsApi, ME, provideFakeRunsApi } from '../../data-access/testing/fake-runs-api';
import { RunsPage } from './runs.page';

/** La page sans ses écrans (testés à part) : ce qui est propre au navigateur, la sortie de partie et le renvoi sans accès. */
describe('RunsPage', () => {
  let api: FakeRunsApi;
  let sheet: { data: ConfirmDialogData; closed: Subject<boolean | undefined>; close: (result: boolean) => void } | null;
  let navigate: ReturnType<typeof vi.spyOn>;

  function create() {
    api = new FakeRunsApi();
    sheet = null;
    const modal = {
      openSheet: (_component: unknown, options: { data: ConfirmDialogData }) => {
        const closed = new Subject<boolean | undefined>();
        sheet = { data: options.data, closed, close: result => closed.next(result) };
        return { closed, close: (result: boolean) => closed.next(result) };
      },
      confirm: () => Promise.resolve(false),
    };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), provideFakeRunsApi(api), provideFakeAudio(new FakeAudioPort()),
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
});
