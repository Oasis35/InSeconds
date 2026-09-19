import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, map, of } from 'rxjs';
import { BlindRoundComponent } from './blind-round.component';
import { GameFacadeService } from '../services/game-facade.service';
import { AudioPlayerService } from '../../../core/services/audio-player.service';
import { DeezerAutocompleteService, DeezerSuggestion } from '../services/deezer-autocomplete.service';
import { TrackSlot } from '../../../core/models/game.models';

// Stub sans lecture audio réelle : le composant démarre désormais automatiquement la lecture
// au premier palier dès sa création (effect() constructeur) — sans ce stub, les tests
// déclencheraient un vrai <audio> réseau non déterministe.
class AudioPlayerStub {
  readonly state = signal<'idle' | 'loading' | 'playing' | 'finished'>('idle');
  readonly listenedSeconds = signal(0);
  readonly extended = signal(false);
  readonly progress = signal(0);
  readonly isIdle = () => this.state() === 'idle';
  readonly isPlaying = () => this.state() === 'playing';
  readonly isFinished = () => this.state() === 'finished';
  play(): void { this.state.set('playing'); }
  replayFull(): void {}
  extend(): void {}
  stop(): { listenedSeconds: number; wasExtended: boolean } { return { listenedSeconds: 0, wasExtended: false }; }
  reset(): void { this.state.set('idle'); }
  preloadAll(): Promise<void> { return Promise.resolve(); }
}

// Le stub renvoie toujours les 2 mêmes suggestions, de façon synchrone (pas de debounce),
// pour piloter la dropdown de façon déterministe dans les tests.
const SUGGESTIONS: DeezerSuggestion[] = [
  { artist: 'E2E Artist', title: 'E2E Track' },
  { artist: 'Other Artist', title: 'Another Track' },
];

class DeezerAutocompleteStub {
  search(query$: Observable<string>): Observable<DeezerSuggestion[]> {
    return query$.pipe(map(() => SUGGESTIONS));
  }
}

const TRACK: TrackSlot = {
  id: 1,
  position: 1,
  previewUrl: 'https://example.test/preview.mp3',
  coverUrl: undefined,
  deezerTrackId: 1,
};

describe('BlindRoundComponent — navigation clavier autocomplete', () => {
  let component: BlindRoundComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlindRoundComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: GameFacadeService,
          useValue: {
            peekToday: () => of(undefined),
            startToday: () => of(undefined),
            submitAnswer: () => of(undefined),
            abandonSession: () => of(undefined),
            updateListening: () => of(undefined),
          },
        },
        { provide: DeezerAutocompleteService, useClass: DeezerAutocompleteStub },
        { provide: AudioPlayerService, useClass: AudioPlayerStub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BlindRoundComponent);
    fixture.componentRef.setInput('track', TRACK);
    component = fixture.componentInstance;

    // Ouvre la dropdown avec les 2 suggestions du stub (synchrone, pas de fakeAsync requis).
    component.onQueryChange('dedup-test');
  });

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    component.onSearchKeydown(event);
    return event;
  }

  it('ArrowDown depuis aucune sélection met en surbrillance le premier élément', () => {
    press('ArrowDown');
    expect(component['highlightedIndex']()).toBe(0);
  });

  it('ArrowDown deux fois passe au deuxième élément', () => {
    press('ArrowDown');
    press('ArrowDown');
    expect(component['highlightedIndex']()).toBe(1);
  });

  it('ArrowDown boucle du dernier élément vers le premier', () => {
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(component['highlightedIndex']()).toBe(0);
  });

  it('ArrowUp depuis aucune sélection met en surbrillance le dernier élément', () => {
    press('ArrowUp');
    expect(component['highlightedIndex']()).toBe(1);
  });

  it('ArrowUp boucle du premier élément vers le dernier', () => {
    press('ArrowDown'); // index 0
    press('ArrowUp'); // boucle vers le dernier
    expect(component['highlightedIndex']()).toBe(1);
  });

  it('Entrée avec un élément en surbrillance sélectionne la suggestion sans soumettre', () => {
    press('ArrowDown');
    const event = press('Enter');

    expect(component['artistAnswer']).toBe('E2E Artist');
    expect(component['titleAnswer']).toBe('E2E Track');
    expect(component['searchQuery']).toBe('E2E Artist - E2E Track');
    expect(component['showSuggestions']()).toBe(false);
    expect(component['highlightedIndex']()).toBe(-1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Entrée sans sélection active ne modifie rien (laisse la soumission par défaut)', () => {
    const event = press('Enter');

    expect(component['artistAnswer']).toBe('');
    expect(component['titleAnswer']).toBe('');
    expect(event.defaultPrevented).toBe(false);
  });

  it('Échap ferme la dropdown et réinitialise la surbrillance', () => {
    press('ArrowDown');
    press('Escape');

    expect(component['showSuggestions']()).toBe(false);
    expect(component['highlightedIndex']()).toBe(-1);
  });

  it('ArrowDown ne fait rien si la dropdown est fermée', () => {
    component['showSuggestions'].set(false);
    press('ArrowDown');
    expect(component['highlightedIndex']()).toBe(-1);
  });

  it('sélectionner une suggestion à la souris réinitialise aussi la surbrillance', () => {
    press('ArrowDown');
    component.selectSuggestion(SUGGESTIONS[1]);
    expect(component['highlightedIndex']()).toBe(-1);
  });

  it('effacer la recherche réinitialise la surbrillance', () => {
    press('ArrowDown');
    component.clearSearch(new MouseEvent('mousedown'));
    expect(component['highlightedIndex']()).toBe(-1);
  });

  it('une nouvelle réponse de recherche réinitialise la surbrillance', () => {
    press('ArrowDown');
    component.onQueryChange('dedup-test');
    expect(component['highlightedIndex']()).toBe(-1);
  });
});

