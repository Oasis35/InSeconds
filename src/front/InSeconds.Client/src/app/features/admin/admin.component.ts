import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminStatsResponse, ChallengeStatsDto, DailyKpisDto } from '../../api/api.generated';

interface ResetResult { deleted: number; date: string; }
interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
interface PoolTrackDto { id: number; artist: string; title: string; deezerTrackId: number; hasPreview?: boolean | null; }
interface PoolTracksResponse { available: PoolTrackDto[]; used: PoolTrackDto[]; }
interface ChallengeDto { id: number; date: string; tracks: TrackDto[]; }
interface DeezerTrackInfo { artist: string; title: string; previewUrl: string | null; deezerTrackId: number; coverHash?: string | null; }

type Tab = 'dashboard' | 'pool' | 'defis';
type PoolSubTab = 'available' | 'used';

@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink, DecimalPipe],
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
          <button (click)="activeTab.set('dashboard')"
            [class]="activeTab() === 'dashboard'
              ? 'flex-1 py-2 rounded-md text-sm font-medium bg-gray-700 text-white transition-colors'
              : 'flex-1 py-2 rounded-md text-sm font-medium text-gray-400 hover:text-white transition-colors'">
            Dashboard
          </button>
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

        <!-- Onglet Dashboard -->
        @if (activeTab() === 'dashboard') {
          <div class="flex flex-col gap-4 w-full max-w-2xl">

            <!-- Actions principales -->
            <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
              <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Actions</h2>
              <div class="flex flex-col sm:flex-row gap-3">
                <button (click)="generateToday()" [disabled]="generateStatus() === 'loading'"
                  class="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                  @if (generateStatus() === 'loading') {
                    <span class="animate-spin text-base">⏳</span> Génération...
                  } @else {
                    <span>▶</span> Générer le défi du jour
                  }
                </button>
                <button (click)="reset()" [disabled]="resetStatus() === 'loading'"
                  class="flex-1 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                  @if (resetStatus() === 'loading') {
                    Réinitialisation...
                  } @else {
                    <span>↺</span> Réinitialiser les parties du jour
                  }
                </button>
              </div>
              <div class="flex flex-wrap gap-2 min-h-5">
                @if (generateStatus() === 'success') { <span class="text-green-400 text-xs">Défi généré avec succès.</span> }
                @if (generateStatus() === 'already') { <span class="text-yellow-400 text-xs">Le défi du jour est déjà généré.</span> }
                @if (generateStatus() === 'error') { <span class="text-red-400 text-xs">Erreur lors de la génération.</span> }
                @if (resetStatus() === 'success' && resetResult()) { <span class="text-green-400 text-xs">{{ resetResult()!.deleted }} partie(s) supprimée(s).</span> }
                @if (resetStatus() === 'error') { <span class="text-red-400 text-xs">Aucun défi trouvé pour aujourd'hui.</span> }
              </div>
            </div>

            @if (statsLoading()) {
              <div class="bg-gray-800 rounded-xl p-5 flex items-center justify-center h-24">
                <p class="text-gray-500 text-sm">Chargement des stats...</p>
              </div>
            } @else if (adminStats()) {

              <!-- Sélecteur de jour -->
              <div class="bg-gray-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <button (click)="shiftSelectedDay(-1)" [disabled]="!canGoToPrevDay()"
                  class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white text-sm">
                  ‹
                </button>
                <div class="flex flex-col items-center gap-1 flex-1">
                  <span class="text-white font-semibold text-sm">{{ formatSelectedDay() }}</span>
                  @if (isSelectedDayToday()) {
                    <span class="text-xs text-purple-400 font-medium">Aujourd'hui</span>
                  } @else {
                    <span class="text-xs text-gray-500">{{ selectedDay() }}</span>
                  }
                </div>
                <button (click)="shiftSelectedDay(1)" [disabled]="!canGoToNextDay()"
                  class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white text-sm">
                  ›
                </button>
              </div>

              <!-- KPIs du jour sélectionné -->
              @if (adminStats()!['selectedDayKpis']) {
                @let kpis = adminStats()!['selectedDayKpis']!;
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
                    <span class="text-xs text-gray-400 uppercase tracking-wide">Complétés</span>
                    <span class="text-2xl font-bold text-white">{{ kpis.completedCount }}</span>
                    <span class="text-xs text-gray-500">joueur{{ kpis.completedCount > 1 ? 's' : '' }}</span>
                  </div>
                  <div class="bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
                    <span class="text-xs text-gray-400 uppercase tracking-wide">Abandons</span>
                    <span class="text-2xl font-bold" [class]="kpis.abandonedCount > 0 ? 'text-orange-400' : 'text-white'">{{ kpis.abandonedCount }}</span>
                    <span class="text-xs text-gray-500">{{ isSelectedDayToday() ? 'abandonnés' : 'dont pending' }}</span>
                  </div>
                  <div class="bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
                    <span class="text-xs text-gray-400 uppercase tracking-wide">Complétion</span>
                    <span class="text-2xl font-bold" [class]="completionRateColor(kpis.completionRate)">{{ kpis.completionRate | number:'1.0-1' }}%</span>
                    <span class="text-xs text-gray-500">{{ kpis.totalSessions }} session{{ kpis.totalSessions > 1 ? 's' : '' }}</span>
                  </div>
                  <div class="bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
                    <span class="text-xs text-gray-400 uppercase tracking-wide">Score médian</span>
                    @if (kpis.medianScore !== null && kpis.medianScore !== undefined) {
                      <span class="text-2xl font-bold text-purple-400">{{ kpis.medianScore | number:'1.0-0' }}</span>
                    } @else {
                      <span class="text-2xl font-bold text-gray-600">—</span>
                    }
                    <span class="text-xs text-gray-500">pts</span>
                  </div>
                </div>
              } @else {
                <div class="bg-gray-800 rounded-xl p-4 text-center text-gray-500 text-sm">
                  Aucun défi pour ce jour.
                </div>
              }

              <!-- Activité 30 jours -->
              <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
                <div class="flex items-center justify-between">
                  <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Activité — 30 jours</h2>
                  <p class="text-xs text-gray-500">
                    Total <span class="text-white font-medium">{{ totalPlayers() }}</span> —
                    Pic <span class="text-white font-medium">{{ maxDailyPlayers() }}</span>/j
                  </p>
                </div>
                @if (maxDailyPlayers() === 0) {
                  <p class="text-gray-500 text-sm">Aucune partie complétée sur cette période.</p>
                } @else {
                  <div class="flex items-end gap-px h-16">
                    @for (day of adminStats()!.dailyActivity; track day.date) {
                      <button (click)="selectDay(day.date)"
                        class="flex-1 flex flex-col items-center group relative"
                        [title]="toIso(day.date) + ' : ' + day.playerCount + ' joueur(s)'">
                        <div class="w-full rounded-sm transition-all"
                          [class]="isBarSelected(day.date) ? 'bg-purple-400' : 'bg-purple-700 group-hover:bg-purple-500'"
                          [style.height]="activityBarHeightPx(day.playerCount)">
                        </div>
                      </button>
                    }
                  </div>
                  <div class="flex justify-between text-xs text-gray-600">
                    <span>{{ adminStats()!.dailyActivity[0].date }}</span>
                    <span>{{ adminStats()!.dailyActivity[adminStats()!.dailyActivity.length - 1].date }}</span>
                  </div>
                }
              </div>

              <!-- Répartition joueurs -->
              <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
                <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Joueurs</h2>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="bg-gray-700 rounded-lg p-3 flex flex-col gap-1">
                    <span class="text-xs text-gray-400">Guests</span>
                    <span class="text-xl font-bold text-white">{{ adminStats()!.playerBreakdown.totalGuests }}</span>
                  </div>
                  <div class="bg-gray-700 rounded-lg p-3 flex flex-col gap-1">
                    <span class="text-xs text-gray-400">Inscrits</span>
                    <span class="text-xl font-bold text-white">{{ adminStats()!.playerBreakdown.totalRegistered }}</span>
                  </div>
                  <div class="bg-gray-700 rounded-lg p-3 flex flex-col gap-1">
                    <span class="text-xs text-gray-400">Actifs 7j</span>
                    <span class="text-xl font-bold text-purple-400">{{ adminStats()!.playerBreakdown.activeLast7Days }}</span>
                  </div>
                  <div class="bg-gray-700 rounded-lg p-3 flex flex-col gap-1">
                    <span class="text-xs text-gray-400">Actifs 30j</span>
                    <span class="text-xl font-bold text-purple-400">{{ adminStats()!.playerBreakdown.activeLast30Days }}</span>
                  </div>
                </div>
              </div>

              <!-- Stats par défi -->
              <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
                <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Stats par défi</h2>
                @if (adminStats()!.challenges.length === 0) {
                  <p class="text-gray-500 text-sm">Aucun défi.</p>
                } @else {
                  <div class="flex flex-col divide-y divide-gray-700">
                    @for (c of adminStats()!.challenges; track c.id) {
                      <div class="py-3">
                        <button (click)="toggleChallenge(c.id)"
                          class="w-full flex items-center justify-between gap-2 text-left">
                          <div class="flex items-center gap-3">
                            <span class="font-mono text-sm text-white">{{ c.date }}</span>
                            <span class="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
                              {{ c.playerCount }} joueur{{ c.playerCount > 1 ? 's' : '' }}
                            </span>
                            @if (c.abandonedCount + c.pendingCount > 0) {
                              <span class="text-xs text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
                                {{ c.abandonedCount + c.pendingCount }} abandon{{ (c.abandonedCount + c.pendingCount) > 1 ? 's' : '' }}
                              </span>
                            }
                          </div>
                          <div class="flex items-center gap-4 text-xs text-gray-400">
                            @if (c.scoreMedian !== null && c.scoreMedian !== undefined) {
                              <span>Médiane <span class="text-white font-medium">{{ c.scoreMedian }}</span></span>
                            }
                            <span class="text-gray-600">{{ expandedChallenges().has(c.id) ? '▲' : '▼' }}</span>
                          </div>
                        </button>

                        @if (expandedChallenges().has(c.id)) {
                          <div class="mt-3 flex flex-col gap-2">
                            @if (c.scoreMin !== null && c.scoreMax !== null) {
                              <div class="flex gap-4 text-xs text-gray-500">
                                <span>Min <span class="text-gray-300 font-medium">{{ c.scoreMin }}</span></span>
                                <span>Moy. <span class="text-gray-300 font-medium">{{ c.scoreAvg }}</span></span>
                                <span>Max <span class="text-gray-300 font-medium">{{ c.scoreMax }}</span></span>
                              </div>
                            }
                            @for (t of c.tracks; track t.position) {
                              <div class="bg-gray-700 rounded-lg p-3 flex flex-col gap-2">
                                <p class="text-xs font-medium text-white">{{ t.position }}. {{ t.artist }} — {{ t.title }}</p>
                                <div class="grid grid-cols-3 gap-2 text-xs">
                                  <div class="flex flex-col gap-0.5">
                                    <span class="text-gray-500">Artiste</span>
                                    <span class="font-medium" [class]="rateColor(t.artistCorrectRate)">{{ t.artistCorrectRate | number:'1.0-0' }}%</span>
                                  </div>
                                  <div class="flex flex-col gap-0.5">
                                    <span class="text-gray-500">Titre</span>
                                    <span class="font-medium" [class]="rateColor(t.titleCorrectRate)">{{ t.titleCorrectRate | number:'1.0-0' }}%</span>
                                  </div>
                                  <div class="flex flex-col gap-0.5">
                                    <span class="text-gray-500">Écoute moy.</span>
                                    <span class="text-gray-300 font-medium">
                                      @if (t.avgListenedSeconds !== null && t.avgListenedSeconds !== undefined) { {{ t.avgListenedSeconds }}s } @else { — }
                                    </span>
                                  </div>
                                </div>
                                <div class="w-full bg-gray-600 rounded-full h-1">
                                  <div class="h-1 rounded-full transition-all"
                                    [class]="rateBarColor(t.titleCorrectRate)"
                                    [style.width.%]="t.titleCorrectRate">
                                  </div>
                                </div>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }

          </div>
        }

        <!-- Onglet Pool -->
        @if (activeTab() === 'pool') {
          <div class="flex flex-col gap-4 w-full max-w-2xl">

            <!-- Sous-onglets + bouton ajout -->
            <div class="flex items-center gap-2">
              <div class="flex flex-1 gap-1 bg-gray-800 p-1 rounded-lg">
                <button (click)="poolSubTab.set('available'); availablePage.set(0)"
                  [class]="poolSubTab() === 'available'
                    ? 'flex-1 py-1.5 rounded-md text-sm font-medium bg-gray-700 text-white transition-colors'
                    : 'flex-1 py-1.5 rounded-md text-sm font-medium text-gray-400 hover:text-white transition-colors'">
                  Disponibles ({{ poolTracks().available.length }})
                </button>
                <button (click)="poolSubTab.set('used'); usedPage.set(0)"
                  [class]="poolSubTab() === 'used'
                    ? 'flex-1 py-1.5 rounded-md text-sm font-medium bg-gray-700 text-white transition-colors'
                    : 'flex-1 py-1.5 rounded-md text-sm font-medium text-gray-400 hover:text-white transition-colors'">
                  Déjà utilisés ({{ poolTracks().used.length }})
                </button>
              </div>
              <button (click)="openAddModal(null)"
                class="bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0">
                <span class="text-base leading-none">+</span> Ajouter
              </button>
            </div>

            <!-- Contenu sous-onglet Disponibles -->
            @if (poolSubTab() === 'available') {
              <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-4">
                @if (poolTracksLoading()) {
                  <p class="text-gray-500 text-sm">Vérification des previews...</p>
                } @else if (poolTracks().available.length === 0) {
                  <p class="text-gray-500 text-sm">Aucun morceau disponible.</p>
                } @else {
                  <!-- Barre sélection multiple -->
                  @if (selectedTrackIds().size > 0) {
                    <div class="flex items-center justify-between gap-3 bg-gray-700 rounded-lg px-3 py-2">
                      <span class="text-xs text-gray-300">{{ selectedTrackIds().size }} sélectionné(s)</span>
                      <div class="flex items-center gap-2">
                        <button (click)="clearSelection()" class="text-xs text-gray-400 hover:text-white transition-colors">Tout déselectionner</button>
                        <button (click)="openDeleteModal(null)"
                          class="bg-red-700 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                          🗑 Supprimer ({{ selectedTrackIds().size }})
                        </button>
                      </div>
                    </div>
                  }

                  <!-- Grille -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    @for (t of pagedAvailable(); track t.id) {
                      <div class="bg-gray-700 rounded-lg px-3 py-2.5 flex items-start gap-2.5"
                        [class.ring-1]="selectedTrackIds().has(t.id)"
                        [class.ring-purple-500]="selectedTrackIds().has(t.id)">
                        <input type="checkbox" [checked]="selectedTrackIds().has(t.id)"
                          (change)="toggleSelection(t.id)"
                          class="accent-purple-500 w-4 h-4 shrink-0 cursor-pointer mt-0.5" />
                        <div class="flex-1 min-w-0 flex flex-col gap-1">
                          <span class="text-xs font-medium text-white truncate">{{ t.artist }}</span>
                          <span class="text-xs text-gray-400 truncate">{{ t.title }}</span>
                          <!-- Indicateur preview -->
                          @if (t.hasPreview === true) {
                            <span class="text-xs text-green-400 flex items-center gap-1">▶ Preview OK</span>
                          } @else if (t.hasPreview === false) {
                            <span class="text-xs text-red-400 flex items-center gap-1">✕ Pas de preview</span>
                          }
                        </div>
                        <!-- Actions -->
                        <div class="flex flex-col items-end gap-1 shrink-0">
                          @if (t.hasPreview === false) {
                            <button (click)="openAddModal(null, t.id)"
                              class="text-xs text-yellow-400 hover:text-yellow-300 transition-colors font-medium"
                              title="Chercher une version avec preview">↻</button>
                          }
                          <button (click)="openDeleteModal(t)"
                            class="text-gray-500 hover:text-red-400 transition-colors text-sm leading-none"
                            title="Supprimer ce morceau">🗑</button>
                        </div>
                      </div>
                    }
                  </div>

                  <!-- Pagination disponibles -->
                  @if (availableTotalPages() > 1) {
                    <div class="flex items-center justify-between gap-2 pt-1">
                      <button (click)="availablePage.set(availablePage() - 1)" [disabled]="availablePage() === 0"
                        class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors">
                        ← Préc.
                      </button>
                      <span class="text-xs text-gray-400">
                        Page {{ availablePage() + 1 }} / {{ availableTotalPages() }}
                        <span class="text-gray-600 ml-1">({{ poolTracks().available.length }} morceaux)</span>
                      </span>
                      <button (click)="availablePage.set(availablePage() + 1)" [disabled]="availablePage() >= availableTotalPages() - 1"
                        class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors">
                        Suiv. →
                      </button>
                    </div>
                  }
                }
              </div>
            }

            <!-- Contenu sous-onglet Déjà utilisés -->
            @if (poolSubTab() === 'used') {
              <div class="bg-gray-800 rounded-xl p-5 flex flex-col gap-4">
                @if (poolTracks().used.length === 0) {
                  <p class="text-gray-600 text-sm">Aucun morceau utilisé.</p>
                } @else {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    @for (t of pagedUsed(); track t.id) {
                      <div class="bg-gray-700/50 rounded-lg px-3 py-2.5 border border-gray-700 flex flex-col gap-0.5">
                        <span class="text-xs font-medium text-gray-400 truncate">{{ t.artist }}</span>
                        <span class="text-xs text-gray-600 truncate">{{ t.title }}</span>
                      </div>
                    }
                  </div>
                  <!-- Pagination utilisés -->
                  @if (usedTotalPages() > 1) {
                    <div class="flex items-center justify-between gap-2 pt-1">
                      <button (click)="usedPage.set(usedPage() - 1)" [disabled]="usedPage() === 0"
                        class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors">
                        ← Préc.
                      </button>
                      <span class="text-xs text-gray-400">
                        Page {{ usedPage() + 1 }} / {{ usedTotalPages() }}
                        <span class="text-gray-600 ml-1">({{ poolTracks().used.length }} morceaux)</span>
                      </span>
                      <button (click)="usedPage.set(usedPage() + 1)" [disabled]="usedPage() >= usedTotalPages() - 1"
                        class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors">
                        Suiv. →
                      </button>
                    </div>
                  }
                }
              </div>
            }

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

        <!-- Déconnexion -->
        <div class="pt-2">
          <button (click)="logout()" class="text-gray-600 hover:text-gray-400 text-xs transition-colors">
            Se déconnecter
          </button>
        </div>

      }
    </div>

    <!-- Modale confirmation suppression -->
    @if (deleteModalOpen()) {
      <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        (click)="closeDeleteModal()">
        <div class="bg-gray-800 rounded-2xl p-6 flex flex-col gap-4 w-full max-w-sm shadow-2xl"
          (click)="$event.stopPropagation()">
          <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Confirmer la suppression</h2>

          @if (deleteModalTracks().length === 1) {
            <p class="text-sm text-gray-300">
              Supprimer <span class="text-white font-medium">{{ deleteModalTracks()[0].artist }} — {{ deleteModalTracks()[0].title }}</span> du pool ?
            </p>
          } @else {
            <p class="text-sm text-gray-300">Supprimer {{ deleteModalTracks().length }} morceaux du pool ?</p>
            <ul class="text-xs text-gray-400 flex flex-col gap-0.5 max-h-36 overflow-y-auto bg-gray-700 rounded-lg p-3">
              @for (t of deleteModalTracks(); track t.id) {
                <li>{{ t.artist }} — {{ t.title }}</li>
              }
            </ul>
          }

          @if (deleteStatus() === 'error') {
            <p class="text-red-400 text-xs">Erreur lors de la suppression.</p>
          }

          <div class="flex gap-2 pt-1">
            <button (click)="closeDeleteModal()"
              class="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              Annuler
            </button>
            <button (click)="confirmDelete()" [disabled]="deleteStatus() === 'loading'"
              class="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              @if (deleteStatus() === 'loading') { Suppression... } @else { Supprimer }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Modale ajout au pool -->
    @if (addModalOpen()) {
      <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        (click)="closeAddModal()">
        <div class="bg-gray-800 rounded-2xl p-6 flex flex-col gap-4 w-full max-w-md shadow-2xl"
          (click)="$event.stopPropagation()">

          <!-- En-tête -->
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Ajouter au pool</h2>
            <button (click)="closeAddModal()" class="text-gray-500 hover:text-white text-xl leading-none">✕</button>
          </div>

          <!-- Recherche -->
          <input type="text" [(ngModel)]="poolSearchQuery" (ngModelChange)="onPoolSearchChange($event)"
            placeholder="Rechercher artiste ou titre..."
            class="bg-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
          @if (poolSearchLoading()) {
            <p class="text-gray-500 text-xs -mt-2">Recherche...</p>
          }
          @if (poolSearchResults().length > 0) {
            <ul class="bg-gray-700 rounded-lg divide-y divide-gray-600 max-h-44 overflow-y-auto">
              @for (track of poolSearchResults(); track track.deezerTrackId) {
                <li (click)="selectModalTrack(track)"
                  [class]="addModalTrack()?.deezerTrackId === track.deezerTrackId
                    ? 'px-4 py-2.5 flex justify-between items-center text-sm bg-gray-600 cursor-pointer'
                    : 'px-4 py-2.5 flex justify-between items-center text-sm hover:bg-gray-600 cursor-pointer'">
                  <span class="text-gray-200 flex-1 min-w-0 truncate">{{ track.artist }} — {{ track.title }}</span>
                  <span class="text-purple-400 text-xs shrink-0 ml-4">Choisir</span>
                </li>
              }
            </ul>
          }

          <!-- Player — visible dès qu'un morceau est sélectionné -->
          @if (addModalTrack()) {
            <div class="border-t border-gray-700 pt-4 flex flex-col gap-3">
              <div class="flex flex-col gap-0.5">
                <p class="font-semibold text-white text-sm">{{ addModalTrack()!.artist }}</p>
                <p class="text-xs text-gray-400">{{ addModalTrack()!.title }}</p>
              </div>

              @if (addModalTrack()!.previewUrl) {
                <div class="flex items-center gap-4 bg-gray-700 rounded-xl px-4 py-3">
                  <button (click)="toggleModalPreview()"
                    class="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 flex items-center justify-center shrink-0 transition-colors text-white text-base">
                    {{ modalPlaying() ? '⏸' : '▶' }}
                  </button>
                  <div class="flex-1 flex flex-col gap-1">
                    <div class="text-xs text-gray-400">{{ modalPlaying() ? 'Lecture en cours...' : 'Preview 30s' }}</div>
                    <div class="w-full bg-gray-600 rounded-full h-1">
                      <div class="bg-purple-500 h-1 rounded-full transition-all" [style.width.%]="modalProgress()"></div>
                    </div>
                  </div>
                </div>
              } @else {
                <div class="bg-gray-700 rounded-xl px-4 py-3 text-xs text-red-400 text-center">
                  Aucune preview disponible pour ce morceau
                </div>
              }

              @if (addToPoolStatus() === 'success') {
                <p class="text-green-400 text-xs text-center">Morceau ajouté au pool.</p>
              }
              @if (addToPoolStatus() === 'error') {
                <p class="text-red-400 text-xs text-center">Impossible d'ajouter ce morceau.</p>
              }

              <div class="flex gap-2">
                @if (!addModalTrackIdToUpdate()) {
                  <button (click)="addToPoolFromModal(false)"
                    [disabled]="addToPoolStatus() === 'loading'"
                    class="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                    @if (addToPoolStatus() === 'loading') { ... } @else { Ajouter }
                  </button>
                }
                <button (click)="addToPoolFromModal(true)"
                  [disabled]="addToPoolStatus() === 'loading'"
                  class="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                  @if (addToPoolStatus() === 'loading') { ... }
                  @else if (addModalTrackIdToUpdate()) { Actualiser et fermer }
                  @else { Ajouter et fermer }
                </button>
              </div>
            </div>
          }

        </div>
      </div>
    }
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
  activeTab = signal<Tab>('dashboard');

  poolTracks = signal<PoolTracksResponse>({ available: [], used: [] });
  poolSubTab = signal<PoolSubTab>('available');
  poolTracksLoading = signal(false);
  poolSearchResults = signal<DeezerTrackInfo[]>([]);
  poolSearchLoading = signal(false);
  addToPoolStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');

  addModalOpen = signal(false);
  addModalTrack = signal<DeezerTrackInfo | null>(null);
  addModalTrackIdToUpdate = signal<number | null>(null);
  quickAddingId = signal<number | null>(null);
  modalPlaying = signal(false);
  modalProgress = signal(0);
  private modalAudio: HTMLAudioElement | null = null;
  private modalRafId: number | null = null;

  adminStats = signal<AdminStatsResponse | null>(null);
  statsLoading = signal(false);
  expandedChallenges = signal<Set<number>>(new Set());
  selectedDay = signal<string>(new Date().toISOString().slice(0, 10));

  selectedTrackIds = signal<Set<number>>(new Set());
  deleteModalOpen = signal(false);
  deleteModalTracks = signal<PoolTrackDto[]>([]);
  deleteStatus = signal<'idle' | 'loading' | 'error'>('idle');

  readonly poolPageSize = 12;
  availablePage = signal(0);
  usedPage = signal(0);

  pagedAvailable = computed(() => {
    const page = this.availablePage();
    return this.poolTracks().available.slice(page * this.poolPageSize, (page + 1) * this.poolPageSize);
  });
  availableTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.poolTracks().available.length / this.poolPageSize)));

  pagedUsed = computed(() => {
    const page = this.usedPage();
    return this.poolTracks().used.slice(page * this.poolPageSize, (page + 1) * this.poolPageSize);
  });
  usedTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.poolTracks().used.length / this.poolPageSize)));

  totalPlayers = computed(() =>
    (this.adminStats()?.dailyActivity ?? []).reduce((s, d) => s + d.playerCount, 0));

  maxDailyPlayers = computed(() =>
    Math.max(0, ...(this.adminStats()?.dailyActivity ?? []).map(d => d.playerCount)));

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
      next: () => {
        this.authenticated.set(true);
        this.loadChallenges();
        this.loadPool();
        this.loadStats();
      },
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
        this.loadStats();
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
        this.loadStats();
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
      next: res => {
        this.resetResult.set(res);
        this.resetStatus.set('success');
        this.loadStats();
      },
      error: () => this.resetStatus.set('error'),
    });
  }

  toggleChallenge(id: number): void {
    const set = new Set(this.expandedChallenges());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.expandedChallenges.set(set);
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
    this.loadStats();
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
      this.loadStats();
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
    this.poolSearch$.next(q);
  }

  openAddModal(track: DeezerTrackInfo | null, trackIdToUpdate: number | null = null): void {
    this.stopModalAudio();
    this.addToPoolStatus.set('idle');
    this.modalProgress.set(0);
    this.addModalTrack.set(track);
    this.addModalTrackIdToUpdate.set(trackIdToUpdate);
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
      next: () => { this.quickAddingId.set(null); this.loadPool(true); },
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
        this.loadPool(true);
        if (andClose) {
          this.poolSearchResults.set([]);
          this.poolSearchQuery = '';
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

  private loadChallenges(): void {
    this.http.get<ChallengeDto[]>(`${this.base}/challenges`).subscribe({
      next: data => this.challenges.set(data),
      error: () => {},
    });
  }

  private loadPool(silent = false): void {
    if (!silent) { this.poolTracksLoading.set(true); this.availablePage.set(0); this.usedPage.set(0); }
    this.http.get<PoolTracksResponse>(`${this.base}/tracks`).subscribe({
      next: data => { this.poolTracks.set(data); this.poolTracksLoading.set(false); },
      error: () => this.poolTracksLoading.set(false),
    });
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
      this.http.delete(`${this.base}/tracks/${t.id}`).toPromise().then(() => t.id)
    );

    Promise.all(requests).then(() => {
      const deleted = new Set(tracks.map(t => t.id));
      this.selectedTrackIds.set(new Set([...this.selectedTrackIds()].filter(id => !deleted.has(id))));
      this.closeDeleteModal();
      this.loadPool(true);
    }).catch(() => {
      this.deleteStatus.set('error');
    });
  }

  private loadStats(): void {
    this.statsLoading.set(true);
    const day = this.selectedDay();
    this.http.get<AdminStatsResponse>(`${this.base}/stats?date=${day}`).subscribe({
      next: data => { this.adminStats.set(data); this.statsLoading.set(false); },
      error: () => this.statsLoading.set(false),
    });
  }
}
