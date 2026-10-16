import { TestBed } from '@angular/core/testing';
import { AnswerSuggestion } from '../domain/answer';
import { AnswerSearchPort } from './answer-search.port';
import { AnswerSearchStore, SEARCH_DEBOUNCE_MS } from './answer-search.store';

const DAFT: AnswerSuggestion = { artist: 'Daft Punk', title: 'Get Lucky' };
const DAFT2: AnswerSuggestion = { artist: 'Daft Punk', title: 'One More Time' };
const DAFT3: AnswerSuggestion = { artist: 'Daft Punk', title: 'Around the World' };

describe('AnswerSearchStore', () => {
  let search: ReturnType<typeof vi.fn<(query: string) => Promise<AnswerSuggestion[]>>>;
  let store: InstanceType<typeof AnswerSearchStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    search = vi.fn(() => Promise.resolve([DAFT, DAFT2, DAFT3]));
    TestBed.configureTestingModule({
      providers: [AnswerSearchStore, { provide: AnswerSearchPort, useValue: { search } }],
    });
    store = TestBed.inject(AnswerSearchStore);
  });

  afterEach(() => vi.useRealTimers());

  async function type(query: string): Promise<void> {
    store.setQuery(query);
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
  }

  describe('recherche', () => {
    it('attend 300 ms après la dernière frappe', async () => {
      store.setQuery('daf');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
      expect(search).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(search).toHaveBeenCalledExactlyOnceWith('daf');
      expect(store.suggestions()).toHaveLength(3);
    });

    it('chaque frappe repart de zéro : seule la dernière recherche part', async () => {
      store.setQuery('da');
      await vi.advanceTimersByTimeAsync(200);
      store.setQuery('daf');
      await vi.advanceTimersByTimeAsync(200);
      store.setQuery('daft');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      expect(search).toHaveBeenCalledExactlyOnceWith('daft');
    });

    it('n\'interroge pas le catalogue sous 2 caractères et vide la liste', async () => {
      await type('daf');
      store.setQuery('d');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
      expect(search).toHaveBeenCalledOnce();
      expect(store.suggestions()).toEqual([]);
    });

    it('ignore les espaces autour de la saisie', async () => {
      await type('  daft  ');
      expect(search).toHaveBeenCalledWith('daft');
    });

    it('un échec de recherche ne gêne pas la saisie : liste vide, pas d\'erreur', async () => {
      search.mockRejectedValue(new Error('503'));
      await type('daft');
      expect(store.suggestions()).toEqual([]);
      expect(store.query()).toBe('daft');
    });

    it('une réponse arrivée après une nouvelle frappe est écartée', async () => {
      let resolveFirst: (value: AnswerSuggestion[]) => void = () => undefined;
      search.mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)));
      await type('daft');
      store.setQuery('x'); // trop court : la liste se vide, la recherche en vol est abandonnée
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      resolveFirst([DAFT]);
      await vi.advanceTimersByTimeAsync(0);
      expect(store.suggestions()).toEqual([]);
    });
  });

  describe('choix d\'une proposition', () => {
    it('met « artiste - titre » dans le champ, ferme la liste et donne la réponse exacte', async () => {
      await type('daft');
      store.select(DAFT);

      expect(store.query()).toBe('Daft Punk - Get Lucky');
      expect(store.visibleSuggestions()).toEqual([]);
      expect(store.answer()).toEqual({ artist: 'Daft Punk', title: 'Get Lucky' });
    });

    it('taper de nouveau oublie la proposition choisie', async () => {
      store.select(DAFT);
      await type('Daft Punk - One');
      expect(store.selected()).toBeNull();
      expect(store.answer()).toEqual({ artist: 'Daft Punk', title: 'One' });
    });
  });

  describe('clavier', () => {
    beforeEach(async () => {
      await type('daft');
    });

    it('↓ et ↑ parcourent la liste en boucle', () => {
      store.moveHighlight(1);
      expect(store.highlighted()).toBe(0);
      store.moveHighlight(1);
      store.moveHighlight(1);
      store.moveHighlight(1);
      expect(store.highlighted()).toBe(0);
      store.moveHighlight(-1);
      expect(store.highlighted()).toBe(2);
    });

    it('↑ depuis « aucune » va à la dernière proposition', () => {
      store.moveHighlight(-1);
      expect(store.highlighted()).toBe(2);
    });

    it('Entrée choisit la proposition en surbrillance', () => {
      store.moveHighlight(1);
      store.moveHighlight(1);
      expect(store.selectHighlighted()).toBe(true);
      expect(store.selected()).toEqual(DAFT2);
    });

    it('Entrée sans surbrillance ne choisit rien : la saisie se valide', () => {
      expect(store.selectHighlighted()).toBe(false);
      expect(store.selected()).toBeNull();
    });

    it('Échap ferme la liste sans toucher au champ', () => {
      store.moveHighlight(1);
      store.close();
      expect(store.visibleSuggestions()).toEqual([]);
      expect(store.highlighted()).toBe(-1);
      expect(store.query()).toBe('daft');
      store.moveHighlight(1);
      expect(store.highlighted()).toBe(-1);
    });

    it('le survol resynchronise la surbrillance', () => {
      store.highlight(2);
      store.moveHighlight(1);
      expect(store.highlighted()).toBe(0);
    });

    it('une nouvelle réponse du catalogue remet la surbrillance à zéro', async () => {
      store.moveHighlight(1);
      await type('daft p');
      expect(store.highlighted()).toBe(-1);
    });

    it('la liste se rouvre à la frappe et au focus', async () => {
      store.close();
      store.openList();
      expect(store.visibleSuggestions()).toHaveLength(3);
      store.close();
      await type('daft p');
      expect(store.visibleSuggestions()).toHaveLength(3);
    });
  });

  describe('effacer', () => {
    it('✕ vide le champ, la liste et la proposition, et annule la recherche en attente', async () => {
      await type('daft');
      store.select(DAFT);
      store.setQuery('daft p');
      store.clear();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);

      expect(store.query()).toBe('');
      expect(store.selected()).toBeNull();
      expect(store.suggestions()).toEqual([]);
      expect(search).toHaveBeenCalledTimes(1);
      expect(store.answer()).toEqual({ artist: null, title: null });
    });
  });
});
