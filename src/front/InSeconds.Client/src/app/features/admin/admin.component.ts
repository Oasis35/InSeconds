import { Component, inject, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { lastValueFrom, of, timer, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminStatsResponse, ChallengeStatsDto, DailyKpisDto } from '../../api/api.generated';
import { BUILD_TIME } from '../../core/build-info';

interface ResetResult { deleted: number; date: string; }
interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
interface PoolTrackDto { id: number; artist: string; title: string; deezerTrackId: number; hasPreview?: boolean | null; }
interface PoolTracksResponse { available: PoolTrackDto[]; used: PoolTrackDto[]; }
interface ChallengeDto { id: number; date: string; tracks: TrackDto[]; }
interface DeezerTrackInfo { artist: string; title: string; previewUrl: string | null; deezerTrackId: number; coverHash?: string | null; }

type Tab = 'dashboard' | 'pool' | 'defis' | 'actions';

@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/admin`;
  private readonly storageKey = 'admin_token';
  readonly buildTime = BUILD_TIME;

  authenticated = signal(false);
  loginStatus = signal<'idle' | 'loading' | 'error'>('idle');
  resetStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  resetResult = signal<ResetResult | null>(null);
  generateStatus = signal<'idle' | 'loading' | 'success' | 'already' | 'pool_insufficient' | 'error'>('idle');
  activeTab = signal<Tab>('dashboard');

  addToPoolStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');

  addModalOpen = signal(false);
  addModalTrack = signal<DeezerTrackInfo | null>(null);
  addModalTrackIdToUpdate = signal<number | null>(null);
  quickAddingId = signal<number | null>(null);
  modalPlaying = signal(false);
  modalProgress = signal(0);
  private modalAudio: HTMLAudioElement | null = null;
  private modalRafId: number | null = null;

  expandedChallenges = signal<Set<number>>(new Set());
  selectedDay = signal<string>(new Date().toISOString().slice(0, 10));
  challengeMonth = signal<string>(new Date().toISOString().slice(0, 7));

  selectedTrackIds = signal<Set<number>>(new Set());
  deleteModalOpen = signal(false);
  deleteModalTracks = signal<PoolTrackDto[]>([]);
  deleteStatus = signal<'idle' | 'loading' | 'error'>('idle');

  readonly poolPageSize = 15;
  allTracksPage = signal(0);
  poolFilterText = signal('');
  poolFilterStatus = signal<'all' | 'available' | 'used'>('all');
  poolFilterPreview = signal<'all' | 'ok' | 'missing'>('all');

  // Signal pour la recherche Deezer dans la modale (remplace poolSearchQuery + Subject)
  poolSearchQuery = signal('');

  // rxResource : recherche Deezer — debounce 300ms pour éviter les requêtes sur chaque frappe
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

  // rxResource : pool de morceaux
  private readonly poolReload = signal(0);
  private readonly poolTracksResource = rxResource<PoolTracksResponse, number>({
    params: () => this.poolReload(),
    stream: () => this.http.get<PoolTracksResponse>(`${this.base}/tracks`),
  });

  readonly poolTracks = computed(() => this.poolTracksResource.value() ?? { available: [], used: [] });
  readonly poolTracksLoading = computed(() => this.poolTracksResource.isLoading());

  // rxResource : stats admin — se relance quand selectedDay change
  private readonly statsResource = rxResource<AdminStatsResponse, string>({
    params: () => this.selectedDay(),
    stream: ({ params: day }) => this.http.get<AdminStatsResponse>(`${this.base}/stats?date=${day}`),
  });

  readonly adminStats = computed(() => this.statsResource.value() ?? null);
  readonly statsLoading = computed(() => this.statsResource.isLoading());

  // rxResource : liste des défis
  private readonly challengesReload = signal(0);
  private readonly challengesResource = rxResource<ChallengeDto[], number>({
    params: () => this.challengesReload(),
    stream: () => this.http.get<ChallengeDto[]>(`${this.base}/challenges`),
  });

  readonly challenges = computed(() => this.challengesResource.value() ?? []);

  readonly challengeListMonths = computed(() => {
    const months = [...new Set(this.challenges().map(c => c.date.slice(0, 7)))].sort().reverse();
    return months;
  });

  readonly challengesListForMonth = computed(() =>
    this.challenges().filter(c => c.date.slice(0, 7) === this.challengeMonth())
  );

  readonly challengeMonths = computed(() => {
    const months = [...new Set(this.adminStats()?.challenges.map(c => new Date(c.date).toISOString().slice(0, 7)) ?? [])].sort().reverse();
    return months;
  });

  readonly challengesForMonth = computed(() =>
    (this.adminStats()?.challenges ?? []).filter(c => new Date(c.date).toISOString().slice(0, 7) === this.challengeMonth())
  );

  readonly canGoPrevChallengeMonth = computed(() => {
    const months = this.challengeMonths();
    return months.indexOf(this.challengeMonth()) < months.length - 1;
  });

  readonly canGoNextChallengeMonth = computed(() => {
    const months = this.challengeMonths();
    return months.indexOf(this.challengeMonth()) > 0;
  });

  // Check auth au démarrage
  constructor() {
    lastValueFrom(this.http.get(`${this.base}/me`)).then(() => {
      this.authenticated.set(true);
    }).catch(() => {
      this.authenticated.set(false);
    });

    effect(() => {
      const months = [...new Set([...this.challengeMonths(), ...this.challengeListMonths()])].sort().reverse();
      if (months.length > 0 && !months.includes(this.challengeMonth())) {
        this.challengeMonth.set(months[0]);
      }
    });
  }

  allTracks = computed(() => {
    const available = this.poolTracks().available.map(t => ({ ...t, isAvailable: true }));
    const used = this.poolTracks().used.map(t => ({ ...t, isAvailable: false, hasPreview: null as boolean | null }));
    return [...available, ...used];
  });

  filteredTracks = computed(() => {
    const text = this.poolFilterText().toLowerCase().trim();
    const status = this.poolFilterStatus();
    const preview = this.poolFilterPreview();
    return this.allTracks().filter(t => {
      if (text && !t.artist.toLowerCase().includes(text) && !t.title.toLowerCase().includes(text)) return false;
      if (status === 'available' && !t.isAvailable) return false;
      if (status === 'used' && t.isAvailable) return false;
      if (preview === 'ok' && t.hasPreview !== true) return false;
      if (preview === 'missing' && t.hasPreview !== false) return false;
      return true;
    });
  });

  allTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredTracks().length / this.poolPageSize)));

  pagedAllTracks = computed(() => {
    const page = this.allTracksPage();
    return this.filteredTracks().slice(page * this.poolPageSize, (page + 1) * this.poolPageSize);
  });

  totalPlayers = computed(() =>
    (this.adminStats()?.dailyActivity ?? []).reduce((s, d) => s + d.playerCount, 0));

  maxDailyPlayers = computed(() =>
    Math.max(0, ...(this.adminStats()?.dailyActivity ?? []).map(d => d.playerCount)));

  password = '';

  login(): void {
    this.loginStatus.set('loading');
    this.http.post<{ token: string }>(`${this.base}/login`, { password: this.password }).subscribe({
      next: res => {
        localStorage.setItem(this.storageKey, res.token);
        this.authenticated.set(true);
        this.loginStatus.set('idle');
        this.password = '';
        this.reloadAll();
      },
      error: () => this.loginStatus.set('error'),
    });
  }

  private reloadAll(): void {
    this.challengesReload.update(v => v + 1);
    this.poolReload.update(v => v + 1);
    // statsResource se relance automatiquement si selectedDay change, sinon on force un reload
    this.statsResource.reload();
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
    this.authenticated.set(false);
  }

  generateToday(): void {
    this.generateStatus.set('loading');
    this.http.post(`${this.base}/generate-today`, {}).subscribe({
      next: () => {
        this.generateStatus.set('success');
        this.reloadAll();
        setTimeout(() => this.generateStatus.set('idle'), 3000);
      },
      error: (err) => {
        if (err.status === 409) this.generateStatus.set('already');
        else if (err.status === 422) this.generateStatus.set('pool_insufficient');
        else this.generateStatus.set('error');
        setTimeout(() => this.generateStatus.set('idle'), 3000);
      },
    });
  }

  reset(): void {
    this.resetStatus.set('loading');
    this.resetResult.set(null);
    this.http.delete<ResetResult>(`${this.base}/reset-today`).subscribe({
      next: res => {
        this.resetResult.set(res);
        this.resetStatus.set('success');
        this.statsResource.reload();
      },
      error: () => this.resetStatus.set('error'),
    });
  }

  toggleChallenge(id: number): void {
    const set = new Set(this.expandedChallenges());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.expandedChallenges.set(set);
  }

  shiftChallengeMonth(delta: number): void {
    const months = this.challengeMonths();
    const idx = months.indexOf(this.challengeMonth());
    const next = idx - delta;
    if (next >= 0 && next < months.length) this.challengeMonth.set(months[next]);
  }

  formatChallengeMonth(ym: string): string {
    const [y, m] = ym.split('-');
    const names = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    return `${names[+m - 1]} ${y}`;
  }

  activityBarHeight(count: number): number {
    const max = this.maxDailyPlayers();
    return max === 0 ? 0 : Math.round((count / max) * 100);
  }

  activityBarHeightPx(count: number): string {
    const max = this.maxDailyPlayers();
    if (max === 0) return '2px';
    const pct = count / max;
    return count === 0 ? '2px' : `${Math.max(4, Math.round(pct * 64))}px`;
  }

  toIso(d: Date | string): string {
    if (typeof d === 'string') return d.slice(0, 10);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  isBarSelected(date: Date | string): boolean {
    return this.selectedDay() === this.toIso(date);
  }

  selectDay(date: Date | string): void {
    this.selectedDay.set(this.toIso(date));
    // statsResource se relance automatiquement car il dépend de selectedDay()
  }

  shiftSelectedDay(delta: number): void {
    const dates = (this.adminStats()?.availableDates ?? []).map(d => this.toIso(d));
    if (dates.length === 0) return;
    const current = this.selectedDay();
    const idx = dates.indexOf(current);
    // availableDates est DESC (plus récent en premier), donc +1 = aller vers le passé
    const next = idx === -1 ? 0 : idx - delta;
    if (next >= 0 && next < dates.length) {
      this.selectedDay.set(dates[next]);
      // statsResource se relance automatiquement car il dépend de selectedDay()
    }
  }

  canGoToPrevDay(): boolean {
    const dates = (this.adminStats()?.availableDates ?? []).map(d => this.toIso(d));
    if (dates.length === 0) return false;
    const idx = dates.indexOf(this.selectedDay());
    return idx < dates.length - 1;
  }

  canGoToNextDay(): boolean {
    const dates = (this.adminStats()?.availableDates ?? []).map(d => this.toIso(d));
    if (dates.length === 0) return false;
    const idx = dates.indexOf(this.selectedDay());
    return idx > 0;
  }

  isSelectedDayToday(): boolean {
    return this.selectedDay() === new Date().toISOString().slice(0, 10);
  }

  formatSelectedDay(): string {
    const d = this.selectedDay();
    if (!d) return '';
    const date = new Date(d + 'T12:00:00Z');
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  formatActivityDate(d: Date | string): string {
    const date = new Date(this.toIso(d) + 'T12:00:00Z');
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  completionRateColor(rate: number): string {
    if (rate >= 70) return 'text-green-400';
    if (rate >= 40) return 'text-yellow-400';
    return 'text-red-400';
  }

  rateColor(rate: number): string {
    if (rate >= 60) return 'text-green-400';
    if (rate >= 30) return 'text-yellow-400';
    return 'text-red-400';
  }

  rateBarColor(rate: number): string {
    if (rate >= 60) return 'bg-green-500';
    if (rate >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  onPoolSearchChange(q: string): void {
    this.poolSearchQuery.set(q);
    this.allTracksPage.set(0);
  }

  openAddModal(track: DeezerTrackInfo | null, trackIdToUpdate: number | null = null, prefillSearch: string = ''): void {
    this.stopModalAudio();
    this.addToPoolStatus.set('idle');
    this.modalProgress.set(0);
    this.addModalTrack.set(track);
    this.addModalTrackIdToUpdate.set(trackIdToUpdate);
    if (prefillSearch) {
      this.poolSearchQuery.set(prefillSearch);
    }
    this.addModalOpen.set(true);
  }

  selectModalTrack(track: DeezerTrackInfo): void {
    if (this.addModalTrack()?.deezerTrackId === track.deezerTrackId) return;
    this.stopModalAudio();
    this.addToPoolStatus.set('idle');
    this.modalProgress.set(0);
    this.addModalTrack.set(track);
  }

  closeAddModal(): void {
    this.stopModalAudio();
    this.addModalOpen.set(false);
    this.addModalTrack.set(null);
    this.addModalTrackIdToUpdate.set(null);
    this.addToPoolStatus.set('idle');
    this.modalProgress.set(0);
    this.poolSearchQuery.set('');
  }

  toggleModalPreview(): void {
    const track = this.addModalTrack();
    if (!track?.previewUrl) return;

    if (this.modalPlaying()) {
      this.modalAudio?.pause();
      this.modalPlaying.set(false);
      if (this.modalRafId !== null) { cancelAnimationFrame(this.modalRafId); this.modalRafId = null; }
      return;
    }

    if (!this.modalAudio || this.modalAudio.src !== track.previewUrl) {
      this.stopModalAudio();
      this.modalAudio = new Audio(track.previewUrl);
      this.modalAudio.onended = () => {
        this.modalPlaying.set(false);
        this.modalProgress.set(100);
        if (this.modalRafId !== null) { cancelAnimationFrame(this.modalRafId); this.modalRafId = null; }
      };
    }

    this.modalAudio.play().then(() => {
      this.modalPlaying.set(true);
      const tick = () => {
        const audio = this.modalAudio;
        if (!audio || audio.paused) return;
        const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        this.modalProgress.set(pct);
        this.modalRafId = requestAnimationFrame(tick);
      };
      this.modalRafId = requestAnimationFrame(tick);
    }).catch(() => {});
  }

  private stopModalAudio(): void {
    if (this.modalRafId !== null) { cancelAnimationFrame(this.modalRafId); this.modalRafId = null; }
    if (this.modalAudio) { this.modalAudio.pause(); this.modalAudio.onended = null; this.modalAudio = null; }
    this.modalPlaying.set(false);
  }

  quickAddToPool(track: DeezerTrackInfo): void {
    this.quickAddingId.set(track.deezerTrackId);
    this.http.post(`${this.base}/tracks`, { deezerTrackId: track.deezerTrackId }).subscribe({
      next: () => { this.quickAddingId.set(null); this.poolReload.update(v => v + 1); },
      error: () => this.quickAddingId.set(null),
    });
  }

  addToPoolFromModal(andClose: boolean): void {
    const track = this.addModalTrack();
    if (!track) return;
    this.addToPoolStatus.set('loading');

    const trackIdToUpdate = this.addModalTrackIdToUpdate();
    const req$ = trackIdToUpdate !== null
      ? this.http.put(`${this.base}/tracks/${trackIdToUpdate}`, { deezerTrackId: track.deezerTrackId })
      : this.http.post(`${this.base}/tracks`, { deezerTrackId: track.deezerTrackId });

    req$.subscribe({
      next: () => {
        this.addToPoolStatus.set('success');
        this.poolReload.update(v => v + 1);
        if (andClose) {
          this.poolSearchQuery.set('');
          this.closeAddModal();
        } else {
          setTimeout(() => {
            if (this.addToPoolStatus() === 'success') this.addToPoolStatus.set('idle');
          }, 2000);
        }
      },
      error: () => {
        this.addToPoolStatus.set('error');
        setTimeout(() => {
          if (this.addToPoolStatus() === 'error') this.addToPoolStatus.set('idle');
        }, 3000);
      },
    });
  }

  setPoolFilter(text: string): void {
    this.poolFilterText.set(text);
    this.allTracksPage.set(0);
  }

  setPoolFilterStatus(v: 'all' | 'available' | 'used'): void {
    this.poolFilterStatus.set(v);
    this.allTracksPage.set(0);
  }

  setPoolFilterPreview(v: 'all' | 'ok' | 'missing'): void {
    this.poolFilterPreview.set(v);
    this.allTracksPage.set(0);
  }

  toggleSelection(id: number): void {
    const set = new Set(this.selectedTrackIds());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.selectedTrackIds.set(set);
  }

  clearSelection(): void {
    this.selectedTrackIds.set(new Set());
  }

  openDeleteModal(track: PoolTrackDto | null): void {
    if (track) {
      this.deleteModalTracks.set([track]);
    } else {
      const available = this.poolTracks().available;
      this.deleteModalTracks.set(available.filter(t => this.selectedTrackIds().has(t.id)));
    }
    this.deleteStatus.set('idle');
    this.deleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    this.deleteModalOpen.set(false);
    this.deleteModalTracks.set([]);
    this.deleteStatus.set('idle');
  }

  confirmDelete(): void {
    const tracks = this.deleteModalTracks();
    if (tracks.length === 0) return;
    this.deleteStatus.set('loading');

    const requests = tracks.map(t =>
      lastValueFrom(this.http.delete(`${this.base}/tracks/${t.id}`)).then(() => t.id)
    );

    Promise.all(requests).then(() => {
      const deleted = new Set(tracks.map(t => t.id));
      this.selectedTrackIds.set(new Set([...this.selectedTrackIds()].filter(id => !deleted.has(id))));
      this.closeDeleteModal();
      this.poolReload.update(v => v + 1);
    }).catch(() => {
      this.deleteStatus.set('error');
    });
  }

}
