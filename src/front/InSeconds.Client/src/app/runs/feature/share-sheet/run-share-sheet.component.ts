import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { GroupsStore } from '../../../social/data-access/groups.store';
import { Group } from '../../../social/domain/group';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';
import { RunShare } from '../../data-access/run-share';
import { RunDuel, RunFinish } from '../../domain/run';

export interface RunShareSheetData {
  readonly finish: RunFinish;
  readonly lang: string;
  readonly duel: RunDuel | null;
}

/**
 * La feuille de partage de la fin d'une partie (V4), trois lignes d'une phrase : « Défier un ami » (le score et le lien de la playlist),
 * « Inviter dans un groupe » (le lien de la playlist qui fait aussi rejoindre le groupe ; avec plusieurs groupes, on choisit lequel ; sans
 * groupe, « Créer un groupe et inviter ») et « Ma grille » (le résultat seul, sans lien). Chaque partage part dans le clic (le menu du
 * téléphone l'exige), puis la feuille se ferme ; l'état « copié » s'affiche sur le bouton de la page. Ouverte avec l'injecteur de la page.
 */
@Component({
  selector: 'app-run-share-sheet',
  imports: [TranslatePipe, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'runs.shareSheet.title' | translate">
      <div class="flex flex-col gap-2" data-testid="share-sheet">
        <button type="button" class="sheet-row sheet-row--main" (click)="challenge()" data-testid="share-challenge">
          <span class="sheet-title">{{ 'runs.shareSheet.challenge' | translate }}</span>
          <span class="sheet-body">{{ 'runs.shareSheet.challengeBody' | translate: { tracks: data.finish.trackCount } }}</span>
        </button>

        @if (picking()) {
          <div class="flex flex-col gap-2" data-testid="share-group-pick">
            <p class="text-sm pt-1" style="color:var(--text-muted)">{{ 'runs.shareSheet.groupPick' | translate }}</p>
            @for (group of groups.groups(); track group.id) {
              <button type="button" class="sheet-row" (click)="invite(group)" data-testid="share-group-choice"><span class="sheet-title truncate">{{ group.name }}</span></button>
            }
          </div>
        } @else if (groups.groups().length) {
          <button type="button" class="sheet-row" (click)="inviteOrPick()" data-testid="share-group">
            <span class="sheet-title">{{ 'runs.shareSheet.group' | translate }}</span>
            @if (groups.groups().length === 1) {
              <span class="sheet-body">{{ 'runs.shareSheet.groupBody' | translate: { name: groups.groups()[0].name, tracks: data.finish.trackCount } }}</span>
            }
          </button>
        } @else {
          <button type="button" class="sheet-row" (click)="createGroup()" data-testid="share-create-group">
            <span class="sheet-title">{{ 'runs.shareSheet.noGroup' | translate }}</span>
            <span class="sheet-body">{{ 'runs.shareSheet.noGroupBody' | translate }}</span>
          </button>
        }

        <button type="button" class="sheet-row" (click)="grid()" data-testid="share-grid">
          <span class="sheet-title">{{ 'runs.shareSheet.grid' | translate }}</span>
          <span class="sheet-body">{{ 'runs.shareSheet.gridBody' | translate }}</span>
        </button>
      </div>
    </app-modal-frame>
  `,
  styles: `
    .sheet-row {
      display: flex; flex-direction: column; gap: 0.125rem; width: 100%; min-height: 3.5rem; padding: 0.75rem 1rem; text-align: left; cursor: pointer;
      border: 1px solid var(--border-neutral); border-radius: var(--radius-button); touch-action: manipulation;
    }
    .sheet-row--main { border-color: var(--color-accent-3); background: rgb(var(--rgb-accent-3) / 0.08); }
    .sheet-title { font-weight: 700; font-size: 1rem; color: var(--text-hi); }
    .sheet-body { font-size: 0.875rem; color: var(--text-light); }
  `,
})
export class RunShareSheetComponent {
  protected readonly data = inject<RunShareSheetData>(DIALOG_DATA);
  protected readonly groups = inject(GroupsStore);
  private readonly share = inject(RunShare);
  private readonly ref = inject<DialogRef<void>>(DialogRef);
  private readonly router = inject(Router);

  /** Plusieurs groupes : la deuxième ligne laisse la place au choix du groupe. */
  protected readonly picking = signal(false);

  constructor() {
    // Les groupes sont lus à la fin de la partie ; une feuille ouverte avant leur arrivée les demande elle-même.
    if (this.groups.status() === 'idle') void this.groups.loadStandings();
  }

  protected challenge(): void {
    void this.share.shareScore(this.data.finish, this.data.lang, this.data.duel);
    this.ref.close();
  }

  protected inviteOrPick(): void {
    const groups = this.groups.groups();
    if (groups.length === 1) this.invite(groups[0]);
    else this.picking.set(true);
  }

  protected invite(group: Group): void {
    void this.share.shareGroupInvite(this.data.finish.challengeCode, group);
    this.ref.close();
  }

  protected grid(): void {
    void this.share.shareGrid(this.data.finish, this.data.lang);
    this.ref.close();
  }

  protected createGroup(): void {
    this.ref.close();
    void this.router.navigateByUrl('/ranking/new');
  }
}
