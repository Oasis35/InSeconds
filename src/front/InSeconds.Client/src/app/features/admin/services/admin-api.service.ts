import { Injectable, inject, computed } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of, timer, switchMap } from 'rxjs';
import { AdminStatsResponse, GetAllowedEmailsResponse } from '../../../api/api.generated';
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

  // `authenticated` fait partie de `params` (pas juste un garde dans `stream`) exprès : ces
  // resources doivent aussi se redéclencher automatiquement dès que `login()` bascule le
  // signal, sans attendre le `reloadAll()` explicite. Avant ce fix, ces requêtes partaient
  // dès la construction du composant (donc dès l'écran de login, sans token) : la réponse
  // 401 mettait la resource en état d'erreur, et lire `.value()` sur une resource en erreur
  // dans un `computed()` lève une `ResourceValueError` non catchée qui casse le rendu de
  // toute la page (bug pré-existant, découvert lors de l'implémentation des comptes
  // utilisateurs — cf. piège correspondant dans CLAUDE.md).
  private readonly poolTracksResource = rxResource<PoolTracksResponse, { trigger: number; authed: boolean }>({
    params: () => ({ trigger: this.state.poolReloadTrigger(), authed: this.http.authenticated() }),
    stream: ({ params }) => (params.authed ? this.http.getPoolTracks() : of({ available: [], used: [] })),
  });
  readonly poolTracks = computed(() => this.poolTracksResource.value() ?? { available: [], used: [] });
  readonly poolTracksLoading = computed(() => this.poolTracksResource.isLoading());

  private readonly statsResource = rxResource<AdminStatsResponse | null, { day: string; authed: boolean }>({
    params: () => ({ day: this.state.selectedDay(), authed: this.http.authenticated() }),
    stream: ({ params }) => (params.authed ? this.http.getStats(params.day) : of(null)),
  });
  readonly adminStats = computed(() => this.statsResource.value() ?? null);
  readonly statsLoading = computed(() => this.statsResource.isLoading());

  private readonly challengesResource = rxResource<ChallengeDto[], { trigger: number; authed: boolean }>({
    params: () => ({ trigger: this.state.challengesReloadTrigger(), authed: this.http.authenticated() }),
    stream: ({ params }) => (params.authed ? this.http.getChallenges() : of([] as ChallengeDto[])),
  });
  readonly challenges = computed(() => this.challengesResource.value() ?? []);

  private readonly allowedEmailsResource = rxResource<GetAllowedEmailsResponse, { trigger: number; authed: boolean }>({
    params: () => ({ trigger: this.state.allowedEmailsReloadTrigger(), authed: this.http.authenticated() }),
    stream: ({ params }) => (params.authed ? this.http.getAllowedEmails() : of({ emails: [] })),
  });
  readonly allowedEmails = computed(() => this.allowedEmailsResource.value()?.emails ?? []);
  readonly allowedEmailsLoading = computed(() => this.allowedEmailsResource.isLoading());

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
  reloadAllowedEmails(): void { this.state.reloadAllowedEmails(); }
  addAllowedEmail(email: string) { return this.http.addAllowedEmail(email); }
  removeAllowedEmail(id: number) { return this.http.removeAllowedEmail(id); }
  sendTestEmail(toEmail: string) { return this.http.sendTestEmail(toEmail); }
}
