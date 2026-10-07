import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AnswerSearchPort } from '../data-access/answer-search.port';
import { SEARCH_DEBOUNCE_MS } from '../data-access/answer-search.store';
import { FakeAudioPort, provideFakeAudio } from '../data-access/testing/fake-audio.port';
import { TrackRoundStore } from '../data-access/track-round.store';
import { AnswerSuggestion } from '../domain/answer';
import { RoundResult } from '../domain/round-result';
import { RoundConfig, RoundSubmission } from '../domain/track-round';
import { TrackRoundComponent } from './track-round.component';

const CONFIG: RoundConfig = {
  trackId: 7,
  previewUrl: 'https://cdn.example/extrait.mp3',
  listen: { steps: [0.5, 1, 2, 5, 10], extendable: true },
  hints: { unlockSeconds: [5, 10] },
};

const RESULT: RoundResult = {
  artistCorrect: true, titleCorrect: true, correctArtist: 'Daft Punk', correctTitle: 'Get Lucky', coverUrl: null,
  listenedSeconds: 0.5, distribution: [{ durationSeconds: 0.5, count: 4 }], notFoundCount: 1,
};

const DAFT: AnswerSuggestion = { artist: 'Daft Punk', title: 'Get Lucky' };
const MUSE: AnswerSuggestion = { artist: 'Muse', title: 'Uprising' };

@Component({
  imports: [TrackRoundComponent],
  template: `
    <app-track-round [result]="result()" [hintPending]="hintPending()" (answered)="answered.push($event)" (hintRequested)="hints.push($event)">
      <button roundActions type="button">Bonus</button>
      <span roundScore>+850 pts</span>
      <button roundNext type="button">Piste suivante</button>
    </app-track-round>`,
})
class Host {
  readonly result = signal<RoundResult | null>(null);
  readonly hintPending = signal(false);
  readonly answered: RoundSubmission[] = [];
  readonly hints: number[] = [];
}

