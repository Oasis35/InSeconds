import { ChangeDetectionStrategy, Component, Injector, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { RankingNameSheet } from './ranking-name.sheet';
import { GeneralRankingStore } from '../../data-access/general-ranking.store';
import { RankingListComponent } from '../../ui/ranking-list/ranking-list.component';

/**
 * Le classement général, par niveau : les premiers, puis le joueur et ses voisins s'il y est classé plus bas. Tous les comptes qui ont l'accès et ont
 * fini une partie y figurent, sous leur pseudo ou leur alias musical. En tête, « Tu apparais sous Léa · Modifier » (un compte seulement), qui ouvre
 * le choix du nom ; en bas, le nombre de joueurs classés.
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
            <!-- Pas de fenêtre : une ligne fixe dit sous quel nom il apparaît, « Modifier » ouvre le choix pseudo ou alias. -->
            @if (ranking.identity; as identity) {
              <p class="text-sm" style="color:var(--text-light)" data-testid="general-identity">
                {{ 'social.general.appearsAs' | translate }} <b style="color:var(--text-hi)" data-testid="general-identity-name">{{ identity.name }}</b> ·
                <button type="button" class="underline underline-offset-4 min-h-11 cursor-pointer touch-manipulation" style="color:var(--text-hi)"
                  (click)="editName()" data-testid="general-identity-edit">{{ 'social.general.edit' | translate }}</button>
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
              <p class="text-sm text-center" style="color:var(--text-muted)" data-testid="general-total">
                {{ (ranking.total === 1 ? 'social.general.totalOne' : 'social.general.total') | translate: { count: format(ranking.total) } }}
              </p>
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
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  /** La langue des nombres. */
  readonly lang = input('fr');
  /** Ouvrir tout de suite le choix du nom (le lien du profil, `?edit=name`). */
  readonly openNameOnLoad = input(false);

  constructor() {
    void this.store.load().then(() => {
      if (this.openNameOnLoad() && this.store.ranking()?.identity) this.editName();
    });
  }

  /** « Modifier » : la feuille « Sous quel nom apparaître ? ». */
  protected editName(): void {
    this.modal.openSheet(RankingNameSheet, { injector: this.injector });
  }

  protected format(value: number): string {
    return new Intl.NumberFormat(this.lang()).format(value);
  }
}
