import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminGroup, AdminGroupMember } from '../../../domain/admin-group';
import { GroupMembersComponent, MemberRemoval } from '../group-members/group-members.component';

/** Ce que la modération montre à la place de ses boutons : le champ du nouveau nom, ou la confirmation d'une action. */
type RowMode = 'idle' | 'rename' | 'reset' | 'delete';

/**
 * Un groupe dans l'onglet Groupes de l'admin : le nom, le nombre de membres, le créateur et la date de création. Comme un compte dans l'onglet
 * Joueurs, un clic sur le nom (ou sur le nombre de membres) déplie le groupe : sa liste de membres, puis la modération (renommer, remettre le nom à
 * zéro, supprimer), qui n'est donc jamais à un clic de la liste. Remettre le nom à zéro et supprimer demandent encore une confirmation sur place
 * (jamais de fenêtre) ; replier le groupe annule une confirmation en cours. Une seule mise en page qui s'adapte (`lg`) : empilée sur téléphone, en
 * colonnes alignées sur celles de l'en-tête de la page sur PC. La ligne n'appelle rien : elle émet, et la modération se referme quand l'attente de
 * la page se termine sans erreur. Jamais le code d'invitation.
 */
@Component({
  selector: 'li[appGroupRow]',
  imports: [DatePipe, TranslatePipe, GroupMembersComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-testid': 'admin-group',
    class: 'block px-4 py-3 lg:grid lg:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1fr)_6rem] lg:items-center lg:gap-3',
    style: 'border-top:1px solid var(--border-subtle)',
    '[style.background]': "expanded() ? 'var(--bg-inactive)' : null",
  },
  template: `
    <div class="min-w-0">
      <button type="button" data-testid="group-toggle" (click)="toggled.emit()"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="panelId()"
        [title]="'admin.groups.toggle' | translate"
        class="inline-flex max-w-full items-center gap-1.5 text-left cursor-pointer hover:underline"
        style="color:var(--text-hi)">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class="shrink-0 transition-transform" [style.transform]="expanded() ? 'rotate(90deg)' : null">
          <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="font-medium truncate" data-testid="admin-group-name" [title]="group().name">{{ group().name }}</span>
      </button>
      <p class="text-xs lg:hidden" style="color:var(--text-muted)">
        {{ 'admin.groups.memberCount' | translate: { count: group().memberCount } }} · {{ group().ownerPseudo ?? '-' }} · {{ group().createdAt | date: 'dd/MM/yyyy' }}
      </p>
    </div>
    <button type="button" data-testid="group-members-toggle" (click)="toggled.emit()"
      [attr.aria-expanded]="expanded()"
      [attr.aria-controls]="panelId()"
      [title]="'admin.groups.toggle' | translate"
      class="hidden lg:block text-right tabular-nums cursor-pointer hover:underline" style="color:var(--text-hi)">{{ group().memberCount }}</button>
    <span class="hidden lg:block truncate" style="color:var(--text-muted)">{{ group().ownerPseudo ?? '-' }}</span>
    <span class="hidden lg:block whitespace-nowrap" style="color:var(--text-muted)">{{ group().createdAt | date: 'dd/MM/yyyy' }}</span>

    @if (expanded()) {
      <div class="mt-3 lg:col-span-4 flex flex-col gap-4" data-testid="group-panel" [id]="panelId()">
        <app-group-members [members]="members()" [status]="membersStatus()" [pending]="pending()" [errorKey]="errorKey()"
          (ownerChanged)="ownerChanged.emit($event)" (removed)="memberRemoved.emit($event)" />

        <div class="flex flex-col gap-2" data-testid="group-moderation">
          <p class="text-xs font-medium" style="color:var(--text-muted)">{{ 'admin.groups.moderationTitle' | translate }}</p>
          @switch (mode()) {
            @case ('rename') {
              <form class="flex flex-wrap items-center gap-2" (submit)="$event.preventDefault(); submitRename()">
                <label [for]="'group-name-' + group().id" class="sr-only">{{ 'admin.groups.renameLabel' | translate }}</label>
                <input [id]="'group-name-' + group().id" type="text" #nameField [value]="draft()" (input)="draft.set(nameField.value)" maxlength="40"
                  class="app-input flex-1 min-w-40" />
                <button type="submit" [disabled]="pending() || draft().trim().length === 0"
                  class="px-3 py-2 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
                  style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.save' | translate }}</button>
                <button type="button" (click)="close()" [disabled]="pending()" class="px-2 py-2 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
              </form>
            }
            @case ('reset') {
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm" style="color:var(--text-muted)">{{ 'admin.groups.resetConfirm' | translate }}</span>
                <button type="button" data-testid="confirm-reset" [disabled]="pending()" (click)="resetNameRequested.emit()"
                  class="px-3 py-1.5 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
                  style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.resetYes' | translate }}</button>
                <button type="button" (click)="close()" [disabled]="pending()" class="px-2 py-1.5 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
              </div>
            }
            @case ('delete') {
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm" style="color:var(--text-muted)">{{ 'admin.groups.deleteConfirm' | translate }}</span>
                <button type="button" data-testid="confirm-delete" [disabled]="pending()" (click)="removeRequested.emit()"
                  class="px-3 py-1.5 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
                  style="background:var(--bg-inactive);color:var(--text-error);border:1px solid var(--color-fail)">{{ 'admin.groups.deleteYes' | translate }}</button>
                <button type="button" (click)="close()" [disabled]="pending()" class="px-2 py-1.5 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
              </div>
            }
            @default {
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" data-testid="rename-group" (click)="open('rename')" class="px-3 py-1.5 rounded-(--radius-button) text-sm hover:opacity-80"
                  style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.rename' | translate }}</button>
                <button type="button" data-testid="reset-group-name" (click)="open('reset')" class="px-3 py-1.5 rounded-(--radius-button) text-sm hover:opacity-80"
                  style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.resetName' | translate }}</button>
                <button type="button" data-testid="delete-group" (click)="open('delete')" class="px-3 py-1.5 rounded-(--radius-button) text-sm hover:opacity-80"
                  style="background:var(--bg-inactive);color:var(--text-error);border:1px solid var(--border-neutral)">{{ 'admin.groups.delete' | translate }}</button>
              </div>
            }
          }
          @if (errorKey(); as key) {
            @if (mode() !== 'idle') {
              <p class="text-sm" role="alert" data-testid="group-error" style="color:var(--text-error)">{{ key | translate }}</p>
            }
          }
        </div>
      </div>
    }
  `,
})
export class GroupRowComponent {
  readonly group = input.required<AdminGroup>();
  /** Le groupe est déplié : ses membres et la modération sont visibles. */
  readonly expanded = input(false);
  /** Les membres déjà lus, ou `null` si aucune lecture n'a encore abouti. */
  readonly members = input<readonly AdminGroupMember[] | null>(null);
  readonly membersStatus = input<'idle' | 'loading' | 'error'>('loading');
  /** L'API n'a pas encore répondu à une action sur ce groupe. */
  readonly pending = input(false);
  /** La clé de traduction du refus de la dernière action sur ce groupe, sinon `null`. */
  readonly errorKey = input<string | null>(null);
  /** Un clic sur le nom ou sur le nombre de membres : déplier ou replier. */
  readonly toggled = output();
  /** Le nom saisi (rogné par l'API). */
  readonly renamed = output<string>();
  /** Le pseudo du membre à qui l'admin confie le groupe. */
  readonly ownerChanged = output<string>();
  /** Un membre retiré, avec le successeur désigné s'il était créateur. */
  readonly memberRemoved = output<MemberRemoval>();
  readonly resetNameRequested = output();
  readonly removeRequested = output();

  protected readonly mode = signal<RowMode>('idle');
  protected readonly draft = signal('');

  constructor() {
    // La modération se referme quand l'attente se termine sans refus ; avec un refus, elle reste ouverte pour corriger ou renoncer.
    let wasPending = false;
    effect(() => {
      const pending = this.pending();
      const failed = this.errorKey() !== null;
      untracked(() => {
        if (wasPending && !pending && !failed) this.close();
        wasPending = pending;
      });
    });
    // Replier le groupe annule une confirmation en cours : en le rouvrant, jamais un « Supprimer pour de bon » déjà armé.
    effect(() => {
      if (!this.expanded()) untracked(() => this.close());
    });
  }

  protected panelId(): string {
    return `group-panel-${this.group().id}`;
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