describe('TrackRoundComponent', () => {
  let audio: FakeAudioPort;
  let store: InstanceType<typeof TrackRoundStore>;
  let fixture: ComponentFixture<Host>;
  let element: HTMLElement;
  let search: ReturnType<typeof vi.fn<(query: string) => Promise<AnswerSuggestion[]>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    audio = new FakeAudioPort();
    search = vi.fn(() => Promise.resolve([DAFT, MUSE]));
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideFakeAudio(audio), TrackRoundStore, { provide: AnswerSearchPort, useValue: { search } }],
    });
    store = TestBed.inject(TrackRoundStore);
    fixture = TestBed.createComponent(Host);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  const refresh = () => {
    TestBed.tick();
    fixture.detectChanges();
  };
  const emit = (state: Parameters<FakeAudioPort['emit']>[0], position?: number) => {
    audio.emit(state, position);
    refresh();
  };
  const start = (config: Partial<RoundConfig> = {}) => {
    store.start({ ...CONFIG, ...config });
    refresh();
  };
  const input = () => element.querySelector<HTMLInputElement>('input')!;
  const button = (text: string) => Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes(text) || b.title.includes(text));
  const type = (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    refresh();
  };
  const submitForm = () => {
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    refresh();
  };
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
    input().dispatchEvent(event);
    refresh();
    return event;
  };
  async function showSuggestions(query = 'daft') {
    type(query);
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    refresh();
  }

  it('n\'affiche rien tant qu\'aucune manche n\'a démarré', () => {
    expect(element.querySelector('app-round-player')).toBeNull();
    expect(element.querySelector('form')).toBeNull();
  });

  describe('écoute et saisie', () => {
    it('le lecteur et la saisie sont là dès le chargement du son', () => {
      start();
      expect(element.querySelector('app-round-player')).not.toBeNull();
      expect(input()).not.toBeNull();
      expect(element.querySelector('[data-testid="round-timer"]')?.textContent?.trim()).toBe('…');
    });

    it('« ↺ » et « ▶ » pilotent le lecteur', () => {
      start();
      emit('playing', 0.2);
      button('▶ 1s')!.click();
      refresh();
      expect(audio.calls.at(-1)).toBe('playUntil 1');

      emit('finished', 1);
      button('gameplay.round.replay')!.click();
      expect(audio.calls.at(-1)).toBe('replay 1');
    });

    it('un échec de lecture masque la saisie ; « Réessayer » repart (piège 33)', () => {
      start();
      emit('error');
      expect(element.querySelector('form')).toBeNull();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('gameplay.round.playbackError');

      button('gameplay.round.retry')!.click();
      refresh();

      expect(audio.calls.filter(call => call.startsWith('load'))).toHaveLength(2);
      expect(element.querySelector('form')).not.toBeNull();
    });

    it('« Passer » après un échec envoie une réponse vide sans confirmation', () => {
      start();
      emit('error');
      button('gameplay.round.skip')!.click();
      expect(fixture.componentInstance.answered).toEqual([
        { trackId: 7, listenedSeconds: 0.5, wasExtended: false, artist: null, title: null },
      ]);
    });

    it('un morceau sans extrait : message et « Passer » directement', () => {
      start({ previewUrl: null });
      expect(element.textContent).toContain('gameplay.round.noPreview');
      expect(element.querySelector('form')).toBeNull();
      button('gameplay.round.skip')!.click();
      expect(fixture.componentInstance.answered).toHaveLength(1);
    });
  });

  describe('réponse', () => {
    beforeEach(() => {
      start();
      emit('finished', 0.5);
    });

    it('valider envoie le palier, la prolongation et la saisie libre coupée au premier « - »', () => {
      type('Daft Punk - Get Lucky');
      submitForm();

      expect(fixture.componentInstance.answered).toEqual([
        { trackId: 7, listenedSeconds: 0.5, wasExtended: false, artist: 'Daft Punk', title: 'Get Lucky' },
      ]);
      expect(button('…')?.disabled).toBe(true);
    });

    it('une proposition choisie donne la réponse exacte', async () => {
      await showSuggestions('daf');
      element.querySelectorAll('li')[1].dispatchEvent(new MouseEvent('mousedown', { cancelable: true, bubbles: true }));
      refresh();
      expect(input().value).toBe('Muse - Uprising');
      submitForm();

      expect(fixture.componentInstance.answered[0]).toMatchObject({ artist: 'Muse', title: 'Uprising' });
    });

    it('↓ ↓ Entrée choisit une proposition au lieu de valider ; Entrée ensuite valide', async () => {
      await showSuggestions('daf');
      press('ArrowDown');
      press('ArrowDown');
      expect(element.querySelectorAll('li')[1].getAttribute('aria-selected')).toBe('true');

      expect(press('Enter').defaultPrevented).toBe(true);
      expect(input().value).toBe('Muse - Uprising');
      expect(element.querySelector('ul')).toBeNull();
      expect(fixture.componentInstance.answered).toEqual([]);

      submitForm();
      expect(fixture.componentInstance.answered).toHaveLength(1);
    });

    it('Échap ferme la liste sans toucher au champ', async () => {
      await showSuggestions('daf');
      press('Escape');
      expect(element.querySelector('ul')).toBeNull();
      expect(input().value).toBe('daf');
    });

    it('✕ vide le champ et la liste', async () => {
      await showSuggestions('daf');
      element.querySelector('button[title="gameplay.answer.clear"]')!.dispatchEvent(new MouseEvent('mousedown', { cancelable: true, bubbles: true }));
      refresh();
      expect(input().value).toBe('');
      expect(element.querySelector('ul')).toBeNull();
    });

    it('valider un champ vide demande confirmation ; retaper la ferme', () => {
      submitForm();
      expect(element.textContent).toContain('gameplay.answer.emptyConfirm');
      expect(fixture.componentInstance.answered).toEqual([]);

      type('d');
      expect(element.textContent).not.toContain('gameplay.answer.emptyConfirm');
    });

    it('confirmer une réponse vide l\'envoie', () => {
      submitForm();
      button('gameplay.answer.submitAnyway')!.click();
      expect(fixture.componentInstance.answered).toEqual([
        { trackId: 7, listenedSeconds: 0.5, wasExtended: false, artist: null, title: null },
      ]);
    });

    it('« Passer » : confirmation, annulation, puis envoi d\'une réponse vide malgré la saisie', () => {
      type('Daft Punk - Get Lucky');
      button('gameplay.round.skip')!.click();
      refresh();
      expect(element.textContent).toContain('gameplay.answer.skipConfirm');

      button('gameplay.answer.cancel')!.click();
      refresh();
      expect(element.textContent).not.toContain('gameplay.answer.skipConfirm');

      button('gameplay.round.skip')!.click();
      refresh();
      button('gameplay.answer.skipAnyway')!.click();
      expect(fixture.componentInstance.answered).toEqual([
        { trackId: 7, listenedSeconds: 0.5, wasExtended: false, artist: null, title: null },
      ]);
    });

    it('un échec d\'envoi garde la saisie ; « Réessayer » renvoie la même réponse', () => {
      type('Daft Punk - Get Lucky');
      submitForm();
      store.submissionFailed();
      refresh();

      expect(element.querySelector('[role="alert"]')?.textContent).toContain('gameplay.answer.submitFailed');
      expect(input().value).toBe('Daft Punk - Get Lucky');

      button('gameplay.answer.retry')!.click();
      expect(fixture.componentInstance.answered).toHaveLength(2);
      expect(fixture.componentInstance.answered[1]).toEqual(fixture.componentInstance.answered[0]);
    });

    it('fait place aux boutons du mode', () => {
      expect(button('Bonus')).toBeDefined();
    });
  });

  describe('indices', () => {
    it('proposent un bouton par niveau débloqué et relaient la demande au mode', () => {
      start();
      for (let i = 0; i < 4; i++) store.listenMore(); // 0,5 → 1 → 2 → 5 → 10 s
      emit('playing');

      expect(element.querySelectorAll('[data-testid="hints"] button')).toHaveLength(2);
      button('gameplay.hint.button')!.click();
      expect(fixture.componentInstance.hints).toEqual([1]);
    });

    it('montrent ce que le back révèle', () => {
      start();
      for (let i = 0; i < 3; i++) store.listenMore();
      store.applyHints(1, [{ kind: 'year', value: '2013' }]);
      refresh();

      expect(element.querySelector('[data-testid="hints"]')?.textContent).toContain('2013');
      expect(element.querySelectorAll('[data-testid="hints"] button')).toHaveLength(0);
    });

    it('les boutons attendent la réponse du back', () => {
      start();
      for (let i = 0; i < 3; i++) store.listenMore();
      fixture.componentInstance.hintPending.set(true);
      refresh();
      expect(button('gameplay.hint.button')!.disabled).toBe(true);
    });
  });

  describe('révélation', () => {
    beforeEach(() => {
      start();
      emit('finished', 0.5);
      type('Daft Punk - Get Lucky');
      submitForm();
    });

    it('remplace le lecteur et la saisie par la carte, avec les éléments du mode', () => {
      store.reveal();
      fixture.componentInstance.result.set(RESULT);
      refresh();

      expect(element.querySelector('app-round-player')).toBeNull();
      expect(element.querySelector('form')).toBeNull();
      expect(element.querySelector('[data-testid="reveal"]')?.textContent).toContain('Daft Punk — Get Lucky');
      expect(element.querySelector('[roundScore]')?.textContent).toBe('+850 pts');
      expect(button('Piste suivante')).toBeDefined();
      expect(element.querySelector('[data-testid="guess-time-chart"]')).not.toBeNull();
      expect(audio.calls.at(-1)).toBe('playFull');
    });

    it('rien à révéler avant que le serveur ait répondu', () => {
      expect(element.querySelector('[data-testid="reveal"]')).toBeNull();
    });
  });

  it('un nouveau morceau repart d\'une saisie vide', () => {
    start();
    emit('finished', 0.5);
    type('Daft Punk');
    expect(input().value).toBe('Daft Punk');

    start({ trackId: 8 });
    emit('finished', 0.5);

    expect(input().value).toBe('');
  });
});
