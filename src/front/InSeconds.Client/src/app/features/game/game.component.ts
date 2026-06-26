import { Component, inject, signal, computed, viewChild, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../core/services/game.service';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { TrackSlot, ResumedAnswer } from '../../core/models/game.models';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';
import { ApiClient, TodayStatsResponse } from '../../api/api.generated';
import { environment } from '../../../environments/environment';

type GameState = 'loading' | 'welcome' | 'resume_prompt' | 'playing' | 'done' | 'error' | 'no_challenge' | 'already_played';

interface RoundResult {
  artistCorrect: boolean;
  titleCorrect: boolean;
  score: number;
  correctArtist: string;
  correctTitle: string;
  listenedDurationSeconds: number;
  averageSecondsWhenCorrect: number | undefined;
  failureRatePercent: number;
  position: number;
  coverUrl: string | null;
  deezerTrackId: number;
}

@Component({
  selector: 'app-game',
  imports: [BlindRoundComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="min-h-dvh flex flex-col" style="background:#080810;color:#e2e8f0">
    <main class="flex-1 flex flex-col p-5 w-full max-w-lg mx-auto">

      <!-- En-tête -->
      <header class="pt-3 pb-6">
        <div class="flex items-center justify-center relative">
          <h1 class="text-lg font-semibold tracking-widest uppercase" style="color:#6366f1;letter-spacing:0.2em">InSeconds</h1>

          <!-- Streak header (tous les écrans sauf loading) -->
          @if (displayStreak() > 0 && gameState() !== 'loading' && gameState() !== 'playing') {
            <span class="absolute right-0 flex items-center gap-1 text-xs font-semibold tabular-nums"
                  style="color:#f59e0b">
              🔥 {{ displayStreak() }}
            </span>
          }

          <!-- Score en cours de partie (par-dessus streak si playing) -->
          @if (gameState() === 'playing') {
            <span class="absolute right-0 text-base font-bold tabular-nums" style="color:#f8fafc">
              {{ totalScore() }} <span style="color:#334155;font-weight:400;font-size:0.75rem">pts</span>
            </span>
          }
        </div>
        @if (gameState() === 'playing') {
          <div class="mt-4 space-y-1.5">
            <div class="flex justify-between text-xs" style="color:#334155">
              <span>Piste {{ currentIndex() + 1 }} / {{ tracks().length }}</span>
              <button (click)="requestAbandon()"
                      class="text-xs transition-colors"
                      style="color:#475569"
                      onmouseenter="this.style.color='#f87171'" onmouseleave="this.style.color='#475569'">
                Abandonner
              </button>
            </div>
            <div class="w-full rounded-full h-px" style="background:#1e1e2e">
              <div class="h-px rounded-full transition-all duration-500" style="background:#6366f1"
                [style.width.%]="(currentIndex() + 1) / tracks().length * 100">
              </div>
            </div>
          </div>
        }
      </header>

      <!-- Chargement -->
      @if (gameState() === 'loading') {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-sm animate-pulse" style="color:#334155">Chargement du défi…</p>
        </div>
      }

      <!-- Accueil -->
      @if (gameState() === 'welcome') {
        <div class="flex-1 flex flex-col items-center justify-center gap-10 text-center px-2">

          <div class="space-y-4">
            <p class="text-6xl" style="line-height:1">♪</p>
            <h2 class="text-3xl font-bold tracking-tight" style="color:#f8fafc">Blind Test du jour</h2>
            <p class="text-sm leading-relaxed" style="color:#475569">
              {{ tracks().length }} morceaux · écoute &amp; devine<br>
              Moins tu écoutes, plus tu scores
            </p>
          </div>

          <button
            (click)="startPlaying()"
            class="w-full py-4 rounded-2xl font-bold text-base tracking-wide transition-all active:scale-95 touch-manipulation"
            style="background:#6366f1;color:#fff;letter-spacing:0.04em">
            Commencer
          </button>
        </div>
      }

      <!-- Reprise de partie en cours -->
      @if (gameState() === 'resume_prompt') {
        <div class="flex-1 flex flex-col items-center justify-center gap-8 text-center px-4">

          @if (!showAbandonConfirm()) {
            <div class="space-y-3">
              <p class="text-5xl" style="line-height:1">⏸</p>
              <h2 class="text-2xl font-bold tracking-tight" style="color:#f8fafc">Partie en cours</h2>
              <p class="text-sm leading-relaxed" style="color:#475569">
                Tu as joué {{ resumeCompletedAnswers().length }} / {{ tracks().length }} morceaux.<br>
                Veux-tu reprendre où tu t'étais arrêté ?
              </p>
            </div>

            <div class="w-full flex flex-col gap-3">
              <button (click)="resumePlaying()"
                class="w-full py-4 rounded-2xl font-bold text-base tracking-wide transition-all active:scale-95 touch-manipulation"
                style="background:#6366f1;color:#fff;letter-spacing:0.04em">
                Reprendre
              </button>
              <button (click)="showAbandonConfirm.set(true)"
                class="w-full py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                style="background:#1e1e2e;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
                Abandonner
              </button>
            </div>
          } @else {
            <!-- Confirmation abandon -->
            <div class="w-full rounded-2xl p-6 space-y-4" style="background:#1a0a0a;border:1px solid rgba(248,113,113,0.3)">
              <p class="text-sm font-semibold" style="color:#fca5a5">Attention</p>
              <p class="text-sm leading-relaxed" style="color:#e2e8f0">
                En abandonnant, le défi d'aujourd'hui sera considéré comme joué.<br>
                Tu ne pourras plus y rejouer avant demain.
              </p>
              <div class="flex gap-3 pt-1">
                <button (click)="confirmAbandon()"
                  [disabled]="abandonLoading()"
                  class="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style="background:#ef4444;color:#fff">
                  {{ abandonLoading() ? '…' : 'Oui, abandonner' }}
                </button>
                <button (click)="showAbandonConfirm.set(false)"
                  class="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
                  style="background:#0f0f1a;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
                  Non, reprendre
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Confirmation abandon en cours de partie -->
      @if (gameState() === 'playing' && showAbandonConfirm()) {
        <div class="fixed inset-0 flex items-end justify-center px-4 pb-8" style="background:rgba(0,0,0,0.7);z-index:50">
          <div class="w-full max-w-lg rounded-2xl p-6 space-y-4" style="background:#1a0a0a;border:1px solid rgba(248,113,113,0.3)">
            <p class="text-sm font-semibold" style="color:#fca5a5">Abandonner la partie ?</p>
            <p class="text-sm leading-relaxed" style="color:#e2e8f0">
              Le défi d'aujourd'hui sera considéré comme joué.<br>
              Tu ne pourras plus y rejouer avant demain.
            </p>
            <div class="flex gap-3 pt-1">
              <button (click)="confirmAbandon()"
                [disabled]="abandonLoading()"
                class="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                style="background:#ef4444;color:#fff">
                {{ abandonLoading() ? '…' : 'Oui, abandonner' }}
              </button>
              <button (click)="showAbandonConfirm.set(false)"
                class="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style="background:#0f0f1a;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
                Continuer
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Pas de défi aujourd'hui -->
      @if (gameState() === 'no_challenge') {
        <div class="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
          <div class="space-y-2">
            <h2 class="text-xl font-semibold" style="color:#e2e8f0">Pas de défi aujourd'hui</h2>
            <p class="text-sm" style="color:#334155">Le défi n'a pas encore été généré.<br>Réessaie dans quelques minutes.</p>
          </div>
          <button (click)="retry()"
            class="px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            style="background:#1e1e2e;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
            Réessayer
          </button>
        </div>
      }

      <!-- Erreur -->
      @if (gameState() === 'error') {
        <div class="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
          <div class="space-y-2">
            <h2 class="text-xl font-semibold" style="color:#e2e8f0">Impossible de charger le défi</h2>
            <p class="text-sm" style="color:#334155">Le serveur est peut-être indisponible.<br>Réessaie dans quelques secondes.</p>
          </div>
          <button (click)="retry()"
            class="px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            style="background:#1e1e2e;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
            Réessayer
          </button>
        </div>
      }

      <!-- Déjà joué aujourd'hui (Completed ou Abandoned) -->
      @if (gameState() === 'already_played') {
        <div class="flex-1 flex flex-col items-center gap-7 text-center px-2 pt-4">

          @if (sessionAbandoned()) {
            <!-- Partie abandonnée — message simple -->
            <div class="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
              <div class="space-y-4">
                <p class="text-5xl" style="line-height:1">🏳️</p>
                <h2 class="text-2xl font-bold tracking-tight" style="color:#f8fafc">Tu as abandonné le défi aujourd'hui</h2>
                <p class="text-sm leading-relaxed" style="color:#475569">
                  Reviens demain pour un nouveau défi.
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold tracking-widest uppercase mb-1" style="color:#475569">Prochain défi dans</p>
                <p class="text-2xl font-bold tabular-nums" style="color:#e2e8f0;letter-spacing:0.05em">{{ countdown() }}</p>
              </div>
            </div>
          } @else {
            <!-- Partie complétée — récap complet -->
            <div class="space-y-3">
              <h2 class="text-2xl font-bold tracking-tight" style="color:#f8fafc">Déjà joué aujourd'hui</h2>
              <div>
                <p class="text-xs font-semibold tracking-widest uppercase mb-1" style="color:#475569">Prochain défi dans</p>
                <p class="text-3xl font-bold tabular-nums" style="color:#e2e8f0;letter-spacing:0.05em">{{ countdown() }}</p>
              </div>
            </div>

            <!-- Card scores -->
            @if (todayStats()) {
              <div class="w-full rounded-2xl overflow-hidden" style="background:#0f0f1a;border:1px solid rgba(255,255,255,0.07)">

                <div class="grid grid-cols-2" style="border-bottom:1px solid rgba(255,255,255,0.07)">
                  <div class="flex flex-col items-center py-7 px-4" style="border-right:1px solid rgba(255,255,255,0.07)">
                    <p class="text-xs font-semibold tracking-widest uppercase mb-2" style="color:#334155">Ton score</p>
                    <p class="text-5xl font-bold tabular-nums" style="color:#f8fafc;letter-spacing:-0.02em">{{ todayStats()!.yourScore ?? '—' }}</p>
                    <p class="text-xs mt-2" style="color:#334155">pts</p>
                  </div>
                  <div class="flex flex-col items-center py-7 px-4">
                    <p class="text-xs font-semibold tracking-widest uppercase mb-2" style="color:#334155">Médiane</p>
                    @if (todayStats()!.medianScore > 0) {
                      <p class="text-5xl font-bold tabular-nums" style="color:#475569;letter-spacing:-0.02em">{{ todayStats()!.medianScore }}</p>
                      <p class="text-xs mt-2" style="color:#334155">pts aujourd'hui</p>
                    } @else {
                      <p class="text-sm mt-4" style="color:#1e293b">—</p>
                    }
                  </div>
                </div>

                <!-- Accordion morceaux -->
                @if (todayStats()!.tracks.length) {
                  <button (click)="showTrackDetails.set(!showTrackDetails())"
                          class="w-full flex items-center justify-center gap-2 py-3.5 text-xs font-semibold tracking-wide uppercase transition-colors"
                          style="color:#334155"
                          onmouseenter="this.style.color='#64748b'" onmouseleave="this.style.color='#334155'">
                    <span>{{ showTrackDetails() ? 'Masquer' : 'Voir les morceaux' }}</span>
                    <span>{{ showTrackDetails() ? '▲' : '▼' }}</span>
                  </button>
                  @if (showTrackDetails()) {
                    <div class="flex flex-col" style="border-top:1px solid rgba(255,255,255,0.07)">
                      @for (t of todayStats()!.tracks; track t.position) {
                        <a [href]="'https://www.deezer.com/track/' + t.deezerTrackId"
                           target="_blank" rel="noopener noreferrer"
                           class="flex items-center gap-3 px-4 py-3.5 transition-colors"
                           style="border-bottom:1px solid rgba(255,255,255,0.04)"
                           onmouseenter="this.style.background='rgba(255,255,255,0.02)'"
                           onmouseleave="this.style.background='transparent'">
                          @if (t.coverUrl) {
                            <img [src]="t.coverUrl" alt="Pochette"
                                 class="w-9 h-9 rounded-lg object-cover shrink-0" style="opacity:0.85" />
                          } @else {
                            <div class="w-9 h-9 rounded-lg shrink-0" style="background:#1a1a2e"></div>
                          }
                          <div class="flex-1 min-w-0 text-left">
                            <p class="text-sm font-medium truncate" style="color:#cbd5e1">{{ t.artist }} — {{ t.title }}</p>
                            <div class="flex gap-3 mt-0.5 text-xs" style="color:#334155">
                              <span>{{ t.failureRatePercent.toFixed(0) }}% ratés</span>
                              @if (t.averageSecondsWhenCorrect != null) {
                                <span>· moy. {{ t.averageSecondsWhenCorrect!.toFixed(1) }}s</span>
                              }
                            </div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="opacity:0.2;shrink:0">
                            <path d="M2 11h2v1H2zM6 9h2v3H6zM10 7h2v5h-2zM14 5h2v7h-2z" fill="white"/>
                          </svg>
                        </a>
                      }
                    </div>
                  }
                }
              </div>
            }

            <!-- Bouton partage -->
            @if (todayStats()?.yourScore != null) {
              <div class="flex flex-col items-center gap-1.5 w-full">
                <button
                  (click)="shareFromStats()"
                  class="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition touch-manipulation"
                  style="background:#1e1e2e;color:#e2e8f0;border:1px solid rgba(255,255,255,0.08);letter-spacing:0.03em">
                  {{ shareCopied() ? '✓ Copié !' : '🔗 Partager mon score' }}
                </button>
                <p class="text-xs" style="color:#475569">Copie un résumé en emojis dans le presse-papier</p>
              </div>
            }
          }
        </div>
      }

      <!-- Jeu en cours -->
      @if (gameState() === 'playing' && currentTrack()) {
        <div class="flex-1 flex flex-col justify-start pt-4">
          <app-blind-round
            #roundRef
            [track]="currentTrack()!"
            [isLast]="currentIndex() === tracks().length - 1"
            (answered)="onAnswered($event)"
            (nextTrack)="onNextTrack()" />
        </div>
      }

      <!-- Récapitulatif final -->
      @if (gameState() === 'done') {
        <div class="flex-1 flex flex-col pt-4 gap-6">

          <!-- Score total -->
          <div class="text-center space-y-2 pb-2">
            <p class="text-xs font-semibold tracking-widest uppercase" style="color:#64748b">Score final</p>
            <p class="font-bold tabular-nums" style="color:#f8fafc;font-size:4rem;line-height:1;letter-spacing:-0.03em">{{ totalScore() }}</p>
            <p class="text-xs" style="color:#64748b">points</p>
          </div>

          <!-- Bouton partage -->
          <div class="flex flex-col items-center gap-1.5">
            <button
              (click)="share()"
              [disabled]="results().length < tracks().length"
              class="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition touch-manipulation disabled:opacity-40"
              style="background:#1e1e2e;color:#e2e8f0;border:1px solid rgba(255,255,255,0.08);letter-spacing:0.03em">
              {{ shareCopied() ? '✓ Copié !' : '🔗 Partager mon score' }}
            </button>
            <p class="text-xs" style="color:#475569">Copie un résumé en emojis dans le presse-papier</p>
          </div>

          <!-- Liste morceaux -->
          <div class="flex flex-col gap-3">
            @for (r of results(); track r.position) {
              <div class="flex gap-3 p-3 rounded-2xl" style="background:#0f0f1a;border:1px solid rgba(255,255,255,0.08)">

                <!-- Pochette -->
                @if (r.coverUrl) {
                  <img [src]="r.coverUrl" alt="Pochette"
                    class="w-14 h-14 rounded-xl object-cover shrink-0" style="opacity:0.9" />
                } @else {
                  <div class="w-14 h-14 rounded-xl shrink-0" style="background:#1a1a2e"></div>
                }

                <!-- Infos -->
                <div class="flex-1 min-w-0 text-left space-y-1.5 py-0.5">

                  <div class="flex gap-2.5 text-xs font-bold">
                    <span [style.color]="r.artistCorrect ? '#34d399' : '#f87171'">
                      {{ r.artistCorrect ? '✓' : '✗' }} Artiste
                    </span>
                    <span [style.color]="r.titleCorrect ? '#34d399' : '#f87171'">
                      {{ r.titleCorrect ? '✓' : '✗' }} Titre
                    </span>
                  </div>

                  <p class="text-sm font-medium truncate" style="color:#e2e8f0">
                    {{ r.correctArtist }} — {{ r.correctTitle }}
                  </p>

                  <div class="flex gap-2.5 text-xs" style="color:#64748b">
                    <span>{{ r.listenedDurationSeconds }}s</span>
                    @if (r.averageSecondsWhenCorrect != null) {
                      <span>· moy. {{ r.averageSecondsWhenCorrect!.toFixed(1) }}s</span>
                    }
                    <span>· {{ r.failureRatePercent.toFixed(0) }}% ratés</span>
                  </div>

                  <a [href]="'https://www.deezer.com/track/' + r.deezerTrackId"
                    target="_blank" rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs transition-colors"
                    style="color:#475569"
                    onmouseenter="this.style.color='#94a3b8'" onmouseleave="this.style.color='#475569'">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 11h2v1H2zM6 9h2v3H6zM10 7h2v5h-2zM14 5h2v7h-2z" fill="currentColor"/></svg>
                    Écouter sur Deezer
                  </a>
                </div>

                <!-- Score -->
                <div class="shrink-0 text-right self-center">
                  <span class="text-lg font-bold" [style.color]="r.score > 0 ? '#34d399' : '#64748b'">
                    +{{ r.score }}
                  </span>
                </div>

              </div>
            }
          </div>

          <p class="text-center text-xs pb-4" style="color:#475569">Reviens demain pour un nouveau défi</p>
        </div>
      }

      <footer class="flex justify-center items-center gap-4 py-3 mt-auto">
        <a routerLink="/admin" class="transition-colors" style="color:#334155"
           onmouseenter="this.style.color='#64748b'" onmouseleave="this.style.color='#334155'" title="Admin">
          <svg fill="currentColor" width="14" height="14" viewBox="0 0 574.65 574.65" xmlns="http://www.w3.org/2000/svg">
            <path d="M424.94,217.315v-79.656C424.94,61.755,363.185,0,287.291,0S149.658,61.739,149.658,137.623v79.742c-41.326,28.563-68.46,76.238-68.46,130.287v162.264c0,35.748,28.986,64.734,64.733,64.734h282.787c35.748,0,64.734-28.986,64.734-64.734V347.652C493.456,293.574,466.306,245.892,424.94,217.315z M322.136,421.457v49.314c0,19.221-15.577,34.811-34.808,34.811c-19.23,0-34.829-15.59-34.829-34.83v-49.283c-14.155-10.627-23.441-27.385-23.441-46.447c0-32.174,26.102-58.254,58.252-58.254c32.173,0,58.255,26.084,58.255,58.254C345.563,394.084,336.276,410.832,322.136,421.457z M348.241,189.969c-4.344-0.357-8.707-0.665-13.145-0.665h-95.538c-4.456,0-8.837,0.308-13.201,0.665v-52.346c0-33.595,27.338-60.922,60.933-60.922c33.612,0,60.95,27.348,60.95,60.959V189.969L348.241,189.969z"/>
          </svg>
        </a>
        <span style="color:#1e293b">·</span>
        <a href="https://github.com/Oasis35/InSeconds" target="_blank" rel="noopener noreferrer"
           class="transition-colors" style="color:#334155"
           onmouseenter="this.style.color='#64748b'" onmouseleave="this.style.color='#334155'" title="Voir le code source">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
        <span style="color:#1e293b">·</span>
        <a href="https://www.linkedin.com/in/crageau/" target="_blank" rel="noopener noreferrer"
           class="transition-colors" style="color:#334155"
           onmouseenter="this.style.color='#64748b'" onmouseleave="this.style.color='#334155'" title="Mon profil">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </a>
      </footer>

    </main>
    </div>
  `,
})
export class GameComponent implements OnInit, OnDestroy {
  private readonly gameService = inject(GameService);
  private readonly api = inject(ApiClient);
  private readonly audioPlayer = inject(AudioPlayerService);

  protected readonly gameState = signal<GameState>('loading');
  protected readonly todayStats = signal<TodayStatsResponse | null>(null);
  protected readonly showTrackDetails = signal(false);
  protected readonly viewportTall = signal(window.innerHeight >= 600);

  @HostListener('window:resize')
  onResize(): void {
    this.viewportTall.set(window.innerHeight >= 600);
  }

  protected readonly tracks = signal<TrackSlot[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly totalScore = signal(0);
  protected readonly results = signal<RoundResult[]>([]);
  protected readonly currentStreak = signal(0);

  // Reprise
  protected readonly resumeCompletedAnswers = signal<ResumedAnswer[]>([]);
  protected readonly showAbandonConfirm = signal(false);
  protected readonly abandonLoading = signal(false);
  protected readonly sessionAbandoned = signal(false);

  // Streak à afficher : depuis la session (welcome/playing/done) ou depuis les stats (already_played)
  protected readonly displayStreak = computed(() => {
    const stats = this.todayStats();
    if (this.gameState() === 'already_played' && stats) return (stats as any)['currentStreak'] as number;
    return this.currentStreak();
  });

  private sessionId = 0;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  protected readonly secondsUntilMidnightUtc = signal(0);
  protected readonly countdown = computed(() => {
    const s = this.secondsUntilMidnightUtc();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  });

  protected readonly roundRef = viewChild<BlindRoundComponent>('roundRef');

  protected readonly currentTrack = () =>
    this.tracks()[this.currentIndex()] ?? null;

  ngOnInit(): void {
    this.loadSession();
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const state = this.gameState();
        if (state === 'welcome' || state === 'resume_prompt' || state === 'playing') {
          this.loadSession();
        }
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    if (this.countdownInterval !== null) clearInterval(this.countdownInterval);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onVisibilityChange!: () => void;

  private startCountdown(): void {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      this.secondsUntilMidnightUtc.set(Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000)));
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  protected startPlaying(): void {
    this.gameState.set('playing');
  }

  protected resumePlaying(): void {
    const startIndex = this.tracks().findIndex((_, i) => i >= this.resumeCompletedAnswers().length);
    this.currentIndex.set(Math.max(0, this.resumeCompletedAnswers().length));
    this.totalScore.set(this.resumeCompletedAnswers().reduce((s, a) => s + a.score, 0));
    this.gameState.set('playing');
  }

  protected requestAbandon(): void {
    this.showAbandonConfirm.set(true);
  }

  protected confirmAbandon(): void {
    this.abandonLoading.set(true);
    this.gameService.abandonSession(this.sessionId).subscribe({
      next: () => {
        this.abandonLoading.set(false);
        this.showAbandonConfirm.set(false);
        this.sessionAbandoned.set(true);
        this.gameState.set('already_played');
        this.startCountdown();
      },
      error: () => {
        this.abandonLoading.set(false);
      },
    });
  }

  protected retry(): void {
    this.gameState.set('loading');
    this.loadSession();
  }

  protected onAnswered(event: AnsweredEvent): void {
    const index = this.currentIndex();
    const track = this.tracks()[index];
    this.gameService.submitAnswer(this.sessionId, {
      dailyChallengeTrackId:   event.trackId,
      listenedDurationSeconds: event.listenedDurationSeconds,
      wasExtended:             event.wasExtended,
      artistAnswer:            event.artistAnswer ?? undefined,
      titleAnswer:             event.titleAnswer ?? undefined,
    }).subscribe({
      next: (response) => {
        this.totalScore.update(s => s + response.score);
        this.results.update(rs => [...rs, {
          artistCorrect:             response.artistCorrect,
          titleCorrect:              response.titleCorrect,
          score:                     response.score,
          correctArtist:             response.correctArtist,
          correctTitle:              response.correctTitle,
          listenedDurationSeconds:   response.listenedDurationSeconds,
          averageSecondsWhenCorrect: response.averageSecondsWhenCorrect,
          failureRatePercent:        response.failureRatePercent,
          position:                  index + 1,
          coverUrl:                  track.coverUrl ?? null,
          deezerTrackId:             track['deezerTrackId'],
        }]);
        this.roundRef()?.setResult(response);
      },
      error: () => {
        this.roundRef()?.setResult({
          artistCorrect: false,
          titleCorrect: false,
          score: 0,
          correctArtist: '?',
          correctTitle: '?',
          listenedDurationSeconds: 0,
          averageSecondsWhenCorrect: undefined,
          failureRatePercent: 0,
        });
      },
    });
  }

  protected onNextTrack(): void {
    const next = this.currentIndex() + 1;
    if (next >= this.tracks().length) {
      this.gameState.set('done');
    } else {
      this.currentIndex.set(next);
    }
  }

  protected readonly shareCopied = signal(false);

  protected shareFromStats(): void {
    const stats = this.todayStats();
    if (!stats) return;

    const date = new Date();
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const lines = stats.tracks.map(t => {
      if (t.listenedDurationSeconds == null) return null;
      const artist = t.artistCorrect ? '✅' : '❌';
      const title  = t.titleCorrect  ? '✅' : '❌';
      return `${artist}/${title} ${t.listenedDurationSeconds}s`;
    }).filter(Boolean);

    const text = [
      `InSeconds 🎵 ${dateStr}`,
      lines.join('\n'),
      `🏆 ${stats.yourScore} pts`,
      environment.appUrl,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
    });
  }

  protected share(): void {
    const date = new Date();
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

    const lines = this.results().map(r => {
      const artist = r.artistCorrect ? '✅' : '❌';
      const title  = r.titleCorrect  ? '✅' : '❌';
      return `${artist}/${title} ${r.listenedDurationSeconds}s`;
    });

    const text = [
      `InSeconds 🎵 ${dateStr}`,
      lines.join('\n'),
      `🏆 ${this.totalScore()} pts`,
      environment.appUrl,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
    });
  }

  private loadSession(): void {
    this.gameService.startToday().subscribe({
      next: (response) => {
        this.sessionId = response.sessionId;
        this.tracks.set(response.tracks);
        this.currentStreak.set(response.currentStreak);

        if (response.isResuming) {
          this.resumeCompletedAnswers.set(response.completedAnswers);
          this.currentIndex.set(response.resumeFromPosition);
          this.totalScore.set(response.completedAnswers.reduce((s, a) => s + a.score, 0));
          this.results.set([]);
          this.showAbandonConfirm.set(false);
          this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl))
            .then(() => this.gameState.set('resume_prompt'));
        } else {
          this.currentIndex.set(0);
          this.totalScore.set(0);
          this.results.set([]);
          this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl))
            .then(() => this.gameState.set('welcome'));
        }
      },
      error: (err) => {
        if (err.status === 409) {
          const errorCode = err.error?.error as string | undefined;
          this.sessionAbandoned.set(errorCode === 'abandoned');
          this.gameState.set('already_played');
          this.startCountdown();
          if (!this.sessionAbandoned()) {
            this.api.apiStatsToday().subscribe(stats => this.todayStats.set(stats));
          }
        } else if (err.status === 503) {
          this.gameState.set('no_challenge');
        } else {
          this.gameState.set('error');
        }
      },
    });
  }
}
