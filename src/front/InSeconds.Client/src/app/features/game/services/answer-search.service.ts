import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { DeezerAutocompleteService, DeezerSuggestion } from './deezer-autocomplete.service';

/**
 * État de la recherche/autocomplete Deezer du round en cours : champ de saisie, suggestions,
 * navigation clavier dans la dropdown. Extrait de `BlindRoundComponent` pour SRP (même pattern
 * que `HintService`). Ne porte pas `pendingConfirm` (état de soumission, cf.
 * `AnswerSubmissionService`) — `onQueryChange`/`clearSearch`, qui touchent aux deux, restent
 * orchestrés par `BlindRoundComponent`.
 */
@Injectable()
export class AnswerSearchService {
  private readonly deezerSearch = inject(DeezerAutocompleteService);

  searchQuery = '';
  artistAnswer = '';
  titleAnswer = '';

  private readonly _suggestions = signal<DeezerSuggestion[]>([]);
  readonly suggestions = this._suggestions.asReadonly();
  private readonly _showSuggestions = signal(false);
  readonly showSuggestions = this._showSuggestions.asReadonly();
  private readonly _highlightedIndex = signal(-1);
  readonly highlightedIndex = this._highlightedIndex.asReadonly();

  private readonly query$ = new Subject<string>();

  constructor() {
    this.deezerSearch.search(this.query$).pipe(takeUntilDestroyed()).subscribe(s => {
      this._suggestions.set(s);
      this._highlightedIndex.set(-1);
    });
  }

  onQueryChange(q: string): void {
    this.artistAnswer = '';
    this.titleAnswer = '';
    this.query$.next(q);
    this._showSuggestions.set(true);
  }

  openSuggestions(): void {
    this._showSuggestions.set(true);
  }

  /** Survol souris d'une suggestion : resynchronise la surbrillance clavier. */
  highlight(index: number): void {
    this._highlightedIndex.set(index);
  }

  onBlur(): void {
    setTimeout(() => this._showSuggestions.set(false), 150);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (!this.showSuggestions() || this.suggestions().length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveHighlight(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveHighlight(-1);
        break;
      case 'Enter':
        if (this.highlightedIndex() >= 0) {
          event.preventDefault();
          this.selectSuggestion(this.suggestions()[this.highlightedIndex()]);
        }
        break;
      case 'Escape':
        this._showSuggestions.set(false);
        this._highlightedIndex.set(-1);
        break;
    }
  }

  private moveHighlight(delta: number): void {
    const count = this.suggestions().length;
    const current = this.highlightedIndex();

    if (current === -1) {
      this._highlightedIndex.set(delta > 0 ? 0 : count - 1);
      return;
    }

    this._highlightedIndex.set((current + delta + count) % count);
  }

  selectSuggestion(s: DeezerSuggestion): void {
    this.artistAnswer = s.artist;
    this.titleAnswer = s.title;
    this.searchQuery = `${s.artist} - ${s.title}`;
    this._showSuggestions.set(false);
    this._highlightedIndex.set(-1);
  }

  /** Bouton ✕ — vide aussi la dropdown (contrairement à `reset()`, appelé à chaque nouveau morceau). */
  clearAll(): void {
    this.searchQuery = '';
    this.artistAnswer = '';
    this.titleAnswer = '';
    this._suggestions.set([]);
    this._showSuggestions.set(false);
    this._highlightedIndex.set(-1);
  }

  /**
   * Si aucune suggestion n'a été sélectionnée mais que le champ contient du texte libre,
   * tente un split naïf sur " - " (artiste / reste = titre) en fallback. Retourne les valeurs
   * finales trim (`null` si vide) — comportement extrait tel quel de `BlindRoundComponent.submit()`.
   */
  resolveAnswer(): { artist: string | null; title: string | null } {
    if (!this.artistAnswer && !this.titleAnswer && this.searchQuery.trim()) {
      const parts = this.searchQuery.split(' - ');
      this.artistAnswer = parts[0]?.trim() ?? '';
      this.titleAnswer = parts.slice(1).join(' - ').trim();
    }
    return {
      artist: this.artistAnswer.trim() || null,
      title: this.titleAnswer.trim() || null,
    };
  }

  /** Réinitialisation à chaque changement de morceau — appelé depuis `BlindRoundComponent.next()`. */
  reset(): void {
    this.artistAnswer = '';
    this.titleAnswer = '';
    this.searchQuery = '';
    this._suggestions.set([]);
    this._highlightedIndex.set(-1);
  }
}
