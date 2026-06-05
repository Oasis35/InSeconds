import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ResetResult { deleted: number; date: string; }
interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
interface PoolTrackDto { id: number; artist: string; title: string; deezerTrackId: number; }
interface PoolTracksResponse { available: PoolTrackDto[]; used: PoolTrackDto[]; }
interface ChallengeDto { id: number; date: string; tracks: TrackDto[]; }
interface DeezerTrackInfo { artist: string; title: string; previewUrl: string | null; deezerTrackId: number; }

type Tab = 'pool' | 'defis';

@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-900 text-white flex flex-col items-center p-8 gap-6">
      <h1 class="text-2xl font-bold tracking-tight">Admin</h1>

      @if (!authenticated()) {
        <div class="bg-gray-800 rounded-xl p-8 flex flex-col items-center gap-6 w-full max-w-sm">
          <h2 class="text-lg font-semibold">Connexion</h2>
          <input type="password" [(ngModel)]="password" placeholder="Mot de passe admin"
            (keydown.enter)="login()"
            class="w-full bg-gray-700 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500" />
          <button (click)="login()" [disabled]="loginStatus() === 'loading'"
            class="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors">
            @if (loginStatus() === 'loading') { Connexion... } @else { Se connecter }
          </button>
          @if (loginStatus() === 'error') {
            <p class="text-red-400 text-sm">Mot de passe incorrect.</p>
          }
        </div>
        <a routerLink="/" class="text-sm text-gray-500 hover:text-gray-300 transition-colors">Retour au jeu</a>
      } @else {

        <!-- Onglets -->
        <div class="flex gap-1 bg-gray-800 p-1 rounded-lg w-full max-w-2xl">
          <button (click)="activeTab.set('pool')"
            [class]="activeTab() === 'pool'
              ? 'flex-1 py-2 rounded-md text-sm font-medium bg-gray-700 text-white transition-colors'
              : 'flex-1 py-2 rounded-md text-sm font-medium text-gray-400 hover:text-white transition-colors'">
            Pool ({{ poolTracks().available.length + poolTracks().used.length }})
          </button>
          <button (click)="activeTab.set('defis')"
            [class]="activeTab() === 'defis'
              ? 'flex-1 py-2 rounded-md text-sm font-medium bg-gray-700 text-white transition-colors'
              : 'flex-1 py-2 rounded-md text-sm font-medium text-gray-400 hover:text-white transition-colors'">
            Défis ({{ challenges().length }})
          </button>
        </div>

        <!-- Onglet Pool -->
        @if (activeTab() === 'pool') {
          <div class="flex flex-col gap-4 w-full max-w-2xl">

            <!-- Ajouter -->
            <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
              <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Ajouter au pool</h2>
              <input type="text" [(ngModel)]="poolSearchQuery" (ngModelChange)="onPoolSearchChange($event)"
                placeholder="Rechercher artiste ou titre..."
                class="bg-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
              @if (poolSearchLoading()) {
                <p class="text-gray-500 text-xs">Recherche...</p>
              }
              @if (poolSearchResults().length > 0) {
                <ul class="bg-gray-700 rounded-lg divide-y divide-gray-600 max-h-48 overflow-y-auto">
                  @for (track of poolSearchResults(); track track.deezerTrackId) {
                    <li (click)="addToPoolStatus() !== 'loading' && addToPool(track)"
                      [class]="addToPoolStatus() === 'loading'
                        ? 'px-4 py-2.5 flex justify-between items-center text-sm opacity-50 cursor-not-allowed'
                        : 'px-4 py-2.5 hover:bg-gray-600 cursor-pointer flex justify-between items-center text-sm'">
                      <span>{{ track.artist }} — {{ track.title }}</span>
                      <span class="text-purple-400 text-xs shrink-0 ml-4">
                        @if (addToPoolStatus() === 'loading') { ... } @else { Ajouter au pool }
                      </span>
                    </li>
                  }
                </ul>
              }
              @if (addToPoolStatus() === 'success') {
                <p class="text-green-400 text-xs">Morceau ajouté.</p>
              }
              @if (addToPoolStatus() === 'error') {
                <p class="text-red-400 text-xs">Impossible d'ajouter ce morceau.</p>
              }
            </div>

            <!-- Disponibles -->
            <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
              <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Disponibles <span class="text-gray-500 font-normal">({{ poolTracks().available.length }})</span>
              </h2>
              @if (poolTracks().available.length === 0) {
                <p class="text-gray-500 text-sm">Aucun morceau disponible.</p>
              } @else {
                <ul class="flex flex-col gap-1">
                  @for (t of poolTracks().available; track t.id) {
                    <li class="text-sm text-gray-300 px-3 py-1.5 bg-gray-700 rounded-lg">{{ t.artist }} — {{ t.title }}</li>
                  }
                </ul>
              }
            </div>

            <!-- Utilisés -->
            <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
              <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Déjà utilisés <span class="font-normal">({{ poolTracks().used.length }})</span>
              </h2>
              @if (poolTracks().used.length === 0) {
                <p class="text-gray-600 text-sm">Aucun morceau utilisé.</p>
              } @else {
                <ul class="flex flex-col gap-1">
                  @for (t of poolTracks().used; track t.id) {
                    <li class="text-sm text-gray-600 px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700">{{ t.artist }} — {{ t.title }}</li>
                  }
                </ul>
              }
            </div>

          </div>
        }

        <!-- Onglet Défis -->
        @if (activeTab() === 'defis') {
          <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3 w-full max-w-2xl">
            <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Historique</h2>
            @if (challenges().length === 0) {
              <p class="text-gray-400 text-sm">Aucun défi enregistré.</p>
            } @else {
              <ul class="flex flex-col divide-y divide-gray-700">
                @for (c of challenges(); track c.id) {
                  <li class="py-3">
                    <p class="font-mono text-sm text-white mb-1">{{ c.date }}</p>
                    <ul class="flex flex-col gap-0.5">
                      @for (t of c.tracks; track t.position) {
                        <li class="text-xs text-gray-400">{{ t.position }}. {{ t.artist }} — {{ t.title }}</li>
                      }
                    </ul>
                  </li>
                }
              </ul>
            }
          </div>
        }

        <!-- Actions bas de page -->
        <div class="flex flex-col items-center gap-3 pt-2 w-full max-w-2xl">
          <div class="flex items-center gap-3">
            <button (click)="generateToday()" [disabled]="generateStatus() === 'loading'"
              class="text-indigo-400 hover:text-indigo-300 disabled:opacity-50 text-xs transition-colors">
              @if (generateStatus() === 'loading') { Génération... } @else { Générer le défi du jour }
            </button>
            @if (generateStatus() === 'success') {
              <span class="text-green-400 text-xs">Défi généré.</span>
            }
            @if (generateStatus() === 'already') {
              <span class="text-gray-400 text-xs">Défi du jour déjà généré.</span>
            }
            @if (generateStatus() === 'error') {
              <span class="text-red-400 text-xs">Erreur lors de la génération.</span>
            }
          </div>
          <div class="flex items-center gap-3">
            <button (click)="reset()" [disabled]="resetStatus() === 'loading'"
              class="text-red-500 hover:text-red-400 disabled:opacity-50 text-xs transition-colors">
              @if (resetStatus() === 'loading') { Réinitialisation... } @else { Réinitialiser les parties du jour }
            </button>
            @if (resetStatus() === 'success' && resetResult()) {
              <span class="text-green-400 text-xs">{{ resetResult()!.deleted }} supprimée(s)</span>
            }
            @if (resetStatus() === 'error') {
              <span class="text-red-400 text-xs">Aucun défi trouvé.</span>
            }
          </div>
          <button (click)="logout()" class="text-gray-600 hover:text-gray-400 text-xs transition-colors">
            Se déconnecter
          </button>
        </div>

      }
    </div>
  `,
})
export class AdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/admin`;
  private readonly poolSearch$ = new Subject<string>();
  private readonly storageKey = 'admin_token';

  authenticated = signal(false);
  loginStatus = signal<'idle' | 'loading' | 'error'>('idle');
  resetStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  resetResult = signal<ResetResult | null>(null);
  generateStatus = signal<'idle' | 'loading' | 'success' | 'already' | 'error'>('idle');
  challenges = signal<ChallengeDto[]>([]);
  activeTab = signal<Tab>('pool');

  poolTracks = signal<PoolTracksResponse>({ available: [], used: [] });
  poolSearchResults = signal<DeezerTrackInfo[]>([]);
  poolSearchLoading = signal(false);
  addToPoolStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');

  password = '';
  poolSearchQuery = '';

  ngOnInit(): void {
    this.poolSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.length < 2) { this.poolSearchResults.set([]); return []; }
        this.poolSearchLoading.set(true);
        return this.http.get<DeezerTrackInfo[]>(`${this.base}/deezer-search?q=${encodeURIComponent(q)}`);
      }),
    ).subscribe({
      next: results => { this.poolSearchResults.set(results ?? []); this.poolSearchLoading.set(false); },
      error: () => { this.poolSearchResults.set([]); this.poolSearchLoading.set(false); },
    });

    this.http.get(`${this.base}/me`).subscribe({
      next: () => { this.authenticated.set(true); this.loadChallenges(); this.loadPool(); },
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
        this.loadPool();
      },
      error: () => this.loginStatus.set('error'),
    });
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
        this.loadChallenges();
        this.loadPool();
        setTimeout(() => this.generateStatus.set('idle'), 3000);
      },
      error: (err) => {
        this.generateStatus.set(err.status === 409 ? 'already' : 'error');
        setTimeout(() => this.generateStatus.set('idle'), 3000);
      },
    });
  }

  reset(): void {
    this.resetStatus.set('loading');
    this.resetResult.set(null);
    this.http.delete<ResetResult>(`${this.base}/reset-today`).subscribe({
      next: res => { this.resetResult.set(res); this.resetStatus.set('success'); },
      error: () => this.resetStatus.set('error'),
    });
  }

  onPoolSearchChange(q: string): void {
    this.poolSearch$.next(q);
  }

  addToPool(track: DeezerTrackInfo): void {
    this.addToPoolStatus.set('loading');
    this.http.post(`${this.base}/tracks`, { deezerTrackId: track.deezerTrackId }).subscribe({
      next: () => {
        this.addToPoolStatus.set('success');
        this.poolSearchResults.set([]);
        this.poolSearchQuery = '';
        this.loadPool();
        setTimeout(() => this.addToPoolStatus.set('idle'), 3000);
      },
      error: () => this.addToPoolStatus.set('error'),
    });
  }

  private loadChallenges(): void {
    this.http.get<ChallengeDto[]>(`${this.base}/challenges`).subscribe({
      next: data => this.challenges.set(data),
      error: () => {},
    });
  }

  private loadPool(): void {
    this.http.get<PoolTracksResponse>(`${this.base}/tracks`).subscribe({
      next: data => this.poolTracks.set(data),
      error: () => {},
    });
  }
}
