import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ResetResult { deleted: number; date: string; }
interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
interface ChallengeDto { id: number; date: string; tracks: TrackDto[]; }
interface DeezerTrackInfo { artist: string; title: string; previewUrl: string | null; deezerTrackId: number; }

@Component({
  selector: 'app-admin',
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-gray-900 text-white flex flex-col items-center gap-8 p-8">
      <h1 class="text-3xl font-bold">Admin</h1>

      @if (!authenticated()) {
        <div class="bg-gray-800 rounded-xl p-8 flex flex-col items-center gap-6 w-full max-w-md">
          <h2 class="text-xl font-semibold">Connexion</h2>
          <input type="password" [(ngModel)]="password" placeholder="Mot de passe admin"
            (keydown.enter)="login()"
            class="w-full bg-gray-700 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500" />
          <button (click)="login()" [disabled]="loginStatus() === 'loading'"
            class="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors">
            @if (loginStatus() === 'loading') { Connexion... } @else { Se connecter }
          </button>
          @if (loginStatus() === 'error') {
            <p class="text-red-400 text-sm">Mot de passe incorrect.</p>
          }
        </div>
      } @else {

        <!-- Reset -->
        <div class="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-4 w-full max-w-2xl">
          <h2 class="text-lg font-semibold">Reset des parties du jour</h2>
          <button (click)="reset()" [disabled]="resetStatus() === 'loading'"
            class="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 px-6 rounded-lg transition-colors">
            @if (resetStatus() === 'loading') { Réinitialisation... } @else { Réinitialiser }
          </button>
          @if (resetStatus() === 'success' && resetResult()) {
            <p class="text-green-400 text-sm">{{ resetResult()!.deleted }} session(s) supprimée(s) — {{ resetResult()!.date }}</p>
          }
          @if (resetStatus() === 'error') {
            <p class="text-red-400 text-sm">Aucun défi trouvé pour aujourd'hui.</p>
          }
        </div>

        <!-- Nouveau défi -->
        <div class="bg-gray-800 rounded-xl p-6 flex flex-col gap-4 w-full max-w-2xl">
          <h2 class="text-lg font-semibold">Nouveau défi</h2>

          <div class="flex gap-4 items-center">
            <label class="text-sm text-gray-400 w-16">Date</label>
            <input type="date" [(ngModel)]="newChallengeDate"
              class="bg-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500" />
          </div>

          <!-- Recherche tracks -->
          <div class="flex flex-col gap-2">
            <label class="text-sm text-gray-400">Ajouter des tracks (max 3)</label>
            @if (selectedTracks().length < 3) {
              <input type="text" [(ngModel)]="searchQuery" (ngModelChange)="onSearchChange($event)"
                placeholder="Rechercher artiste ou titre..."
                class="bg-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500" />
              @if (searchResults().length > 0) {
                <ul class="bg-gray-700 rounded-lg divide-y divide-gray-600 max-h-48 overflow-y-auto">
                  @for (track of searchResults(); track track.title + track.artist) {
                    <li (click)="addTrack(track)"
                      class="px-4 py-2 hover:bg-gray-600 cursor-pointer flex justify-between items-center">
                      <span>{{ track.artist }} — {{ track.title }}</span>
                      <span class="text-purple-400 text-xs">+ ajouter</span>
                    </li>
                  }
                </ul>
              }
              @if (searchLoading()) {
                <p class="text-gray-400 text-sm">Recherche...</p>
              }
            }

            <!-- Tracks sélectionnées -->
            @if (selectedTracks().length > 0) {
              <ul class="flex flex-col gap-2 mt-2">
                @for (track of selectedTracks(); track track.title + track.artist; let i = $index) {
                  <li class="bg-gray-700 rounded-lg px-4 py-2 flex justify-between items-center">
                    <span class="text-sm text-gray-300">{{ i + 1 }}. {{ track.artist }} — {{ track.title }}</span>
                    <button (click)="removeTrack(i)" class="text-red-400 hover:text-red-300 text-xs ml-4">✕</button>
                  </li>
                }
              </ul>
            }
          </div>

          <button (click)="createChallenge()"
            [disabled]="createStatus() === 'loading' || selectedTracks().length === 0 || !newChallengeDate"
            class="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-2 px-6 rounded-lg transition-colors self-start">
            @if (createStatus() === 'loading') { Création... } @else { Créer le défi }
          </button>

          @if (createStatus() === 'success') {
            <p class="text-green-400 text-sm">Défi créé avec succès !</p>
          }
          @if (createStatus() === 'error') {
            <p class="text-red-400 text-sm">{{ createError() }}</p>
          }
        </div>

        <!-- Liste des défis -->
        <div class="bg-gray-800 rounded-xl p-6 flex flex-col gap-4 w-full max-w-2xl">
          <h2 class="text-lg font-semibold">Défis programmés</h2>
          @if (challenges().length === 0) {
            <p class="text-gray-400 text-sm">Aucun défi enregistré.</p>
          } @else {
            <table class="w-full text-sm">
              <thead>
                <tr class="text-gray-400 text-left border-b border-gray-700">
                  <th class="pb-2">Date</th>
                  <th class="pb-2">Tracks</th>
                </tr>
              </thead>
              <tbody>
                @for (c of challenges(); track c.id) {
                  <tr class="border-b border-gray-700 last:border-0">
                    <td class="py-2 pr-4 font-mono">{{ c.date }}</td>
                    <td class="py-2 text-gray-300">
                      @for (t of c.tracks; track t.position) {
                        <div>{{ t.position }}. {{ t.artist }} — {{ t.title }}</div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <button (click)="logout()" class="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          Se déconnecter
        </button>
      }
    </div>
  `,
})
export class AdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/admin`;
  private readonly search$ = new Subject<string>();
  private readonly storageKey = 'admin_token';

  authenticated = signal(false);
  loginStatus = signal<'idle' | 'loading' | 'error'>('idle');
  resetStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  resetResult = signal<ResetResult | null>(null);
  createStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  createError = signal('');
  challenges = signal<ChallengeDto[]>([]);
  searchResults = signal<DeezerTrackInfo[]>([]);
  searchLoading = signal(false);
  selectedTracks = signal<DeezerTrackInfo[]>([]);

  password = '';
  searchQuery = '';
  newChallengeDate = '';

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.length < 2) { this.searchResults.set([]); return []; }
        this.searchLoading.set(true);
        return this.http.get<DeezerTrackInfo[]>(`${this.base}/deezer-search?q=${encodeURIComponent(q)}`);
      }),
    ).subscribe({
      next: results => { this.searchResults.set(results ?? []); this.searchLoading.set(false); },
      error: () => { this.searchResults.set([]); this.searchLoading.set(false); },
    });

    this.http.get(`${this.base}/me`).subscribe({
      next: () => { this.authenticated.set(true); this.loadChallenges(); },
      error: () => this.authenticated.set(false),
    });
  }

  login(): void {
    this.loginStatus.set('loading');
    this.http.post<{ token: string }>(`${this.base}/login`, { password: this.password }).subscribe({
      next: res => {
        localStorage.setItem(this.storageKey, res.token);
        this.authenticated.set(true);
        this.loginStatus.set('idle');
        this.password = '';
        this.loadChallenges();
      },
      error: () => this.loginStatus.set('error'),
    });
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
    this.authenticated.set(false);
  }

  reset(): void {
    this.resetStatus.set('loading');
    this.resetResult.set(null);
    this.http.delete<ResetResult>(`${this.base}/reset-today`).subscribe({
      next: res => { this.resetResult.set(res); this.resetStatus.set('success'); },
      error: () => this.resetStatus.set('error'),
    });
  }

  onSearchChange(q: string): void {
    this.search$.next(q);
  }

  addTrack(track: DeezerTrackInfo): void {
    if (this.selectedTracks().length >= 3) return;
    this.selectedTracks.update(tracks => [...tracks, track]);
    this.searchResults.set([]);
    this.searchQuery = '';
  }

  removeTrack(index: number): void {
    this.selectedTracks.update(tracks => tracks.filter((_, i) => i !== index));
  }

  createChallenge(): void {
    this.createStatus.set('loading');
    this.createError.set('');
    const body = {
      date: this.newChallengeDate,
      deezerTrackIds: this.selectedTracks().map(t => t.deezerTrackId),
    };
    this.http.post<ChallengeDto>(`${this.base}/challenges`, body).subscribe({
      next: () => {
        this.createStatus.set('success');
        this.selectedTracks.set([]);
        this.newChallengeDate = '';
        this.loadChallenges();
      },
      error: err => {
        this.createStatus.set('error');
        this.createError.set(err.error?.message ?? 'Erreur lors de la création.');
      },
    });
  }

  private loadChallenges(): void {
    this.http.get<ChallengeDto[]>(`${this.base}/challenges`).subscribe({
      next: data => this.challenges.set(data),
      error: () => {},
    });
  }
}
