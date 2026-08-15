import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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

  protected shortId(playerId: string): string {
    return playerId.slice(0, 8);
  }

  protected isYou(playerId: string): boolean {
    return this.identity.playerId() === playerId;
  }

  protected statusBg(status: string): string {
    if (status === 'Abandoned') return 'rgba(251,191,36,0.1)';
    if (status === 'Pending') return 'var(--bg-inactive)';
    return 'var(--bg-surface-2)';
  }

  protected statusColor(status: string): string {
    if (status === 'Abandoned') return 'var(--bg-warn)';
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
