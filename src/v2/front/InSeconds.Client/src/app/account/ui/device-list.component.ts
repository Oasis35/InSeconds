import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../ui/button/button.component';
import { Device } from '../domain/device';

/**
 * Appareils connectés au compte : étiquette (« Chrome · Android »), dernière activité, badge sur
 * l'appareil courant et bouton de déconnexion par appareil. Purement visuel : la confirmation et
 * l'appel à l'API sont dans la page.
 */
@Component({
  selector: 'app-device-list',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex flex-col gap-2" data-testid="device-list">
      @for (device of rows(); track device.id) {
        <li class="flex items-center gap-3 rounded-xl px-4 py-3 text-left"
          style="background:var(--bg-surface);border:1px solid var(--border-medium)" [attr.data-testid]="'device-' + device.id">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold" style="color:var(--text-hi)">
              {{ device.label ?? ('account.devices.unknownDevice' | translate) }}
              @if (device.isCurrent) {
                <span class="ml-2 rounded-full px-2 py-0.5 text-xs font-bold uppercase"
                  style="background:rgb(var(--rgb-accent-2) / 0.15);color:var(--color-accent-2)">
                  {{ 'account.devices.current' | translate }}
                </span>
              }
            </p>
            <p class="text-xs" style="color:var(--text-muted)">
              {{ 'account.devices.lastSeen' | translate: { date: device.lastSeen } }}
            </p>
          </div>
          <button appButton type="button" variant="secondary" size="sm" [disabled]="busyId() === device.id"
            (click)="revoke.emit(device.id)">
            {{ 'account.devices.revoke' | translate }}
          </button>
        </li>
      }
    </ul>
  `,
})
export class DeviceListComponent {
  readonly devices = input.required<readonly Device[]>();
  /** Langue de l'interface (`fr`, `en`) pour écrire les dates. */
  readonly locale = input.required<string>();
  /** Appareil dont la déconnexion est en cours. */
  readonly busyId = input<number | null>(null);

  readonly revoke = output<number>();

  protected readonly rows = computed(() => {
    const format = new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium', timeStyle: 'short' });
    return this.devices().map(device => ({ ...device, lastSeen: format.format(device.lastSeenAt) }));
  });
}
