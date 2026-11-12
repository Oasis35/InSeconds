import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { PreviewTrackData } from '../../../core/audio-preview/preview-track.dialog';
import { ModalService } from '../../../ui/modal/modal.service';
import { RunsApi } from '../../data-access/runs.api';
import { SESSION, TRACK } from '../../data-access/testing/fake-runs-api';
import { RunSession } from '../../domain/run';
import { RunHistoryDetailPage } from './run-history-detail.page';

const FINISHED = SESSION({
  status: 'won',
  playedTracks: [
    TRACK({ position: 1, round: 1, title: 'Un' }),
    TRACK({ position: 2, round: 1, title: 'Deux', titleCorrect: false }),
    TRACK({ position: 3, round: 1, neutralized: true, artist: null, title: null, artistCorrect: false, titleCorrect: false }),
    TRACK({ position: 6, round: 2, title: 'Six', artistCorrect: false, titleCorrect: false }),
  ],
});

describe('RunHistoryDetailPage', () => {
  let open: ReturnType<typeof vi.fn>;
  let pastPreviewUrl: ReturnType<typeof vi.fn>;
  let session: ReturnType<typeof vi.fn>;

  async function render(id = '7', result: () => Promise<RunSession> = async () => FINISHED) {
    open = vi.fn();
    session = vi.fn(result);
    pastPreviewUrl = vi.fn(async () => 'https://preview/x.mp3');
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]),
        { provide: RunsApi, useValue: { session, pastPreviewUrl } },
        { provide: ModalService, useValue: { open } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    });
    const fixture = TestBed.createComponent(RunHistoryDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('range les morceaux par manche et compte les ratés (un morceau retiré ne l’est pas)', async () => {
    const { el } = await render();

    expect(session).toHaveBeenCalledWith(7);
    expect(el.querySelectorAll('[data-testid="detail-round"]')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="detail-track"]')).toHaveLength(4);
    expect(el.querySelectorAll('[data-testid="detail-track"][data-missed="true"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="detail-missed"]')?.textContent).toContain('ui.history.setlist.missed');
    // Le morceau retiré n'a ni verdict ni écoute.
    expect(el.querySelectorAll('[data-testid="detail-listen"]')).toHaveLength(3);
  });

  it('« Ratés » ne garde que les morceaux ratés', async () => {
    const { el, fixture } = await render();

    (el.querySelector('[data-testid="detail-missed"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="detail-track"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="detail-missed"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('▶ ouvre la fenêtre d’écoute avec une adresse demandée à ce moment-là', async () => {
    const { el } = await render();

    (el.querySelectorAll('[data-testid="detail-listen"]')[1] as HTMLButtonElement).click();

    const data = (open.mock.calls[0][1] as { data: PreviewTrackData }).data;
    expect(data.title).toBe('Deux');
    expect(pastPreviewUrl).not.toHaveBeenCalled();
    await data.loadPreviewUrl!();
    expect(pastPreviewUrl).toHaveBeenCalledWith(7, 2);
  });

  it('une partie en cours, inconnue ou mal désignée est introuvable', async () => {
    expect((await render('7', async () => SESSION({ status: 'pending' }))).el.querySelector('[data-testid="detail-not-found"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect((await render('7', () => Promise.reject({ status: 404 }))).el.querySelector('[data-testid="detail-not-found"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect((await render('abc')).el.querySelector('[data-testid="detail-not-found"]')).not.toBeNull();
    expect(session).not.toHaveBeenCalled();
  });

  it('une panne propose de réessayer', async () => {
    const { el, fixture } = await render('7', () => Promise.reject({ status: 500 }));

    session.mockResolvedValue(FINISHED);
    (el.querySelector('[data-testid="run-retry"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="detail-track"]')).toHaveLength(4);
  });
});
