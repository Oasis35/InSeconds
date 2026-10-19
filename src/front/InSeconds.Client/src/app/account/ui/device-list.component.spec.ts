import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Device } from '../domain/device';
import { DeviceListComponent } from './device-list.component';

describe('DeviceListComponent', () => {
  const current: Device = { id: 1, label: 'Chrome · Windows', lastSeenAt: new Date('2026-10-05T10:30:00Z'), isCurrent: true };
  const other: Device = { id: 2, label: null, lastSeenAt: new Date('2026-10-04T08:00:00Z'), isCurrent: false };

  function render(devices: Device[], busyId: number | null = null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { account: { devices: { lastSeen: 'Vu {{ date }}' } } });
    translate.use('fr');
    const fixture = TestBed.createComponent(DeviceListComponent);
    fixture.componentRef.setInput('devices', devices);
    fixture.componentRef.setInput('locale', 'fr');
    fixture.componentRef.setInput('busyId', busyId);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('liste chaque appareil avec son étiquette', () => {
    const { element } = render([current, other]);

    const rows = element.querySelectorAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Chrome · Windows');
    expect(rows[1].textContent).toContain('account.devices.unknownDevice');
  });

  it('marque seulement l\'appareil courant', () => {
    const { element } = render([current, other]);

    expect(element.querySelector('[data-testid="device-1"]')?.textContent).toContain('account.devices.current');
    expect(element.querySelector('[data-testid="device-2"]')?.textContent).not.toContain('account.devices.current');
  });

  it('écrit la dernière activité dans la langue demandée', () => {
    const { element } = render([current]);

    const french = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' }).format(current.lastSeenAt);
    expect(element.textContent).toContain(french);
  });

  it('émet l\'identifiant de l\'appareil à déconnecter', () => {
    const { fixture, element } = render([current, other]);
    const revoked: number[] = [];
    fixture.componentInstance.revoke.subscribe(id => revoked.push(id));

    element.querySelector<HTMLButtonElement>('[data-testid="device-2"] button')!.click();

    expect(revoked).toEqual([2]);
  });

  it('désactive le bouton de l\'appareil en cours de déconnexion seulement', () => {
    const { element } = render([current, other], 2);

    expect(element.querySelector<HTMLButtonElement>('[data-testid="device-2"] button')!.disabled).toBe(true);
    expect(element.querySelector<HTMLButtonElement>('[data-testid="device-1"] button')!.disabled).toBe(false);
  });
});
