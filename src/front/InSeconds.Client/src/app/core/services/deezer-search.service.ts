import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, debounceTime, distinctUntilChanged, switchMap, map, of, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DeezerSuggestion {
  artist: string;
  title: string;
}

@Injectable({ providedIn: 'root' })
export class DeezerSearchService {
  private readonly http = inject(HttpClient);

  search(query$: Observable<string>): Observable<DeezerSuggestion[]> {
    return query$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        const trimmed = q.trim();
        if (trimmed.length < 2) return of([]);
        return this.http
          .get<DeezerSuggestion[]>(`${environment.apiUrl}/api/deezer/search?q=${encodeURIComponent(trimmed)}`)
          .pipe(catchError(() => of([])));
      })
    );
  }
}
