import { Component, inject, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminStatsService } from '../../services/admin-stats.service';
import { PlayerIdentityService } from '../../../../core/services/player-identity.service';
import { ClipboardService } from '../../../../core/services/clipboard.service';

@Component({
  selector: 'app-challenges-tab',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './challenges-tab.component.html',
})
export class ChallengesTabComponent {
  protected readonly stats = inject(AdminStatsService);
  private readonly identity = inject(PlayerIdentityService);
  private readonly clipboard = inject(ClipboardService);

  // Feedback "copié" affiché uniquement sur le chip cliqué (pas un booléen global).
  protected readonly copiedPlayerId = signal<string | null>(null);

  // Clic gauche sur un chip → met en surbrillance tous les chips du même joueur
  // (tous les défis affichés) ; re-clic ou clic sur un autre chip bascule.
  protected readonly highlightedPlayerId = signal<string | null>(null);

  constructor() {
    // Changer de mois vide la sélection : sinon, si le joueur surligné n'a pas joué
    // ce mois-là, tous les chips passeraient à `opacity 0.3` sans surbrillance visible.
    effect(() => {
      this.stats.challengeMonth();
      this.highlightedPlayerId.set(null);
    });
  }

  protected selectPlayer(playerId: string): void {
    this.highlightedPlayerId.update(cur => (cur === playerId ? null : playerId));
  }

  protected isHighlighted(playerId: string): boolean {
    return this.highlightedPlayerId() === playerId;
  }

  protected isDimmed(playerId: string): boolean {
    const h = this.highlightedPlayerId();
    return h !== null && h !== playerId;
  }

  /** Clic droit sur un chip → copie l'ID complet (le clic gauche sert à la surbrillance). */
  protected onChipContextMenu(event: MouseEvent, playerId: string): void {
    event.preventDefault();
    this.copyPlayerId(playerId);
  }

  protected shortId(playerId: string): string {
    return playerId.slice(0, 8);
  }

  protected isYou(playerId: string): boolean {
    return this.identity.playerId() === playerId;
  }

  private readonly colorCache = new Map<string, { bg: string; border: string; text: string }>();

  private idHue(playerId: string): number {
    let h = 0;
    for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  /**
   * Teinte HSL déterministe (fond / bordure / texte) dérivée de l'ID joueur : un même
   * joueur garde la même couleur d'un défi à l'autre → repérage visuel des habitués.
   * Mémoïsé : l'ID est stable, inutile de re-hasher à chaque détection de changement.
   */
  protected chipColors(playerId: string): { bg: string; border: string; text: string } {
    let c = this.colorCache.get(playerId);
    if (!c) {
      const hue = this.idHue(playerId);
      c = {
        bg:     `hsl(${hue} 70% 55% / 0.18)`,
        border: `hsl(${hue} 65% 62% / 0.42)`,
        text:   `hsl(${hue} 85% 82%)`,
      };
      this.colorCache.set(playerId, c);
    }
    return c;
  }

  /** Couleur du point de statut affiché devant les chips non terminés (Abandoned/Expired/Pending). */
  protected statusColor(status: string): string {
    if (status === 'Abandoned') return 'var(--bg-warn)';
    if (status === 'Expired') return 'var(--text-muted)';
    if (status === 'Pending') return 'var(--text-faint)';
    return 'var(--text-muted)';
  }

  protected copyPlayerId(playerId: string): void {
    this.clipboard.copy(playerId).then(ok => {
      if (!ok) return;
      this.copiedPlayerId.set(playerId);
      setTimeout(() => {
        if (this.copiedPlayerId() === playerId) this.copiedPlayerId.set(null);
      }, 1500);
    });
  }
}
