import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PlayerSessionService } from '../../../core/services/player-session.service';
import { AdminStatsResponse, ChallengeStatsResponse } from '../../../api/api.generated';
import {
  ChallengeDto, DeezerTrackInfo, PoolTracksResponse, RefreshPreviewsResult,
} from '../admin.models';

@Injectable()
export class AdminHttpService {
  private readonly http = inject(HttpClient);
  private readonly playerSession = inject(PlayerSessionService);
  readonly base = `${environment.apiUrl}/api/admin`;

  readonly authenticated = signal(false);

  checkAuth(): void {
    lastValueFrom(this.http.get(`${this.base}/me`))
      .then(() => this.authenticated.set(true))
      .catch(() => this.authenticated.set(false));
  }

  // L'accès admin est désormais un rôle sur le compte joueur (Player.IsAdmin) : se
  // déconnecter de l'admin déconnecte donc aussi la session de jeu du même navigateur.
  // Recharge PlayerSessionService après coup pour que isLinked() reflète immédiatement
  // l'état guest, sinon l'écran de login afficherait encore "accès refusé" au lieu du
  // lien vers /login.
  logout(): Promise<void> {
    return lastValueFrom(this.playerSession.logout())
      .then(() => lastValueFrom(this.playerSession.load()))
      .then(() => { this.authenticated.set(false); });
  }

  generateToday() { return this.http.post(`${this.base}/generate-today`, {}); }
  refreshPreviews() { return this.http.post<RefreshPreviewsResult>(`${this.base}/refresh-previews`, {}); }
  updateTrackCooldownDays(days: number) {
    return this.http.put<{ trackCooldownDays: number }>(`${this.base}/settings/track-cooldown-days`, { trackCooldownDays: days });
  }
  addTrack(deezerTrackId: number) { return this.http.post(`${this.base}/tracks`, { deezerTrackId }); }
  updateTrack(id: number, deezerTrackId: number) { return this.http.put(`${this.base}/tracks/${id}`, { deezerTrackId }); }
  deleteTrack(id: number) { return this.http.delete(`${this.base}/tracks/${id}`); }
  searchDeezer(q: string) { return this.http.get<DeezerTrackInfo[]>(`${this.base}/deezer-search?q=${encodeURIComponent(q)}`); }
  getPoolTracks() { return this.http.get<PoolTracksResponse>(`${this.base}/tracks`); }
  getStats(day: string) { return this.http.get<AdminStatsResponse>(`${this.base}/stats?date=${day}`); }
  getChallengeStats() { return this.http.get<ChallengeStatsResponse>(`${this.base}/challenge-stats`); }
  getChallenges() { return this.http.get<ChallengeDto[]>(`${this.base}/challenges`); }
}
