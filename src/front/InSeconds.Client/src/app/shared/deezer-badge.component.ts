import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-deezer-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deezer-badge.component.html',
})
export class DeezerBadgeComponent {
  readonly width = input('196');
  readonly height = input('28');
}
