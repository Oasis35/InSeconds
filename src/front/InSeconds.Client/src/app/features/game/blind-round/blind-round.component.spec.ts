import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, map, of } from 'rxjs';
import { BlindRoundComponent } from './blind-round.component';
import { GameFacadeService } from '../services/game-facade.service';
import { DeezerAutocompleteService, DeezerSuggestion } from '../services/deezer-autocomplete.service';
import { TrackSlot } from '../../../core/models/game.models';

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
            startToday: () => of(undefined),
            submitAnswer: () => of(undefined),
            abandonSession: () => of(undefined),
            updateListening: () => of(undefined),
          },
        },
        { provide: DeezerAutocompleteService, useClass: DeezerAutocompleteStub },
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
