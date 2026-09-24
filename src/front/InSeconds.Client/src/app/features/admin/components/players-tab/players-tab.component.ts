import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';
import { LanguageService } from '../../../../core/services/language.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

@Component({
  selector: 'app-players-tab',
  imports: [DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './players-tab.component.html',
})
export class PlayersTabComponent {
  protected readonly api = inject(AdminApiService);
  private readonly language = inject(LanguageService);

  protected readonly filter = signal('');

  /** Filtre texte sur le pseudo ou l'email (insensible à la casse). */
  protected readonly filteredPlayers = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const players = this.api.registeredPlayers();
    if (!q) return players;
    return players.filter(p =>
      (p.pseudo ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q));
  });

  /** « il y a 3 h », « hier »… dans la langue courante, ou null si jamais vu. */
  protected relativeTime(iso: string | null, now = Date.now()): string | null {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - now;
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(this.language.current(), { numeric: 'auto' });
    if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
    if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
    return rtf.format(Math.round(diff / DAY), 'day');
  }
}
