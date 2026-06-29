import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AdminStatsResponse } from '../../../api/api.generated';
import {
  ChallengeDto, DeezerTrackInfo, PoolTracksResponse, ResetResult,
} from '../admin.models';

@Injectable()
export class AdminHttpService {
  private readonly http = inject(HttpClient);
  readonly base = `${environment.apiUrl}/api/admin`;
  private readonly storageKey = 'admin_token';

  readonly authenticated = signal(false);

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
      });
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
    this.authenticated.set(false);
  }

  generateToday() { return this.http.post(`${this.base}/generate-today`, {}); }
  resetToday() { return this.http.delete<ResetResult>(`${this.base}/reset-today`); }
  addTrack(deezerTrackId: number) { return this.http.post(`${this.base}/tracks`, { deezerTrackId }); }
  updateTrack(id: number, deezerTrackId: number) { return this.http.put(`${this.base}/tracks/${id}`, { deezerTrackId }); }
  deleteTrack(id: number) { return this.http.delete(`${this.base}/tracks/${id}`); }
  searchDeezer(q: string) { return this.http.get<DeezerTrackInfo[]>(`${this.base}/deezer-search?q=${encodeURIComponent(q)}`); }
  getPoolTracks() { return this.http.get<PoolTracksResponse>(`${this.base}/tracks`); }
  getStats(day: string) { return this.http.get<AdminStatsResponse>(`${this.base}/stats?date=${day}`); }
  getChallenges() { return this.http.get<ChallengeDto[]>(`${this.base}/challenges`); }
}
