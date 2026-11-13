import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { RunsApi } from '../../data-access/runs.api';
import { provideRunsApi } from '../../data-access/runs.providers';
import { SetlistAccessStore } from '../../data-access/setlist-access.store';
import { HomePlaceReader } from '../../../social/data-access/home-place';
import { provideSocialApi } from '../../../social/data-access/social.providers';
import { RunLevel, RunReceivedChallenge } from '../../domain/run';
import { scoreOfDay } from '../../domain/run-history';
import { RunHomeCardComponent } from '../../ui/run-home-card/run-home-card.component';

interface HomeSummary {
  readonly record: number | null;
  readonly level: RunLevel | null;
  readonly todayScore: number | null;
  readonly received: RunReceivedChallenge | null;
  /** Sa meilleure place dans ses groupes et sa place au classement général (s'il y apparaît) : la ligne « 2e dans Potes · 14e au général ». */
  readonly groupPlace: { readonly name: string; readonly rank: number } | null;
  readonly generalRank: number | null;
}

/**
 * L'entrée de Setlist sur l'accueil du jeu du jour, chargée à la demande : la carte n'apparaît que pour un compte connecté qui a l'accès
 * (lu une fois par `SetlistAccessStore`, jamais pour un invité). Sans accès ou sur une erreur, rien n'est affiché. Discrète tant que le
 * défi du jour reste à jouer, mise en avant (contour orange, « Jouer » principal) ensuite. Son record, son niveau et sa setlist du jour sont lus ici ; s'ils manquent (réseau), la
 * carte s'affiche sans eux. Le défi d'un ami en attente (bandeau violet, refusable) et sa place dans ses groupes et au général viennent avec.
 */
@Component({
  selector: 'app-runs-home-entry',
  imports: [RunHomeCardComponent],
  providers: [provideRunsApi(), provideSocialApi()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (access.hasAccess()) {
      <div class="pt-3">
        <app-run-home-card [active]="chrome.dailyDone() === true" [level]="summary().level" [record]="summary().record"
          [todayScore]="summary().todayScore" [lang]="lang()" [received]="summary().received" [groupPlace]="summary().groupPlace"
          [generalRank]="summary().generalRank" (dismissReceived)="dismiss($event)" />
      </div>
    }
  `,
})
export class RunsHomeEntryComponent {
  protected readonly access = inject(SetlistAccessStore);
  protected readonly chrome = inject(ShellChromeStore);
  private readonly api = inject(RunsApi);
  private readonly place = inject(HomePlaceReader);
  private readonly language = inject(LanguageService);

  protected readonly summary = signal<HomeSummary>({ record: null, level: null, todayScore: null, received: null, groupPlace: null, generalRank: null });
  protected readonly lang = computed<'fr' | 'en'>(() => (this.language.current() === 'en' ? 'en' : 'fr'));

  constructor() {
    effect(() => {
      if (this.access.hasAccess()) untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    const [me, history, places] = await Promise.all([this.api.me().catch(() => null), this.api.history(null).catch(() => null), this.place.load().catch(() => null)]);
    this.summary.set({
      record: me?.record?.bestScore ?? null,
      level: me?.level ?? null,
      todayScore: history ? scoreOfDay(history.runs, new Date().toISOString().slice(0, 10)) : null,
      received: me?.received ?? null,
      groupPlace: places?.group ?? null,
      generalRank: places?.general ?? null,
    });
  }

  /** Refuse le défi d'un ami : le bandeau part tout de suite, le serveur suit (un échec le laisse partir, il reviendra à la prochaine visite). */
  protected dismiss(code: string): void {
    this.summary.update(summary => ({ ...summary, received: null }));
    void this.api.dismissReceived(code).catch(() => undefined);
  }
}
