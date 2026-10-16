import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Icônes SVG de la série (flamme) et des gels (flocon), en `currentColor`. */
@Component({
  selector: 'app-player-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-flex;flex-shrink:0' },
  template: `
    @if (name() === 'flame') {
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
      </svg>
    } @else {
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="display:block">
        <path d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7"></path>
        <path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5M4.1 10.4l3.4-.9-.9-3.4M19.9 13.6l-3.4.9.9 3.4M4.1 13.6l3.4.9-.9 3.4M19.9 10.4l-3.4-.9.9-3.4"></path>
      </svg>
    }
  `,
})
export class PlayerIconComponent {
  readonly name = input.required<'flame' | 'snowflake'>();
  readonly size = input('13px');
}
