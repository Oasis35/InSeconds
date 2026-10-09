import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ChallengePlayer, chipColors, playerLabel, statusDotColor, statusLabelKey } from '../domain/challenge';

/**
 * Un chip par joueur d'un défi : son pseudo, sinon l'identifiant court (8 caractères). Couleur
 * déterministe tirée de l'identifiant ; le joueur de ce navigateur porte « toi » et la couleur
 * principale. Clic gauche : surbrillance croisée (le même joueur est entouré sur tous les défis) ;
 * clic droit : copie de l'identifiant complet.
 */
@Component({
  selector: 'app-challenge-player-chips',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap gap-1 mt-2">
      @for (p of players(); track p.playerId) {
        @let mine = p.playerId === youId();
        @let col = colors(p.playerId);
        @let key = statusKey(p.status);
        <button type="button"
          (click)="playerSelected.emit(p.playerId)"
          (contextmenu)="onContextMenu($event, p.playerId)"
          [attr.title]="p.playerId + ' — ' + (key ? (key | translate) : p.status) + (p.status === 'Completed' ? ' — ' + p.score + ' pts' : '')"
          class="text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all inline-flex items-center gap-1"
          [style.opacity]="isDimmed(p.playerId) ? '0.3' : null"
          [style.background]="mine ? 'var(--bg-primary)' : col.bg"
          [style.border-color]="mine ? 'var(--bg-primary)' : col.border"
          [style.color]="mine ? 'var(--text-on-primary)' : col.text"
          [style.box-shadow]="highlightedId() === p.playerId ? '0 0 0 2px ' + col.text : null">
          @if (copiedId() === p.playerId) {
            {{ 'admin.dashboard.copied' | translate }}
          } @else {
            @if (p.status !== 'Completed') {
              <span class="w-1 h-1 rounded-full shrink-0" [style.background]="dotColor(p.status)"></span>
            }
            {{ label(p) }}@if (mine) { · {{ 'admin.dashboard.you' | translate }} }
          }
        </button>
      }
    </div>
  `,
})
export class ChallengePlayerChipsComponent {
  readonly players = input.required<readonly ChallengePlayer[]>();
  /** L'identifiant du joueur de ce navigateur, s'il y en a un. */
  readonly youId = input<string | null>(null);
  /** Le joueur surligné sur tous les défis. */
  readonly highlightedId = input<string | null>(null);
  /** Le joueur dont l'identifiant vient d'être copié. */
  readonly copiedId = input<string | null>(null);
  readonly playerSelected = output<string>();
  readonly playerCopied = output<string>();

  protected readonly colors = chipColors;
  protected readonly label = playerLabel;
  protected readonly statusKey = statusLabelKey;
  protected readonly dotColor = statusDotColor;

  protected isDimmed(playerId: string): boolean {
    const highlighted = this.highlightedId();
    return highlighted !== null && highlighted !== playerId;
  }

  /** Le clic droit copie l'identifiant complet (le clic gauche sert à la surbrillance). */
  protected onContextMenu(event: MouseEvent, playerId: string): void {
    event.preventDefault();
    this.playerCopied.emit(playerId);
  }
}
