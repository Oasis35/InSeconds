import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LONG_TITLE_LENGTH, StoryKind, WeeklyTrack, formatPercent, formatPeriod, sizeClass } from '../domain/weekly-story';

/**
 * Un visuel de story Instagram, 1080×1920, capturé en PNG par le conteneur (`data-story` = le genre).
 * Les textes sont en français en dur : ils sont écrits dans l'image, publiée sur Instagram, quelle que
 * soit la langue de l'admin. Pas de pochette Deezer (piège 47) : une vignette note de musique la remplace.
 */
@Component({
  selector: 'app-weekly-story-visual',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './weekly-story-visual.component.scss',
  host: { '[attr.data-story]': 'kind()' },
  template: `
    <div class="veil"></div>
    <div class="head">
      <span class="logo">IN<span class="logo-accent">//</span>SECONDS</span>
      <span class="period">{{ period() }}</span>
    </div>
    @if (heading(); as text) {
      <div class="title" [class.title-long]="text.length > longTitleLength">{{ text }}</div>
    }
    <div class="pill-row">
      @if (kind() === 'found') {
        <div class="pill">🏆&nbsp; LE PLUS TROUVÉ</div>
      } @else {
        <div class="pill pill-reverse">💀&nbsp; LE PLUS RATÉ</div>
      }
    </div>
    <div class="cover">
      <svg width="170" height="170" viewBox="0 0 24 24" fill="#fff"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" /></svg>
    </div>
    <div class="body">
      <div [class]="'artist ' + sizeClass(track().artist)">{{ track().artist }}</div>
      <div [class]="'song ' + sizeClass(track().title)">{{ track().title }}</div>
      @if (showPercent()) {
        @if (kind() === 'found') {
          <div class="rate">{{ percent() }}</div>
          <div class="caption">ont trouvé artiste + titre</div>
        } @else {
          <div class="rate"><span class="rate-prefix">seulement</span>{{ percent() }}</div>
          <div class="caption">l'ont trouvé</div>
        }
      }
    </div>
    @if (showGuides()) {
      @if (kind() === 'found') {
        <div class="guide guide-music"><span>🎵 sticker musique</span></div>
      } @else {
        <div class="guide guide-poll"><span>📊 sondage</span><span class="guide-sub">« Tu le connaissais ? »</span></div>
      }
    }
    <div class="cta">
      Et toi, tu l'aurais eu&nbsp;?
      @if (showGuides()) { <span class="guide-link">🔗 sticker lien</span> }
    </div>
  `,
})
export class WeeklyStoryVisualComponent {
  readonly kind = input.required<StoryKind>();
  readonly track = input.required<WeeklyTrack>();
  /** Premier et dernier jour du récap (`aaaa-mm-jj`). */
  readonly from = input.required<string>();
  readonly to = input.required<string>();
  /** Titre en haut de l'image ; vide = pas de titre. */
  readonly heading = input('');
  readonly showPercent = input(true);
  readonly showGuides = input(true);

  protected readonly longTitleLength = LONG_TITLE_LENGTH;
  protected readonly sizeClass = sizeClass;
  protected readonly period = computed(() => formatPeriod(this.from(), this.to()));
  protected readonly percent = computed(() => formatPercent(this.track().successRatePercent));
}
