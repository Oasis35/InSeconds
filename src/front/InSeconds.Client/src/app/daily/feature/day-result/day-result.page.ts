import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { DailyGameStore } from '../../data-access/daily-game.store';
import { isRecapScreen } from '../../domain/daily-screen';
import { AbandonedScreenComponent } from '../../ui/abandoned-screen/abandoned-screen.component';
import { DayResultScreenComponent } from '../../ui/day-result-screen/day-result-screen.component';
import { TrackResultsListComponent } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { DailyResultView, StreakSheetOpener } from '../daily-shell/daily-view';

/**
 * Le résultat complet du jour (`/daily/resultat`), ouvert par « Voir le résultat » de la carte courte de l'accueil : l'écran de fin entier (score,
 * scores du jour, morceaux, partage, série, profil de la partie, réponses d'hier), ou l'écran d'abandon. Les stores sont ceux de la coquille ;
 * tant que le défi n'est pas fini, la coquille renvoie à l'accueil (`DailyShellComponent`).
 */
@Component({
  selector: 'app-day-result-page',
  imports: [TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, InstagramLinkComponent, AccountLinkComponent, HomeLegalLineComponent,
    DayResultScreenComponent, AbandonedScreenComponent, TrackResultsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="da-bg min-h-dvh flex flex-col relative" style="color:var(--text-body)">
      <app-decor-background />
      <main class="relative flex-1 flex flex-col px-5 pt-2 pb-5 w-full max-w-lg mx-auto overflow-x-clip" data-testid="day-result-page">
        <header class="pb-4">
          <app-brand>
            <div brandRight class="flex items-center gap-2">
              <app-instagram-link />
              <app-account-link />
            </div>
          </app-brand>
        </header>
        <a routerLink="/" class="self-start inline-flex items-center gap-1 min-h-11 -mt-2 mb-2 text-sm" style="color:var(--text-light)" data-testid="day-result-back">
          <span aria-hidden="true">‹</span> {{ 'daily.result.back' | translate }}
        </a>
        @if (isRecap()) {
          @if (store.abandoned()) {
            <app-abandoned-screen [countdown]="store.countdown()" />
            @if (store.stats()?.abandonedScore != null && result.rows().length) {
              <!-- Abandonné après au moins une réponse : les morceaux joués, comme sur le résultat d'une partie finie. -->
              <div class="-mx-5 mt-6" style="border-top:1px solid var(--border-medium);border-bottom:1px solid var(--border-medium)" data-testid="day-result-abandoned-tracks">
                <app-track-results-list [rows]="result.rows()" [lang]="language.current()" />
              </div>
            }
          } @else {
            <app-day-result-screen
              [fresh]="store.screen() === 'done'"
              [score]="store.screen() === 'done' ? result.displayedTotal() : (store.stats()?.yourScore ?? null)"
              [rows]="result.rows()"
              [stats]="store.stats()"
              [yesterday]="store.yesterday()"
              [countdown]="store.countdown()"
              [shareCopied]="result.copied()"
              [shareFailed]="result.failed()"
              [canShare]="store.screen() === 'done' ? store.canShare() : store.stats()?.yourScore != null"
              [lang]="language.current()"
              [streak]="store.pillStreak()"
              [linked]="store.linked()"
              (share)="result.share()"
              (openStreak)="streakSheet.open()" />
          }
        } @else {
          <div class="flex-1 flex items-center justify-center">
            <p class="text-sm animate-pulse" style="color:var(--text-faint)">{{ 'daily.common.loading' | translate }}</p>
          </div>
        }
      </main>
      <app-home-legal-line class="mt-auto" />
    </div>
  `,
})
export class DayResultPage {
  protected readonly store = inject(DailyGameStore);
  protected readonly language = inject(LanguageService);
  protected readonly result = inject(DailyResultView);
  protected readonly streakSheet = inject(StreakSheetOpener);

  protected isRecap(): boolean {
    return isRecapScreen(this.store.screen());
  }
}
