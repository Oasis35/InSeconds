import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { GeneralRankingStore } from '../../data-access/general-ranking.store';
import { RankingListComponent } from '../../ui/ranking-list/ranking-list.component';

/**
 * Le classement général, par niveau : les premiers, puis le joueur et ses voisins s'il y est classé plus bas. Tous les comptes qui ont l'accès et ont
 * fini une partie y figurent, sous leur pseudo ou leur alias musical.
 */
@Component({
  selector: 'app-general-ranking',
  imports: [TranslatePipe, ButtonComponent, RankingListComponent],
  providers: [GeneralRankingStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (store.status()) {
      @case ('error') {
        <div class="flex flex-col items-center gap-3 py-6 text-center" data-testid="general-error">
          <p class="text-sm" style="color:var(--text-muted)">{{ 'social.ranking.error' | translate }}</p>
          <button appButton type="button" variant="secondary" (click)="store.load()">{{ 'common.retry' | translate }}</button>
        </div>
      }
      @case ('ready') {
        @if (store.ranking(); as ranking) {
          <div class="flex flex-col gap-3" data-testid="general-ranking">
            @if (ranking.top.length) {
              <div style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
                <app-ranking-list [entries]="ranking.top" [lang]="lang()" [bare]="true" />
                @if (ranking.around.length) {
                  <p class="text-center leading-none" aria-hidden="true" style="color:var(--text-muted)">⋯</p>
                  <app-ranking-list [entries]="ranking.around" [lang]="lang()" [bare]="true" data-testid="general-around" />
                }
              </div>
            } @else {
              <p class="text-sm text-center py-6" style="color:var(--text-muted)" data-testid="general-empty">{{ 'social.general.empty' | translate }}</p>
            }

          </div>
        }
      }
      @default {
        <p class="text-sm text-center animate-pulse" style="color:var(--text-faint)">{{ 'social.ranking.loading' | translate }}</p>
      }
    }
  `,
})
export class GeneralRankingComponent {
  protected readonly store = inject(GeneralRankingStore);
  /** La langue des nombres. */
  readonly lang = input('fr');

  constructor() {
    void this.store.load();
  }
}
