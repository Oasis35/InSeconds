import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { formatSeconds } from './format-seconds';

/**
 * `{{ 0.5 | appSeconds }}` → « 0,5 s » (français) ou « 0.5 s » (anglais), dans la langue de
 * l'interface. Impur pour suivre un changement de langue, comme le `TranslatePipe`.
 */
@Pipe({ name: 'appSeconds', pure: false })
export class SecondsPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: number, fractionDigits?: number): string {
    return formatSeconds(value, this.translate.getCurrentLang() ?? 'fr', fractionDigits);
  }
}
