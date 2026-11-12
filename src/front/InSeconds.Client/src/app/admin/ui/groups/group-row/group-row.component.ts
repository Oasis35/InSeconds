import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminGroup } from '../../../domain/admin-group';

/** Ce que la ligne montre à la place des boutons : le champ du nouveau nom, ou la confirmation d'une action. */
type RowMode = 'idle' | 'rename' | 'reset' | 'delete';

/**
 * Un groupe dans l'onglet Groupes de l'admin : le nom, le nombre de membres, le créateur et la date de création, puis la modération. Une seule
 * mise en page qui s'adapte (`lg`) : empilée sur téléphone, en colonnes alignées sur celles de l'en-tête de la page sur PC. Renommer se fait
 * sur place ; remettre le nom à zéro et supprimer demandent une confirmation sur place (jamais de fenêtre). La ligne n'appelle rien : elle
 * émet, et se referme quand l'attente de la page se termine sans erreur. Ni code d'invitation ni liste de membres : l'admin ne les voit pas.
 */
@Component({
  selector: 'li[appGroupRow]',
  imports: [DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-testid': 'admin-group',
    class: 'block px-4 py-3 lg:grid lg:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1fr)_6rem_18rem] lg:items-center lg:gap-3',
    style: 'border-top:1px solid var(--border-subtle)',
  },
  template: `
    <div class="min-w-0">
      @if (mode() === 'rename') {
        <form class="flex flex-wrap items-center gap-2" (submit)="$event.preventDefault(); submitRename()">
          <label [for]="'group-name-' + group().id" class="sr-only">{{ 'admin.groups.renameLabel' | translate }}</label>
          <input [id]="'group-name-' + group().id" type="text" #nameField [value]="draft()" (input)="draft.set(nameField.value)" maxlength="40"
            class="flex-1 min-w-40 px-3 py-2 rounded-lg text-sm outline-none"
            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-medium)" />
          <button type="submit" [disabled]="pending() || draft().trim().length === 0"
            class="px-3 py-2 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.save' | translate }}</button>
          <button type="button" (click)="close()" [disabled]="pending()" class="px-2 py-2 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
        </form>
      } @else {
        <p class="font-medium truncate" data-testid="admin-group-name" [title]="group().name" style="color:var(--text-hi)">{{ group().name }}</p>
      }
      <p class="text-xs lg:hidden" style="color:var(--text-muted)">
        {{ 'admin.groups.memberCount' | translate: { count: group().memberCount } }} · {{ group().ownerPseudo ?? '-' }} · {{ group().createdAt | date: 'dd/MM/yyyy' }}
      </p>
    </div>
    <span class="hidden lg:block text-right tabular-nums" style="color:var(--text-hi)">{{ group().memberCount }}</span>
    <span class="hidden lg:block truncate" style="color:var(--text-muted)">{{ group().ownerPseudo ?? '-' }}</span>
    <span class="hidden lg:block whitespace-nowrap" style="color:var(--text-muted)">{{ group().createdAt | date: 'dd/MM/yyyy' }}</span>

    <div class="mt-2 lg:mt-0 flex flex-wrap items-center gap-2 lg:justify-end">
      @switch (mode()) {
        @case ('reset') {
          <span class="text-sm" style="color:var(--text-muted)">{{ 'admin.groups.resetConfirm' | translate }}</span>
          <button type="button" data-testid="confirm-reset" [disabled]="pending()" (click)="resetNameRequested.emit()"
            class="px-3 py-1.5 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.resetYes' | translate }}</button>
          <button type="button" (click)="close()" [disabled]="pending()" class="px-2 py-1.5 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
        }
        @case ('delete') {
          <span class="text-sm" style="color:var(--text-muted)">{{ 'admin.groups.deleteConfirm' | translate }}</span>
          <button type="button" data-testid="confirm-delete" [disabled]="pending()" (click)="removeRequested.emit()"
            class="px-3 py-1.5 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
            style="background:var(--bg-inactive);color:var(--text-error);border:1px solid var(--text-error)">{{ 'admin.groups.deleteYes' | translate }}</button>
          <button type="button" (click)="close()" [disabled]="pending()" class="px-2 py-1.5 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
        }
        @case ('rename') {}
        @default {
          <button type="button" data-testid="rename-group" (click)="open('rename')" class="px-3 py-1.5 rounded-(--radius-button) text-sm hover:opacity-80"
            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.rename' | translate }}</button>
          <button type="button" data-testid="reset-group-name" (click)="open('reset')" class="px-3 py-1.5 rounded-(--radius-button) text-sm hover:opacity-80"
            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.resetName' | translate }}</button>
          <button type="button" data-testid="delete-group" (click)="open('delete')" class="px-3 py-1.5 rounded-(--radius-button) text-sm hover:opacity-80"
            style="background:var(--bg-inactive);color:var(--text-error);border:1px solid var(--border-neutral)">{{ 'admin.groups.delete' | translate }}</button>
        }
      }
    </div>

    @if (errorKey(); as key) {
      <p class="mt-2 text-sm lg:col-span-5" role="alert" data-testid="group-error" style="color:var(--text-error)">{{ key | translate }}</p>
    }
  `,
})
export class GroupRowComponent {
  readonly group = input.required<AdminGroup>();
  /** L'API n'a pas encore répondu à une action sur ce groupe. */
  readonly pending = input(false);
  /** La clé de traduction du refus de la dernière action sur ce groupe, sinon `null`. */
  readonly errorKey = input<string | null>(null);
  /** Le nom saisi (rogné par l'API). */
  readonly renamed = output<string>();
  readonly resetNameRequested = output();
  readonly removeRequested = output();

  protected readonly mode = signal<RowMode>('idle');
  protected readonly draft = signal('');

  constructor() {
    // La ligne se referme quand l'attente se termine sans refus ; avec un refus, elle reste ouverte pour corriger ou renoncer.
    let wasPending = false;
    effect(() => {
      const pending = this.pending();
      const failed = this.errorKey() !== null;
      untracked(() => {
        if (wasPending && !pending && !failed) this.close();
        wasPending = pending;
      });
    });
  }

  protected open(mode: RowMode): void {
    this.draft.set(this.group().name);
    this.mode.set(mode);
  }

  protected close(): void {
    this.mode.set('idle');
  }

  protected submitRename(): void {
    const name = this.draft().trim();
    if (name.length > 0 && !this.pending()) this.renamed.emit(name);
  }
}