describe('BlindRoundComponent — indices (hints)', () => {
  let component: BlindRoundComponent;
  let fixture: ComponentFixture<BlindRoundComponent>;
  let requestHintSpy: jasmine.Spy;
  let updateListeningSpy: jasmine.Spy;

  beforeEach(async () => {
    requestHintSpy = jasmine.createSpy('requestHint');
    updateListeningSpy = jasmine.createSpy('updateListening').and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [BlindRoundComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        {
          provide: GameFacadeService,
          useValue: {
            peekToday: () => of(undefined),
            startToday: () => of(undefined),
            submitAnswer: () => of(undefined),
            abandonSession: () => of(undefined),
            updateListening: updateListeningSpy,
            requestHint: requestHintSpy,
          },
        },
        { provide: DeezerAutocompleteService, useClass: DeezerAutocompleteStub },
        { provide: AudioPlayerService, useClass: AudioPlayerStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BlindRoundComponent);
    fixture.componentRef.setInput('track', TRACK);
    fixture.componentRef.setInput('sessionId', 42);
    component = fixture.componentInstance;
  });

  // Défauts de settings.service.ts (aucun appel /api/settings dans ce test) : [5, 10].

  it('hint1Unlocked est faux avant le palier 5s', () => {
    component['chosenDuration'].set(3);
    expect(component['hint1Unlocked']()).toBe(false);
    expect(component['showAnyHintButton']()).toBe(false);
  });

  it('hint1Unlocked devient vrai au palier 5s', () => {
    component['chosenDuration'].set(5);
    expect(component['hint1Unlocked']()).toBe(true);
    expect(component['showAnyHintButton']()).toBe(true);
    expect(component['hint2Unlocked']()).toBe(false);
  });

  it('hint2Unlocked devient vrai au palier 10s', () => {
    component['chosenDuration'].set(10);
    expect(component['hint1Unlocked']()).toBe(true);
    expect(component['hint2Unlocked']()).toBe(true);
  });

  it('hint1Locked est vrai tant que non révélé, une fois débloqué', () => {
    component['chosenDuration'].set(5);
    expect(component['hint1Locked']()).toBe(true);
  });

  it('updateListening est appelé dès que le palier est choisi, sans attendre la fin de la lecture', () => {
    fixture.detectChanges(); // exécute les effects du constructeur (dont l'auto-play, qui met chosenDuration à jour une 1re fois)
    updateListeningSpy.calls.reset();

    component.startPlay(5);
    fixture.detectChanges();

    // Appelé immédiatement au choix du palier, sans dépendre de audio.state() === 'finished'.
    expect(updateListeningSpy).toHaveBeenCalledWith(42, TRACK.id, 5);
  });

  it('useHint1 appelle requestHint(sessionId, trackId, 1) et révèle l\'année', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: null }));
    component['chosenDuration'].set(5);

    component.useHint1();

    expect(requestHintSpy).toHaveBeenCalledWith(42, TRACK.id, 1);
    expect(component['hintYear']()).toBe(2016);
    expect(component['hint1Revealed']()).toBe(true);
    expect(component['hint1Locked']()).toBe(false);
  });

  it('useHint2 révèle année + artiste masqué, et marque aussi le niveau 1 comme révélé', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: 'D _ _ _   P _ _ _' }));
    component['chosenDuration'].set(10);

    component.useHint2();

    expect(requestHintSpy).toHaveBeenCalledWith(42, TRACK.id, 2);
    expect(component['hintYear']()).toBe(2016);
    expect(component['hintArtistMasked']()).toBe('D _ _ _   P _ _ _');
    expect(component['hint1Revealed']()).toBe(true, 'cumulatif : niveau 2 révèle aussi le niveau 1');
    expect(component['hint2Revealed']()).toBe(true);
  });

  it('useHint1 ne rappelle pas requestHint si déjà révélé', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: null }));
    component['chosenDuration'].set(5);

    component.useHint1();
    component.useHint1();

    expect(requestHintSpy).toHaveBeenCalledTimes(1);
  });

  it('next() réinitialise tous les signaux indice', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: 'D _ _ _' }));
    component['chosenDuration'].set(10);
    component.useHint2();

    component.next();

    expect(component['hint1Revealed']()).toBe(false);
    expect(component['hint2Revealed']()).toBe(false);
    expect(component['hintYear']()).toBeNull();
    expect(component['hintArtistMasked']()).toBeNull();
  });

  it('resultHintUsed/resultHintPercent reflètent le résultat soumis', () => {
    component.setResult({
      artistCorrect: true, titleCorrect: true, score: 40,
      correctArtist: 'A', correctTitle: 'T', listenedDurationSeconds: 10,
      averageSecondsWhenCorrect: undefined, failureRatePercent: 0,
      guessTimeDistribution: [], notFoundCount: 0,
      hintLevelUsed: 2, hintPenaltyPercentApplied: 60,
    } as any);

    expect(component['resultHintUsed']()).toBe(true);
    expect(component['resultHintPercent']()).toBe(60);
  });
});
