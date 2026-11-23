import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminGroupMember } from '../../../domain/admin-group';

/** Ce que l'admin a demandé sur un membre, en attente de sa confirmation : confier le groupe à ce membre, ou le retirer. */
interface MemberAction {
  kind: 'owner' | 'remove';
  pseudo: string;
}

/** Un retrait confirmé : le membre, et le successeur désigné quand ce membre est le créateur et que d'autres restent. */
export interface MemberRemoval {
  pseudo: string;
  successor: string | null;
}

/**
 * Les membres d'un groupe, dans la zone dépliée d'une ligne de l'onglet Groupes : pseudo, créateur ou non, date d'adhésion, et pour chacun
 * « Désigner créateur » et « Retirer », chacun avec sa confirmation sur place. Retirer le créateur oblige à désigner qui le devient (le changement
 * et le retrait partent ensemble) ; retirer le seul membre supprime le groupe, et la confirmation le dit. Le composant n'appelle rien : il émet, et
 * ferme la confirmation quand l'attente de la page se termine sans refus. Les membres déjà lus restent affichés pendant une relecture ou si
 * celle-ci échoue ; sans eux, l'état de chargement ou d'erreur prend leur place.
 */
@Component({
  selector: 'app-group-members',
  imports: [DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-testid': 'group-members' },
  template: `
    @if (members(); as list) {
      <p class="text-xs font-medium mb-1.5" style="color:var(--text-muted)">{{ 'admin.groups.membersTitle' | translate: { count: list.length } }}</p>
      @if (list.length === 0) {
        <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.groups.membersEmpty' | translate }}</p>
      } @else {
        <ul class="flex flex-col text-sm" style="width:min(36rem, calc(100vw - 4rem))">
          @for (member of list; track $index) {
            <li data-testid="group-member" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5" style="border-top:1px solid var(--border-subtle)">
              <span class="flex-1 min-w-24 truncate" style="color:var(--text-hi)">{{ member.pseudo ?? '-' }}</span>
              <span class="text-xs" style="color:var(--text-muted)">
                @if (member.isOwner) {
                  {{ 'admin.groups.owner' | translate }}
                }
              </span>
              <span class="text-xs tabular-nums" style="color:var(--text-muted)">{{ member.joinedAt | date: 'dd/MM/yyyy' }}</span>
              @if (member.pseudo; as pseudo) {
                @if (action()?.pseudo !== pseudo) {
                  <span class="flex items-center gap-2">
                    @if (!member.isOwner) {
                      <button type="button" data-testid="member-make-owner" (click)="ask('owner', pseudo)"
                        class="px-2.5 py-1 min-h-11 lg:min-h-0 rounded-(--radius-button) text-xs hover:opacity-80"
                        style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.makeOwner' | translate }}</button>
                    }
                    <button type="button" data-testid="member-remove" (click)="ask('remove', pseudo)"
                      class="px-2.5 py-1 min-h-11 lg:min-h-0 rounded-(--radius-button) text-xs hover:opacity-80"
                      style="background:var(--bg-inactive);color:var(--text-error);border:1px solid var(--border-neutral)">{{ 'admin.groups.removeMember' | translate }}</button>
                  </span>
                }
                @if (action(); as current) {
                  @if (current.pseudo === pseudo) {
                    <div class="basis-full flex flex-col gap-2 pb-1" data-testid="member-confirm">
                      @if (current.kind === 'owner') {
                        <p class="text-sm" style="color:var(--text-muted)">
                          {{ 'admin.groups.makeOwnerWarning' | translate: { pseudo: pseudo, owner: ownerPseudo() ?? '-' } }}
                        </p>
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="button" data-testid="confirm-make-owner" [disabled]="pending()" (click)="ownerChanged.emit(pseudo)"
                            class="px-3 py-1.5 min-h-11 lg:min-h-0 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
                            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-neutral)">{{ 'admin.groups.makeOwnerYes' | translate }}</button>
                          <button type="button" (click)="cancel()" [disabled]="pending()" class="px-2 py-1.5 min-h-11 lg:min-h-0 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
                        </div>
                      } @else if (member.isOwner && others().length > 0) {
                        <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.groups.removeOwnerWarning' | translate: { pseudo: pseudo } }}</p>
                        <div class="flex flex-wrap items-center gap-2">
                          <label [for]="'successor-' + $index" class="sr-only">{{ 'admin.groups.successorLabel' | translate }}</label>
                          <select [id]="'successor-' + $index" data-testid="successor-select" #pick [value]="successor()" (change)="successor.set(pick.value)"
                            class="app-input w-auto">
                            <option value="">{{ 'admin.groups.successorPlaceholder' | translate }}</option>
                            @for (other of others(); track other) {
                              <option [value]="other">{{ other }}</option>
                            }
                          </select>
                          <button type="button" data-testid="confirm-remove-owner" [disabled]="pending() || successor() === ''" (click)="removed.emit({ pseudo: pseudo, successor: successor() })"
                            class="px-3 py-1.5 min-h-11 lg:min-h-0 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
                            style="background:var(--bg-inactive);color:var(--text-error);border:1px solid var(--color-fail)">{{ 'admin.groups.removeOwnerYes' | translate }}</button>
                          <button type="button" (click)="cancel()" [disabled]="pending()" class="px-2 py-1.5 min-h-11 lg:min-h-0 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
                        </div>
                      } @else {
                        <p class="text-sm" style="color:var(--text-muted)">
                          {{ (list.length === 1 ? 'admin.groups.removeLastWarning' : 'admin.groups.removeMemberConfirm') | translate: { pseudo: pseudo } }}
                        </p>
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="button" data-testid="confirm-remove-member" [disabled]="pending()" (click)="removed.emit({ pseudo: pseudo, successor: null })"
                            class="px-3 py-1.5 min-h-11 lg:min-h-0 rounded-(--radius-button) text-sm font-medium disabled:opacity-50"
                            style="background:var(--bg-inactive);color:var(--text-error);border:1px solid var(--color-fail)">{{ (list.length === 1 ? 'admin.groups.removeLastYes' : 'admin.groups.removeMemberYes') | translate }}</button>
                          <button type="button" (click)="cancel()" [disabled]="pending()" class="px-2 py-1.5 min-h-11 lg:min-h-0 text-sm underline" style="color:var(--text-muted)">{{ 'admin.groups.cancel' | translate }}</button>
                        </div>
                      }
                      @if (errorKey(); as key) {
                        <p class="text-sm" role="alert" data-testid="member-error" style="color:var(--text-error)">{{ key | translate }}</p>
                      }
                    </div>
                  }
                }
              }
            </li>
          }
        </ul>
      }
    } @else if (status() === 'error') {
      <p class="text-xs" role="alert" style="color:var(--text-error)">{{ 'admin.groups.membersError' | translate }}</p>
    } @else {
      <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.groups.membersLoading' | translate }}</p>
    }
  `,
})
export class GroupMembersComponent {
  /** Les membres déjà lus, ou `null` si aucune lecture n'a encore abouti. */
  readonly members = input<readonly AdminGroupMember[] | null>(null);
  readonly status = input<'idle' | 'loading' | 'error'>('loading');
  /** L'API n'a pas encore répondu à une action sur un membre de ce groupe. */
  readonly pending = input(false);
  /** La clé de traduction du refus de la dernière action sur ce groupe, sinon `null`. */
  readonly errorKey = input<string | null>(null);
  /** Le pseudo du membre à qui l'admin confie le groupe. */
  readonly ownerChanged = output<string>();
  readonly removed = output<MemberRemoval>();

  protected readonly action = signal<MemberAction | null>(null);
  protected readonly successor = signal('');

  protected readonly ownerPseudo = computed(() => this.members()?.find(m => m.isOwner)?.pseudo ?? null);

  /** Les pseudos des autres membres : à qui le groupe peut passer quand on retire le créateur. */
  protected readonly others = computed(() => {
    const current = this.action();
    return (this.members() ?? []).flatMap(m => (m.pseudo !== null && m.pseudo !== current?.pseudo ? [m.pseudo] : []));
  });

  constructor() {
    // La confirmation se ferme quand l'attente se termine sans refus ; avec un refus, elle reste ouverte pour corriger ou renoncer.
    let wasPending = false;
    effect(() => {
      const pending = this.pending();
      const failed = this.errorKey() !== null;
      untracked(() => {
        if (wasPending && !pending && !failed) this.cancel();
        wasPending = pending;
      });
    });
  }

  protected ask(kind: MemberAction['kind'], pseudo: string): void {
    this.successor.set('');
    this.action.set({ kind, pseudo });
  }

  protected cancel(): void {
    this.action.set(null);
    this.successor.set('');
  }
}
