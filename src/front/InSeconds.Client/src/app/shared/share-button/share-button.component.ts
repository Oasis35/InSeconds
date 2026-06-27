import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-share-button',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './share-button.component.html',
})
export class ShareButtonComponent {
  readonly copied = input.required<boolean>();
  readonly disabled = input(false);
  readonly share = output<void>();
}
