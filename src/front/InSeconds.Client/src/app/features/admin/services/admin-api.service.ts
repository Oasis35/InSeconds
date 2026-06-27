import { Injectable, inject, signal, computed } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom, of, timer, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AdminStatsResponse } from '../../../api/api.generated';
import {
  ChallengeDto, DeezerTrackInfo, PoolTracksResponse, ResetResult,
} from '../admin.models';

/**
 * Couche d'accès données + état partagé de l'admin : auth, et les rxResources
 * (pool, stats, défis, recherche Deezer) mutualisés entre les onglets.
 * Les services métier (pool/stats) et les composants consomment ce service.
 */
@Injectable()
export class AdminApiService {
  private readonly http = inject(HttpClient);
  readonly base = `${environment.apiUrl}/api/admin`;
  private readonly storageKey = 'admin_token';

  readonly authenticated = signal(false);

  // --- paramètres pilotant les resources (modifiés par les services métier) ---
  readonly selectedDay = signal<string>(new Date().toISOString().slice(0, 10));
  readonly poolSearchQuery = signal('');
  private readonly poolReload = signal(0);
  private readonly challengesReload = signal(0);

  // --- Recherche Deezer (debounce 300ms) ---
  private readonly poolSearchResource = rxResource<DeezerTrackInfo[], string>({
    params: () => this.poolSearchQuery(),
    stream: ({ params: q }) => {
      if (q.length < 2) return of([] as DeezerTrackInfo[]);
      return timer(300).pipe(
        switchMap(() => this.http.get<DeezerTrackInfo[]>(`${this.base}/deezer-search?q=${encodeURIComponent(q)}`))
      );
    },
  });
  readonly poolSearchResults = computed(() => this.poolSearchResource.value() ?? []);
  readonly poolSearchLoading = computed(() => this.poolSearchResource.isLoading());

  // --- Pool de morceaux ---
  private readonly poolTracksResource = rxResource<PoolTracksResponse, number>({
    params: () => this.poolReload(),
    stream: () => this.http.get<PoolTracksResponse>(`${this.base}/tracks`),
  });
  readonly poolTracks = computed(() => this.poolTracksResource.value() ?? { available: [], used: [] });
  readonly poolTracksLoading = computed(() => this.poolTracksResource.isLoading());

  // --- Stats admin (se relance quand selectedDay change) ---
  private readonly statsResource = rxResource<AdminStatsResponse, string>({
    params: () => this.selectedDay(),
    stream: ({ params: day }) => this.http.get<AdminStatsResponse>(`${this.base}/stats?date=${day}`),
  });
  readonly adminStats = computed(() => this.statsResource.value() ?? null);
  readonly statsLoading = computed(() => this.statsResource.isLoading());

  // --- Liste des défis ---
  private readonly challengesResource = rxResource<ChallengeDto[], number>({
    params: () => this.challengesReload(),
    stream: () => this.http.get<ChallengeDto[]>(`${this.base}/challenges`),
  });
  readonly challenges = computed(() => this.challengesResource.value() ?? []);

  checkAuth(): void {
    lastValueFrom(this.http.get(`${this.base}/me`))
      .then(() => this.authenticated.set(true))
      .catch(() => this.authenticated.set(false));
  }

  login(password: string): Promise<void> {
    return lastValueFrom(this.http.post<{ token: string }>(`${this.base}/login`, { password }))
      .then(res => {
        localStorage.setItem(this.storageKey, res.token);
        this.authenticated.set(true);
        this.reloadAll();
      });
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
    this.authenticated.set(false);
  }

  reloadPool(): void {
    this.poolReload.update(v => v + 1);
  }

  reloadStats(): void {
    this.statsResource.reload();
  }

  reloadAll(): void {
    this.challengesReload.update(v => v + 1);
    this.reloadPool();
    this.reloadStats();
  }

  // --- HTTP exposés aux services métier ---
  generateToday() { return this.http.post(`${this.base}/generate-today`, {}); }
  resetToday() { return this.http.delete<ResetResult>(`${this.base}/reset-today`); }
  addTrack(deezerTrackId: number) { return this.http.post(`${this.base}/tracks`, { deezerTrackId }); }
  updateTrack(id: number, deezerTrackId: number) { return this.http.put(`${this.base}/tracks/${id}`, { deezerTrackId }); }
  deleteTrack(id: number) { return this.http.delete(`${this.base}/tracks/${id}`); }
}
