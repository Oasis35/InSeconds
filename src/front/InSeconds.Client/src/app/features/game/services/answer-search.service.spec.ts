import { TestBed } from '@angular/core/testing';
import { Observable, map } from 'rxjs';
import { AnswerSearchService } from './answer-search.service';
import { DeezerAutocompleteService, DeezerSuggestion } from './deezer-autocomplete.service';

const SUGGESTIONS: DeezerSuggestion[] = [
  { artist: 'E2E Artist', title: 'E2E Track' },
  { artist: 'Other Artist', title: 'Another Track' },
];

class DeezerAutocompleteStub {
  search(query$: Observable<string>): Observable<DeezerSuggestion[]> {
    return query$.pipe(map(() => SUGGESTIONS));
  }
}

describe('AnswerSearchService', () => {
  let service: AnswerSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AnswerSearchService,
        { provide: DeezerAutocompleteService, useClass: DeezerAutocompleteStub },
      ],
    });

    service = TestBed.inject(AnswerSearchService);
  });

  it('defaults to empty fields and no suggestions', () => {
    expect(service.searchQuery).toBe('');
    expect(service.artistAnswer).toBe('');
    expect(service.titleAnswer).toBe('');
    expect(service.suggestions()).toEqual([]);
    expect(service.showSuggestions()).toBe(false);
    expect(service.highlightedIndex()).toBe(-1);
  });

  it('onQueryChange resets artist/title, opens the dropdown and pushes to the search pipeline', () => {
    service.artistAnswer = 'stale';
    service.titleAnswer = 'stale';

    service.onQueryChange('dedup-test');

    expect(service.artistAnswer).toBe('');
    expect(service.titleAnswer).toBe('');
    expect(service.showSuggestions()).toBe(true);
    expect(service.suggestions()).toEqual(SUGGESTIONS);
  });

  it('selectSuggestion fills artist/title/searchQuery and closes the dropdown', () => {
    service.onQueryChange('dedup-test');

    service.selectSuggestion(SUGGESTIONS[1]);

    expect(service.artistAnswer).toBe('Other Artist');
    expect(service.titleAnswer).toBe('Another Track');
    expect(service.searchQuery).toBe('Other Artist - Another Track');
    expect(service.showSuggestions()).toBe(false);
    expect(service.highlightedIndex()).toBe(-1);
  });

  it('clearAll wipes every field and closes the dropdown', () => {
    service.onQueryChange('dedup-test');
    service.selectSuggestion(SUGGESTIONS[0]);

    service.clearAll();

    expect(service.searchQuery).toBe('');
    expect(service.artistAnswer).toBe('');
    expect(service.titleAnswer).toBe('');
    expect(service.suggestions()).toEqual([]);
    expect(service.showSuggestions()).toBe(false);
    expect(service.highlightedIndex()).toBe(-1);
  });

  describe('resolveAnswer', () => {
    it('returns the already-selected artist/title untouched', () => {
      service.selectSuggestion(SUGGESTIONS[0]);

      const answer = service.resolveAnswer();

      expect(answer).toEqual({ artist: 'E2E Artist', title: 'E2E Track' });
    });

    it('splits free text on " - " when no suggestion was selected', () => {
      service.searchQuery = 'Free Artist - Free Title';

      const answer = service.resolveAnswer();

      expect(answer).toEqual({ artist: 'Free Artist', title: 'Free Title' });
      expect(service.artistAnswer).toBe('Free Artist');
      expect(service.titleAnswer).toBe('Free Title');
    });

    it('returns nulls when everything is empty', () => {
      const answer = service.resolveAnswer();

      expect(answer).toEqual({ artist: null, title: null });
    });
  });

  it('reset clears the answer fields but leaves showSuggestions untouched', () => {
    service.onQueryChange('dedup-test');
    service.selectSuggestion(SUGGESTIONS[0]);
    service.showSuggestions.set(true);

    service.reset();

    expect(service.searchQuery).toBe('');
    expect(service.artistAnswer).toBe('');
    expect(service.titleAnswer).toBe('');
    expect(service.suggestions()).toEqual([]);
    expect(service.highlightedIndex()).toBe(-1);
    expect(service.showSuggestions()).toBe(true);
  });

  describe('onSearchKeydown', () => {
    beforeEach(() => service.onQueryChange('dedup-test'));

    function press(key: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      service.onSearchKeydown(event);
      return event;
    }

    it('ArrowDown from no selection highlights the first item', () => {
      press('ArrowDown');
      expect(service.highlightedIndex()).toBe(0);
    });

    it('ArrowUp from no selection highlights the last item', () => {
      press('ArrowUp');
      expect(service.highlightedIndex()).toBe(1);
    });

    it('ArrowDown wraps from the last item back to the first', () => {
      press('ArrowDown');
      press('ArrowDown');
      press('ArrowDown');
      expect(service.highlightedIndex()).toBe(0);
    });

    it('Escape closes the dropdown and resets the highlight', () => {
      press('ArrowDown');
      press('Escape');
      expect(service.showSuggestions()).toBe(false);
      expect(service.highlightedIndex()).toBe(-1);
    });

    it('does nothing when the dropdown is closed', () => {
      service.showSuggestions.set(false);
      press('ArrowDown');
      expect(service.highlightedIndex()).toBe(-1);
    });
  });
});
