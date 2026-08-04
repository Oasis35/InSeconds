import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { LanguageService } from '../core/services/language.service';

@Component({
  selector: 'app-deezer-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deezer-badge.component.html',
})
export class DeezerBadgeComponent {
  private readonly language = inject(LanguageService);

  readonly deezerTrackId = input<number | undefined>();
  readonly variant = input<'horizontal' | 'vertical'>('horizontal');
  readonly width = input('196');
  readonly height = input('28');

  protected readonly href = computed(() =>
    this.deezerTrackId() != null ? `https://www.deezer.com/track/${this.deezerTrackId()}` : null,
  );
  protected readonly isEn = computed(() => this.language.current() === 'en');
}
