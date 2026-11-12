import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../../core/errors/error-messages';
import { ErrorMessageComponent } from '../../../ui/error-message/error-message.component';
import { AdminGroupsStore } from '../../data-access/groups.store';
import { GroupRowComponent } from '../../ui/groups/group-row/group-row.component';

/**
 * `/admin/groupes` : les groupes de Setlist, le plus récent d'abord, avec un filtre texte (nom ou créateur) et la modération de chacun : renommer,
 * remettre un nom inapproprié à zéro, supprimer. L'admin ne voit ni le code d'invitation ni les membres. Sur PC, un en-tête de colonnes au-dessus
 * des lignes ; sur téléphone, chaque ligne s'empile en carte. La liste n'est lue qu'à l'ouverture de l'onglet.
 */
@Component({
  selector: 'app-admin-groups-page',
  imports: [TranslatePipe, ErrorMessageComponent, GroupRowComponent],
  providers: [AdminGroupsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="flex flex-col gap-4 w-full max-w-2xl lg:max-w-none" data-testid="admin-groups-page">
      <div class="rounded-xl flex flex-col overflow-hidden" style="background:var(--bg-surface)">
        <div class="flex flex-wrap items-center justify-between gap-3 p-4">
          <h2 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
            {{ 'admin.groups.title' | translate: { count: store.groups().length } }}
          </h2>
          <label for="groups-filter-text" class="sr-only">{{ 'admin.groups.filterPlaceholder' | translate }}</label>
          <input id="groups-filter-text" type="search"
            [value]="store.filter()"
            (input)="store.setFilter($any($event.target).value)"
            [placeholder]="'admin.groups.filterPlaceholder' | translate"
            class="w-full sm:w-56 px-3 py-2 rounded-lg text-sm outline-none"
            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-medium)" />
        </div>

        @if (store.error(); as error) {
          <div class="px-4 pb-4">
            <app-error-message [messageKey]="messageKey(error.code)" [traceId]="error.traceId" />
          </div>
        } @else if (!store.isFulfilled()) {
          <p class="text-sm px-4 pb-4" style="color:var(--text-muted)">{{ 'admin.groups.loading' | translate }}</p>
        } @else if (store.groups().length === 0) {
          <p class="text-sm px-4 pb-4" style="color:var(--text-muted)">{{ 'admin.groups.empty' | translate }}</p>
        } @else if (store.filteredGroups().length === 0) {
          <p class="text-sm px-4 pb-4" style="color:var(--text-muted)">{{ 'admin.groups.noMatch' | translate }}</p>
        } @else {
          <div class="hidden lg:grid lg:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1fr)_6rem_18rem] gap-3 px-4 py-2.5 text-xs uppercase tracking-wide"
            style="border-top:1px solid var(--border-medium);color:var(--text-muted)" aria-hidden="true">
            <span>{{ 'admin.groups.colName' | translate }}</span>
            <span class="text-right">{{ 'admin.groups.colMembers' | translate }}</span>
            <span>{{ 'admin.groups.colOwner' | translate }}</span>
            <span>{{ 'admin.groups.colCreated' | translate }}</span>
            <span></span>
          </div>
          <ul class="flex flex-col">
            @for (group of store.filteredGroups(); track group.id) {
              <li appGroupRow [group]="group" [pending]="store.pendingIds().includes(group.id)" [errorKey]="errorKeyOf(group.id)"
                (renamed)="store.renameGroup(group.id, $event)" (resetNameRequested)="store.resetGroupName(group.id)"
                (removeRequested)="store.removeGroup(group.id)"></li>
            }
          </ul>
        }
      </div>
    </section>
  `,
})
export class GroupsPage {
  protected readonly store = inject(AdminGroupsStore);
  protected readonly messageKey = errorMessageKey;

  constructor() {
    void this.store.load();
  }

  /** La clé de traduction du refus de la dernière action sur ce groupe, `null` si elle n'a pas été refusée. */
  protected errorKeyOf(groupId: number): string | null {
    const failure = this.store.actionError();
    return failure?.groupId === groupId ? errorMessageKey(failure.error.code) : null;
  }
}
