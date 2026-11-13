import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { GeneralRankingStore } from '../../data-access/general-ranking.store';
import { RankingListComponent } from '../../ui/ranking-list/ranking-list.component';

/**
 * Le classement général, par niveau : les premiers, puis le joueur et ses voisins s'il y apparaît plus bas, sa position par dizaines (« top 30 % »)
 * et l'interrupteur « Apparaître dans le classement ». Personne n'y figure sans l'avoir choisi : sans ce choix, le joueur ne lit que sa position.
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
            @if (ranking.topPercent !== null) {
              <p class="text-sm" style="color:var(--text-light)" data-testid="general-percent">
                {{ 'social.general.percent' | translate: { percent: ranking.topPercent } }}
              </p>
            }
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

            @if (ranking.canAppear) {
              <div class="flex items-center justify-between gap-3 px-4 py-3 min-h-14"
                   style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
                <span class="flex flex-col gap-0.5">
                  <span id="general-visible-label" class="text-sm" style="color:var(--text-hi)">{{ 'social.general.appear' | translate }}</span>
                  <span class="text-xs" style="color:var(--text-muted)">{{ 'social.general.appearHint' | translate }}</span>
                </span>
                <button type="button" role="switch" aria-labelledby="general-visible-label" data-testid="general-visible"
                        [attr.aria-checked]="ranking.visible" [disabled]="store.saving()" (click)="store.setVisible(!ranking.visible)"
                        class="relative inline-flex h-11 w-14 shrink-0 items-center cursor-pointer touch-manipulation disabled:opacity-50">
                  <span class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                        [style.background]="ranking.visible ? 'var(--color-accent-3)' : 'var(--border-strong)'">
                    <span class="inline-block h-5 w-5 rounded-full transition-transform" style="background:var(--text-hi)"
                          [style.transform]="ranking.visible ? 'translateX(22px)' : 'translateX(2px)'"></span>
                  </span>
                </button>
              </div>
              @if (store.saveFailed()) {
                <p class="text-xs text-center" role="alert" style="color:var(--text-error)" data-testid="general-save-failed">{{ 'social.general.saveFailed' | translate }}</p>
              }
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
