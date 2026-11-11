import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ShareService } from '../../core/share/share.service';
import { environment } from '../../../environments/environment';
import { RUN_SHARE_EMOJI, RunDuel, RunFinish, discStars, shareRounds } from '../domain/run';

/** L'adresse d'une playlist (`/setlist/<code>`), celle que les amis ouvrent, marquée `utm_source=share` comme le partage du score. */
export const playlistUrl = (code: string): string => `${environment.appUrl}/setlist/${code}?utm_source=share`;

/**
 * Le partage d'un run, par le menu de partage du téléphone ou sinon dans le presse-papier, et l'état du bouton (copié, échec) pour quelques secondes,
 * comme au Daily (un partage natif ou un menu fermé ne change rien au bouton) :
 * - à la fin d'une partie, le score en grille : le score et le disque d'abord (ils se lisent dans l'aperçu d'une conversation), une ligne par manche
 *   jouée (un carré par morceau, la difficulté), puis « Fais mieux » et le lien de la même playlist ;
 * - ailleurs (la comparaison), une phrase et le lien de la playlist.
 */
@Injectable()
export class RunShare {
  private readonly sharing = inject(ShareService);
  private readonly translate = inject(TranslateService);

  private readonly _copied = signal(false);
  private readonly _failed = signal(false);
  readonly copied = this._copied.asReadonly();
  readonly failed = this._failed.asReadonly();

  async share(code: string): Promise<void> {
    await this.send([this.translate.instant('runs.share.text'), playlistUrl(code)].join('\n'));
  }

  /** Le score d'une partie finie, en grille, avec l'invitation à battre ce score sur la même playlist. */
  async shareScore(finish: RunFinish, lang: string, duel: RunDuel | null = null): Promise<void> {
    await this.send(runShareText(finish, lang, (key, params) => this.translate.instant(key, params), duel));
  }

  private async send(text: string): Promise<void> {
    const outcome = await this.sharing.share(text);
    if (outcome !== 'copied' && outcome !== 'failed') return;
    const flag = outcome === 'copied' ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), outcome === 'copied' ? 2000 : 3000);
  }
}

/**
 * Le texte du partage d'une partie finie : « 2 410 pts · Disque d'argent · InSeconds Setlist », puis « 🟩🟩🟨🟩🟥 Manche 1 · Normal » pour chaque
 * manche jouée, puis l'invitation et le lien de la playlist (`utm_source=share`). Rien d'un morceau n'y figure : ni artiste ni titre.
 */
export function runShareText(
  finish: RunFinish, lang: string, t: (key: string, params?: Record<string, unknown>) => string, duel: RunDuel | null = null,
): string {
  const numbers = new Intl.NumberFormat(lang);
  const lines = [t('runs.share.header', { score: numbers.format(finish.totalScore), disc: t(finish.disc.key) + discStars(finish.disc) })];
  // Un duel gagné se raconte : « J'ai battu Léa de 126 pts » (jamais une défaite : elle ne se partage pas).
  if (duel && duel.gap > 0) lines.push(t('runs.share.duelWon', { name: duel.pseudo ?? t('runs.link.guest'), points: numbers.format(duel.gap) }));
  for (const round of shareRounds(finish)) {
    const marks = round.marks.map(mark => RUN_SHARE_EMOJI[mark]).join('');
    const name = t('runs.share.round', { round: round.round });
    lines.push(round.difficulty ? `${marks} ${name} · ${t('runs.difficulty.' + round.difficulty)}` : `${marks} ${name}`);
  }
  lines.push(t('runs.share.beatMe'), playlistUrl(finish.challengeCode));
  return lines.join('\n');
}
