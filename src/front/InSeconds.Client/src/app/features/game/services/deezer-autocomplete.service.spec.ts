import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { DeezerAutocompleteService, DeezerSuggestion } from './deezer-autocomplete.service';
import { environment } from '../../../../environments/environment';

// Couvre la logique non triviale documentée dans CLAUDE.md (debounce 300ms, seuil 2 caractères,
// catchError silencieux) mais jamais exercée par un spec dédié — seulement stubbée ailleurs
// (answer-search.service.spec.ts).
describe('DeezerAutocompleteService', () => {
  let service: DeezerAutocompleteService;
  let httpMock: HttpTestingController;
  let query$: Subject<string>;
  const base = `${environment.apiUrl}/api/deezer/search`;

  const SUGGESTIONS: DeezerSuggestion[] = [{ artist: 'Daft Punk', title: 'Around the World' }];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DeezerAutocompleteService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(DeezerAutocompleteService);
    httpMock = TestBed.inject(HttpTestingController);
    query$ = new Subject<string>();
  });

  afterEach(() => httpMock.verify());

  it('debounces 300ms before calling the API', fakeAsync(() => {
    const results: DeezerSuggestion[][] = [];
    service.search(query$).subscribe(r => results.push(r));

    query$.next('daft');
    tick(299);
    httpMock.expectNone(`${base}?q=daft`);

    tick(1);
    const req = httpMock.expectOne(`${base}?q=daft`);
    req.flush(SUGGESTIONS);

    expect(results).toEqual([SUGGESTIONS]);
  }));

  it('does not call the API below the 2-character threshold (after trim)', fakeAsync(() => {
    const results: DeezerSuggestion[][] = [];
    service.search(query$).subscribe(r => results.push(r));

    query$.next(' a ');
    tick(300);

    httpMock.expectNone(() => true);
    expect(results).toEqual([[]]);
  }));

  it('trims the query before searching', fakeAsync(() => {
    const results: DeezerSuggestion[][] = [];
    service.search(query$).subscribe(r => results.push(r));

    query$.next('  daft punk  ');
    tick(300);

    const req = httpMock.expectOne(`${base}?q=${encodeURIComponent('daft punk')}`);
    req.flush(SUGGESTIONS);

    expect(results).toEqual([SUGGESTIONS]);
  }));

  it('drops an identical consecutive query without a new request (distinctUntilChanged)', fakeAsync(() => {
    const results: DeezerSuggestion[][] = [];
    service.search(query$).subscribe(r => results.push(r));

    query$.next('daft');
    tick(300);
    httpMock.expectOne(`${base}?q=daft`).flush(SUGGESTIONS);

    query$.next('daft');
    tick(300);

    httpMock.expectNone(`${base}?q=daft`);
    expect(results).toEqual([SUGGESTIONS]);
  }));

  it('cancels an in-flight request when a newer query arrives (switchMap)', fakeAsync(() => {
    const results: DeezerSuggestion[][] = [];
    service.search(query$).subscribe(r => results.push(r));

    query$.next('daf');
    tick(300);
    const stale = httpMock.expectOne(`${base}?q=daf`);

    query$.next('daft');
    tick(300);
    // switchMap désabonne l'observable HTTP précédent, ce qui annule la requête sous-jacente
    // (HttpTestingController la marque "cancelled" — la flusher lèverait une erreur).
    expect(stale.cancelled).toBeTrue();
    const fresh = httpMock.expectOne(`${base}?q=daft`);
    fresh.flush(SUGGESTIONS);

    expect(results).toEqual([SUGGESTIONS]);
  }));

  it('swallows a network error and emits an empty array instead of propagating it', fakeAsync(() => {
    const results: DeezerSuggestion[][] = [];
    const errors: unknown[] = [];
    service.search(query$).subscribe({ next: r => results.push(r), error: e => errors.push(e) });

    query$.next('daft');
    tick(300);
    httpMock.expectOne(`${base}?q=daft`).error(new ProgressEvent('network error'));

    expect(errors).toEqual([]);
    expect(results).toEqual([[]]);
  }));

  it('keeps working after a failed search for a subsequent query', fakeAsync(() => {
    const results: DeezerSuggestion[][] = [];
    service.search(query$).subscribe(r => results.push(r));

    query$.next('daft');
    tick(300);
    httpMock.expectOne(`${base}?q=daft`).error(new ProgressEvent('network error'));

    query$.next('punk');
    tick(300);
    httpMock.expectOne(`${base}?q=punk`).flush(SUGGESTIONS);

    expect(results).toEqual([[], SUGGESTIONS]);
  }));
});
