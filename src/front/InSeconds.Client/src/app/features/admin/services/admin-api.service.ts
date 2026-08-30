import { Injectable, inject, computed } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of, timer, switchMap } from 'rxjs';
import { AdminStatsResponse, ChallengeStatsDto, ChallengeStatsResponse } from '../../../api/api.generated';
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

  // Chargement paresseux par onglet : chaque resource ne fetch qu'une fois l'utilisateur
  // authentifié ET l'onglet concerné ouvert au moins une fois (params → undefined = resource idle).
  // Évite les 3 appels BDD simultanés à l'ouverture de l'admin (et les appels avant login).

  private readonly poolTracksResource = rxResource<PoolTracksResponse, number | undefined>({
    params: () => (this.http.authenticated() && this.state.hasVisited('pool'))
      ? this.state.poolReloadTrigger()
      : undefined,
    stream: () => this.http.getPoolTracks(),
  });
  readonly poolTracks = computed(() => this.poolTracksResource.value() ?? { available: [], used: [] });
  readonly poolTracksLoading = computed(() => this.poolTracksResource.isLoading());

  // Dashboard uniquement (KPIs, activité 30j, répartition joueurs). La partie lourde
  // « Stats par défi » a son propre endpoint/resource, chargé à l'ouverture de l'onglet Défis.
  // Pas de garde hasVisited : le Dashboard est l'onglet d'atterrissage, ses stats se chargent
  // dès l'auth (et lire visitedTabs ici retriggerait inutilement au changement d'onglet).
  private readonly statsResource = rxResource<AdminStatsResponse, string | undefined>({
    params: () => this.http.authenticated() ? this.state.selectedDay() : undefined,
    stream: ({ params: day }) => this.http.getStats(day),
  });
  readonly adminStats = computed(() => this.statsResource.value() ?? null);
  readonly statsLoading = computed(() => this.statsResource.isLoading());

  // « Stats par défi » de l'onglet Défis — endpoint séparé, gardé sur hasVisited('defis').
  private readonly challengeStatsResource = rxResource<ChallengeStatsResponse, number | undefined>({
    params: () => (this.http.authenticated() && this.state.hasVisited('defis'))
      ? this.state.challengesReloadTrigger()
      : undefined,
    stream: () => this.http.getChallengeStats(),
  });
  readonly challengeStats = computed<ChallengeStatsDto[]>(() => this.challengeStatsResource.value()?.challenges ?? []);
  readonly challengeStatsLoading = computed(() => this.challengeStatsResource.isLoading());

  private readonly challengesResource = rxResource<ChallengeDto[], number | undefined>({
    params: () => (this.http.authenticated() && this.state.hasVisited('defis'))
      ? this.state.challengesReloadTrigger()
      : undefined,
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
  refreshPreviews() { return this.http.refreshPreviews(); }
  updateTrackCooldownDays(days: number) { return this.http.updateTrackCooldownDays(days); }
  addTrack(deezerTrackId: number) { return this.http.addTrack(deezerTrackId); }
  updateTrack(id: number, deezerTrackId: number) { return this.http.updateTrack(id, deezerTrackId); }
  deleteTrack(id: number) { return this.http.deleteTrack(id); }
  searchDeezer(q: string) { return this.http.searchDeezer(q); }
}
