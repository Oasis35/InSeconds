import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../../core/session/session.store';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';
import { GeneralRankingStore } from '../../data-access/general-ranking.store';

/**
 * La feuille « Sous quel nom apparaître ? » du classement général : son pseudo, ou un alias musical (« Hibou rêveur 12 »), avec « Autre alias ».
 * Choisir l'alias le tire tout de suite (il est réservé, toujours unique) ; « Enregistrer » revient au pseudo si c'est le choix. Ouverte avec
 * l'injecteur de la page, pour retrouver son `GeneralRankingStore`.
 */
@Component({
  selector: 'app-ranking-name-sheet',
  imports: [TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'social.general.name.title' | translate">
      <p class="text-sm" style="color:var(--text-light)">{{ 'social.general.name.body' | translate }}</p>
      <div class="mt-4 flex flex-col gap-3" role="radiogroup" [attr.aria-label]="'social.general.name.title' | translate">
        <button type="button" role="radio" [attr.aria-checked]="choice() === 'pseudo'" (click)="choosePseudo()" data-testid="name-pseudo"
          class="flex items-center gap-3 rounded-(--radius-card) px-4 py-3 text-left cursor-pointer touch-manipulation"
          [style.border]="choice() === 'pseudo' ? '1px solid var(--color-accent-3)' : '1px solid var(--border-medium)'"
          [style.background]="choice() === 'pseudo' ? 'rgb(var(--rgb-accent-3) / 0.08)' : null">
          <span class="radio-dot" [class.radio-dot-on]="choice() === 'pseudo'" aria-hidden="true"></span>
          <span class="flex flex-col">
            <span class="font-semibold" style="color:var(--text-hi)">{{ 'social.general.name.pseudo' | translate }}</span>
            <span class="text-sm" style="color:var(--text-light)">{{ pseudo() }}</span>
          </span>
        </button>
        <div class="rounded-(--radius-card) px-4 py-3 flex flex-col gap-2"
          [style.border]="choice() === 'alias' ? '1px solid var(--color-accent-3)' : '1px solid var(--border-medium)'"
          [style.background]="choice() === 'alias' ? 'rgb(var(--rgb-accent-3) / 0.08)' : null">
          <button type="button" role="radio" [attr.aria-checked]="choice() === 'alias'" (click)="chooseAlias()" data-testid="name-alias"
            class="flex items-center gap-3 text-left cursor-pointer touch-manipulation">
            <span class="radio-dot" [class.radio-dot-on]="choice() === 'alias'" aria-hidden="true"></span>
            <span class="flex flex-col">
              <span class="font-semibold" style="color:var(--text-hi)">{{ 'social.general.name.alias' | translate }}</span>
              <span class="text-sm" style="color:var(--text-light)">{{ 'social.general.name.aliasHint' | translate }}</span>
            </span>
          </button>
          @if (choice() === 'alias' && alias(); as alias) {
            <div class="flex flex-wrap items-center justify-between gap-3 pl-8">
              <span class="min-w-0 break-words text-lg font-bold" style="color:var(--color-violet)" data-testid="name-alias-value">{{ alias }}</span>
              <button appButton type="button" variant="neutral" size="sm" class="shrink-0" [disabled]="store.saving()" (click)="store.drawAlias()" data-testid="name-other-alias">
                {{ 'social.general.name.otherAlias' | translate }}
              </button>
            </div>
          }
        </div>
        @if (store.saveFailed()) {
          <p class="text-xs" role="alert" style="color:var(--text-error)" data-testid="name-save-failed">{{ 'social.general.saveFailed' | translate }}</p>
        }
        <button appButton type="button" size="lg" [block]="true" [disabled]="store.saving()" (click)="save()" data-testid="name-save">
          {{ 'social.general.name.save' | translate }}
        </button>
      </div>
    </app-modal-frame>
  `,
  styles: `
    .radio-dot { flex-shrink: 0; width: 1.25rem; height: 1.25rem; border-radius: 9999px; border: 2px solid var(--border-strong); }
    .radio-dot-on { border-color: var(--color-accent-3); box-shadow: inset 0 0 0 3px var(--bg-surface-2), inset 0 0 0 10px var(--color-accent-3); }
  `,
})
export class RankingNameSheet {
  protected readonly ref = inject<DialogRef<void>>(DialogRef);
  protected readonly store = inject(GeneralRankingStore);

  private readonly identity = computed(() => this.store.ranking()?.identity ?? null);
  protected readonly choice = signal<'pseudo' | 'alias'>(this.identity()?.mode ?? 'pseudo');
  protected readonly alias = computed(() => this.identity()?.alias ?? null);
  private readonly session = inject(SessionStore);
  /** Son pseudo de compte, montré sous « Mon pseudo » même quand il apparaît sous un alias. */
  protected readonly pseudo = computed(() => this.session.player()?.pseudo ?? (this.identity()?.mode === 'pseudo' ? this.identity()!.name : ''));

  protected choosePseudo(): void {
    this.choice.set('pseudo');
  }

  /** L'alias est tiré dès le choix, pour le montrer (il est réservé, l'unicité tient). */
  protected async chooseAlias(): Promise<void> {
    this.choice.set('alias');
    if (this.identity()?.mode !== 'alias') await this.store.setMode('alias');
  }

  protected async save(): Promise<void> {
    if (this.choice() === 'pseudo' && this.identity()?.mode === 'alias') await this.store.setMode('pseudo');
    if (!this.store.saveFailed()) this.ref.close();
  }
}
