import { Component, input, output, inject, computed, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StreakDto } from '../../core/models/game.models';
import { pluralKey, toUtcDate } from '../../core/models/streak';
import { LanguageService } from '../../core/services/language.service';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';
import { FreezeCellsComponent } from '../freeze-cells/freeze-cells.component';

export type StreakSheetVariant = 'linked' | 'protected' | 'guest';

interface FriezeDay {
  kind: 'played' | 'freeze' | 'today';
  label: string;
}

/**
 * Panneau bas « série / gel » ouvert au clic sur la gélule du header. 3 variantes :
 * compte connecté (stock + progression), série protégée (frise des jours + « Jouer
 * maintenant »), invité (présentation du gel + « Créer un compte »).
 * Fermeture : fond, « Fermer / Plus tard » ou `Échap`.
 */
@Component({
  selector: 'app-streak-sheet',
  imports: [TranslatePipe, StreakIconComponent, FreezeCellsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-sheet.component.html',
})
export class StreakSheetComponent {
  private readonly language = inject(LanguageService);

  readonly streak = input.required<StreakDto>();
  readonly linked = input.required<boolean>();

  readonly closed = output<void>();
  readonly playNow = output<void>();
  readonly signup = output<void>();

  protected readonly variant = computed<StreakSheetVariant>(() => {
    if (!this.linked()) return 'guest';
    return this.streak().status === 'protected' ? 'protected' : 'linked';
  });

  protected readonly remaining = computed(() => this.streak().nextFreezeInDays ?? 0);
  protected readonly nextFreezeAt = computed(() => this.streak().streak + this.remaining());
  protected readonly remainingKey = computed(() => `streakFreeze.sheet.remaining.${pluralKey(this.remaining())}`);
  protected readonly missedKey = computed(() => pluralKey(this.streak().missedDays));

  /** Progression vers le prochain gel, en % (0 juste après un gain). */
  protected readonly progressPercent = computed(() => {
    const every = this.streak().freezeEveryDays;
    return every > 0 ? Math.round(((every - this.remaining()) % every) / every * 100) : 0;
  });

  /** Frise : jusqu'à 2 derniers jours joués, les jours manqués gelés, puis aujourd'hui. */
  protected readonly friezeDays = computed<FriezeDay[]>(() => {
    const s = this.streak();
    const last = toUtcDate(s.lastPlayedDate);
    if (!last) return [];
    const lang = this.language.current();
    const label = (offset: number) => {
      const d = new Date(last.getTime() + offset * 86_400_000);
      return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
    };
    const played = Math.min(s.streak, 2);
    const days: FriezeDay[] = [];
    for (let i = played - 1; i >= 0; i--) days.push({ kind: 'played', label: label(-i) });
    for (let i = 1; i <= s.missedDays; i++) days.push({ kind: 'freeze', label: '' });
    days.push({ kind: 'today', label: '' });
    return days;
  });

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closed.emit();
  }
}
