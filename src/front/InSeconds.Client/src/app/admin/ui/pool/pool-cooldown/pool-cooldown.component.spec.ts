import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CooldownSettings } from '../../../domain/cooldown';
import { PoolCooldownComponent } from './pool-cooldown.component';

@Component({
  imports: [PoolCooldownComponent],
  template: `<app-pool-cooldown [cooldown]="cooldown()" (savePercent)="saved.push($event)" />`,
})
class HostComponent {
  readonly cooldown = signal<CooldownSettings | null>({ poolPercent: 75, days: 120, playableCount: 800 });
  readonly saved: number[] = [];
}

describe('PoolCooldownComponent', () => {
  async function render(cooldown?: CooldownSettings) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HostComponent);
    if (cooldown) fixture.componentInstance.cooldown.set(cooldown);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('#track-cooldown-percent-input') as HTMLInputElement;
    const button = element.querySelector('[data-testid="cooldown-setting"] button') as HTMLButtonElement;
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, element, input, button, type, host: fixture.componentInstance };
  }

  it('montre les jours appliqués sur la ligne repliée', async () => {
    const { element } = await render();
    expect(element.querySelector('[data-testid="cooldown-days"]')?.textContent).toContain('admin.pool.cooldownSetting.days');
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('enregistre une part valide', async () => {
    const { button, type, host } = await render();
    await type('50');
    button.click();
    expect(host.saved).toEqual([50]);
  });

  it('refuse une part hors bornes : bouton désactivé, rien n\'est envoyé', async () => {
    const { button, type, host } = await render();
    await type('95');
    expect(button.disabled).toBe(true);
    button.click();
    expect(host.saved).toEqual([]);
  });

  it('sous le seuil de 14 jours : avertit qu\'il faut ajouter des morceaux', async () => {
    const { element } = await render({ poolPercent: 75, days: 7, playableCount: 50 });
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('admin.pool.cooldownSetting.cooldownBelowAlert');
  });
});
