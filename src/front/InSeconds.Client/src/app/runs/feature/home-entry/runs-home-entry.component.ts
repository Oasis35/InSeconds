import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { RunsApi } from '../../data-access/runs.api';
import { provideRunsApi } from '../../data-access/runs.providers';
import { SetlistAccessStore } from '../../data-access/setlist-access.store';
import { RunLevel } from '../../domain/run';
import { scoreOfDay } from '../../domain/run-history';
import { RunHomeCardComponent } from '../../ui/run-home-card/run-home-card.component';

interface HomeSummary {
  readonly record: number | null;
  readonly level: RunLevel | null;
  readonly todayScore: number | null;
}

/**
 * L'entrée de Setlist sur l'accueil du jeu du jour, chargée à la demande : la carte n'apparaît que pour un compte connecté qui a l'accès
 * (lu une fois par `SetlistAccessStore`, jamais pour un invité). Sans accès ou sur une erreur, rien n'est affiché. Discrète tant que le
 * défi du jour reste à jouer, en grand ensuite. Son record, son niveau et sa setlist du jour sont lus ici ; s'ils manquent (réseau), la
 * carte s'affiche sans eux.
 */
@Component({
  selector: 'app-runs-home-entry',
  imports: [RunHomeCardComponent],
  providers: [provideRunsApi()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (access.hasAccess()) {
      <div class="pt-3">
        <app-run-home-card [big]="chrome.dailyDone() === true" [level]="summary().level" [record]="summary().record"
          [todayScore]="summary().todayScore" [lang]="lang()" />
      </div>
    }
  `,
})
export class RunsHomeEntryComponent {
  protected readonly access = inject(SetlistAccessStore);
  protected readonly chrome = inject(ShellChromeStore);
  private readonly api = inject(RunsApi);
  private readonly language = inject(LanguageService);

  protected readonly summary = signal<HomeSummary>({ record: null, level: null, todayScore: null });
  protected readonly lang = computed<'fr' | 'en'>(() => (this.language.current() === 'en' ? 'en' : 'fr'));

  constructor() {
    effect(() => {
      if (this.access.hasAccess()) untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    const [me, history] = await Promise.all([this.api.me().catch(() => null), this.api.history(null).catch(() => null)]);
    this.summary.set({
      record: me?.record?.bestScore ?? null,
      level: me?.level ?? null,
      todayScore: history ? scoreOfDay(history.runs, new Date().toISOString().slice(0, 10)) : null,
    });
  }
}
