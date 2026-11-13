import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { formatPoints } from './format-points';

/** `{{ 1840 | appPoints }}` → « 1 840 » (français, espace fine insécable) ou « 1,840 » (anglais), dans la langue de l'interface. Impur comme `appSeconds`. */
@Pipe({ name: 'appPoints', pure: false })
export class PointsPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return formatPoints(value, this.translate.getCurrentLang() ?? 'fr');
  }
}
