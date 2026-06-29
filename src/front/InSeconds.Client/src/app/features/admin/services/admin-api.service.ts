import { Injectable, inject, computed } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of, timer, switchMap } from 'rxjs';
import { AdminStatsResponse } from '../../../api/api.generated';
import { ChallengeDto, DeezerTrackInfo, PoolTracksResponse } from '../admin.models';
import { AdminHttpService } from './admin-http.service';
import { AdminStateService } from './admin-state.service';

@Injectable()
export class AdminApiService {
  readonly http = inject(AdminHttpService);
  readonly state = inject(AdminStateService);

  readonly authenticated = this.http.authenticated;
  readonly selectedDay = this.state.selectedDay;
  readonly poolSearchQuery = this.state.poolSearchQuery;

  private readonly poolSearchResource = rxResource<DeezerTrackInfo[], string>({
    params: () => this.state.poolSearchQuery(),
    stream: ({ params: q }) => {
      if (q.length < 2) return of([] as DeezerTrackInfo[]);
      return timer(300).pipe(
        switchMap(() => this.http.searchDeezer(q))
      );
    },
  });
  readonly poolSearchResults = computed(() => this.poolSearchResource.value() ?? []);
  readonly poolSearchLoading = computed(() => this.poolSearchResource.isLoading());

  private readonly poolTracksResource = rxResource<PoolTracksResponse, number>({
    params: () => this.state.poolReloadTrigger(),
    stream: () => this.http.getPoolTracks(),
  });
  readonly poolTracks = computed(() => this.poolTracksResource.value() ?? { available: [], used: [] });
  readonly poolTracksLoading = computed(() => this.poolTracksResource.isLoading());

  private readonly statsResource = rxResource<AdminStatsResponse, string>({
    params: () => this.state.selectedDay(),
    stream: ({ params: day }) => this.http.getStats(day),
  });
  readonly adminStats = computed(() => this.statsResource.value() ?? null);
  readonly statsLoading = computed(() => this.statsResource.isLoading());

  private readonly challengesResource = rxResource<ChallengeDto[], number>({
    params: () => this.state.challengesReloadTrigger(),
    stream: () => this.http.getChallenges(),
  });
  readonly challenges = computed(() => this.challengesResource.value() ?? []);

  checkAuth(): void { this.http.checkAuth(); }

  login(password: string): Promise<void> {
    return this.http.login(password).then(() => this.reloadAll());
  }

  logout(): void { this.http.logout(); }

  reloadPool(): void { this.state.reloadPool(); }

  reloadStats(): void { this.statsResource.reload(); }

  reloadAll(): void {
    this.state.reloadChallenges();
    this.state.reloadPool();
    this.reloadStats();
  }

  generateToday() { return this.http.generateToday(); }
  resetToday() { return this.http.resetToday(); }
  addTrack(deezerTrackId: number) { return this.http.addTrack(deezerTrackId); }
  updateTrack(id: number, deezerTrackId: number) { return this.http.updateTrack(id, deezerTrackId); }
  deleteTrack(id: number) { return this.http.deleteTrack(id); }
}
