import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { AdminApiService } from './admin-api.service';

/** État et helpers de l'onglet dashboard (navigation jour/mois, formatage, couleurs). */
@Injectable()
export class AdminStatsService {
  private readonly api = inject(AdminApiService);

  readonly adminStats = this.api.adminStats;
  readonly statsLoading = this.api.statsLoading;
  readonly selectedDay = this.api.selectedDay;
  readonly challenges = this.api.challenges;

  readonly expandedChallenges = signal<Set<number>>(new Set());
  readonly challengeMonth = signal<string>(new Date().toISOString().slice(0, 7));

  constructor() {
    // Synchronise le mois affiché avec les mois réellement disponibles.
    effect(() => {
      const months = [...new Set([...this.challengeMonths(), ...this.challengeListMonths()])].sort().reverse();
      if (months.length > 0 && !months.includes(this.challengeMonth())) {
        this.challengeMonth.set(months[0]);
      }
    });
  }

  readonly totalPlayers = computed(() =>
    (this.adminStats()?.dailyActivity ?? []).reduce((s, d) => s + d.playerCount, 0));

  readonly maxDailyPlayers = computed(() =>
    Math.max(0, ...(this.adminStats()?.dailyActivity ?? []).map(d => d.playerCount)));

  readonly challengeListMonths = computed(() =>
    [...new Set(this.challenges().map(c => c.date.slice(0, 7)))].sort().reverse());

  readonly challengesListForMonth = computed(() =>
    this.challenges().filter(c => c.date.slice(0, 7) === this.challengeMonth()));

  readonly challengeMonths = computed(() =>
    [...new Set(this.adminStats()?.challenges.map(c => new Date(c.date).toISOString().slice(0, 7)) ?? [])].sort().reverse());

  readonly challengesForMonth = computed(() =>
    (this.adminStats()?.challenges ?? []).filter(c => new Date(c.date).toISOString().slice(0, 7) === this.challengeMonth()));

  readonly canGoPrevChallengeMonth = computed(() => {
    const months = this.challengeMonths();
    return months.indexOf(this.challengeMonth()) < months.length - 1;
  });

  readonly canGoNextChallengeMonth = computed(() => {
    const months = this.challengeMonths();
    return months.indexOf(this.challengeMonth()) > 0;
  });

  toggleChallenge(id: number): void {
    const set = new Set(this.expandedChallenges());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.expandedChallenges.set(set);
  }

  shiftChallengeMonth(delta: number): void {
    const months = this.challengeMonths();
    const idx = months.indexOf(this.challengeMonth());
    const next = idx - delta;
    if (next >= 0 && next < months.length) this.challengeMonth.set(months[next]);
  }

  formatChallengeMonth(ym: string): string {
    const [y, m] = ym.split('-');
    const names = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    return `${names[+m - 1]} ${y}`;
  }

  activityBarHeightPx(count: number): string {
    const max = this.maxDailyPlayers();
    if (max === 0) return '2px';
    const pct = count / max;
    return count === 0 ? '2px' : `${Math.max(4, Math.round(pct * 64))}px`;
  }

  toIso(d: Date | string): string {
    if (typeof d === 'string') return d.slice(0, 10);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  isBarSelected(date: Date | string): boolean {
    return this.selectedDay() === this.toIso(date);
  }

  selectDay(date: Date | string): void {
    this.selectedDay.set(this.toIso(date));
  }

  shiftSelectedDay(delta: number): void {
    const dates = (this.adminStats()?.availableDates ?? []).map(d => this.toIso(d));
    if (dates.length === 0) return;
    const idx = dates.indexOf(this.selectedDay());
    // availableDates est DESC (plus récent en premier), donc +1 = aller vers le passé
    const next = idx === -1 ? 0 : idx - delta;
    if (next >= 0 && next < dates.length) this.selectedDay.set(dates[next]);
  }

  canGoToPrevDay(): boolean {
    const dates = (this.adminStats()?.availableDates ?? []).map(d => this.toIso(d));
    if (dates.length === 0) return false;
    return dates.indexOf(this.selectedDay()) < dates.length - 1;
  }

  canGoToNextDay(): boolean {
    const dates = (this.adminStats()?.availableDates ?? []).map(d => this.toIso(d));
    if (dates.length === 0) return false;
    return dates.indexOf(this.selectedDay()) > 0;
  }

  isSelectedDayToday(): boolean {
    return this.selectedDay() === new Date().toISOString().slice(0, 10);
  }

  formatSelectedDay(): string {
    const d = this.selectedDay();
    if (!d) return '';
    return new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  formatActivityDate(d: Date | string): string {
    return new Date(this.toIso(d) + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  completionRateColor(rate: number): string {
    if (rate >= 70) return 'text-green-400';
    if (rate >= 40) return 'text-yellow-400';
    return 'text-red-400';
  }

  rateColor(rate: number): string {
    if (rate >= 60) return 'text-green-400';
    if (rate >= 30) return 'text-yellow-400';
    return 'text-red-400';
  }

  rateBarColor(rate: number): string {
    if (rate >= 60) return 'bg-green-500';
    if (rate >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  }
}
