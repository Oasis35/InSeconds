import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { Streak, isFreezeStockFull, isStreakProtected, pluralKey, toUtcDate } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';
import { FreezeCellsComponent } from '../freeze-cells/freeze-cells.component';

export type StreakSheetVariant = 'linked' | 'protected' | 'guest';

/** Données du panneau (`DIALOG_DATA`) ; `lang` sert au nom des jours de la frise. */
export interface StreakSheetData {
  streak: Streak;
  linked: boolean;
  lang: string;
}

/** Résultat de fermeture ; Échap / fond ferment sans résultat. */
export type StreakSheetResult = 'close' | 'playNow' | 'signup';

interface FriezeDay {
  kind: 'played' | 'freeze' | 'today';
  label: string;
}

/**
 * Contenu du panneau bas « série / gel » (ouvert par `ModalService.openSheet` au clic sur la gélule).
 * 3 variantes : compte connecté (stock + progression), série protégée (frise des jours + « Jouer
 * maintenant »), invité (présentation du gel + « Créer un compte »).
 */
@Component({
  selector: 'app-streak-sheet',
  imports: [TranslatePipe, StreakIconComponent, FreezeCellsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-sheet.component.html',
})
export class StreakSheetComponent {
  private readonly data = inject<StreakSheetData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<StreakSheetResult>>(DialogRef);

  protected readonly streak = computed(() => this.data.streak);
  protected readonly variant: StreakSheetVariant = !this.data.linked
    ? 'guest'
    : isStreakProtected(this.data.streak, this.data.linked) ? 'protected' : 'linked';

  /** Stock déjà au plafond : aucun nouveau gel ne peut être gagné pour l'instant. */
  protected readonly atMax = isFreezeStockFull(this.data.streak);

  protected readonly remaining = this.data.streak.nextFreezeInDays ?? 0;
  protected readonly nextFreezeAt = this.data.streak.streak + this.remaining;
  protected readonly remainingKey = `daily.streakFreeze.sheet.remaining.${pluralKey(this.remaining)}`;
  protected readonly missedKey = pluralKey(this.data.streak.missedDays);

  /** Progression vers le prochain gel, en % (0 juste après un gain). */
  protected readonly progressPercent = (() => {
    const every = this.data.streak.freezeEveryDays;
    return every > 0 ? Math.round(((every - this.remaining) % every) / every * 100) : 0;
  })();

  /** Frise : jusqu'à 2 derniers jours joués, les jours manqués gelés, puis aujourd'hui. */
  protected readonly friezeDays: FriezeDay[] = (() => {
    const s = this.data.streak;
    const last = toUtcDate(s.lastPlayedDate);
    if (!last) return [];
    const label = (offset: number) => {
      const d = new Date(last.getTime() + offset * 86_400_000);
      return new Intl.DateTimeFormat(this.data.lang, { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
    };
    const played = Math.min(s.streak, 2);
    const days: FriezeDay[] = [];
    for (let i = played - 1; i >= 0; i--) days.push({ kind: 'played', label: label(-i) });
    for (let i = 1; i <= s.missedDays; i++) days.push({ kind: 'freeze', label: '' });
    days.push({ kind: 'today', label: '' });
    return days;
  })();

  protected finish(result: StreakSheetResult): void {
    this.ref.close(result);
  }
}
