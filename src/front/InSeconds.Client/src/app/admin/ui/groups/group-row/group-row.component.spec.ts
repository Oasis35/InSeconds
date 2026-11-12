import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { adminGroup } from '../../../data-access/testing/fake-admin-groups-api';
import { GroupRowComponent } from './group-row.component';

@Component({
  imports: [GroupRowComponent],
  template: `<ul><li appGroupRow [group]="group" [pending]="pending()" [errorKey]="errorKey()"
    (renamed)="renamed.push($event)" (resetNameRequested)="resets = resets + 1" (removeRequested)="removals = removals + 1"></li></ul>`,
})
class HostComponent {
  group = adminGroup({ id: 4, name: 'Les copains', memberCount: 3, ownerPseudo: 'Alice' });
  pending = signal(false);
  errorKey = signal<string | null>(null);
  renamed: string[] = [];
  resets = 0;
  removals = 0;
}

describe('GroupRowComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = (testId: string) => {
      (element.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click();
      fixture.detectChanges();
    };
    return { fixture, element, host: fixture.componentInstance, click };
  }

  it('montre le nom et le créateur', () => {
    const { element } = render();
    expect(element.textContent).toContain('Les copains');
    expect(element.textContent).toContain('Alice');
  });

  it('renomme sur place avec le nom rogné', () => {
    const { fixture, element, host, click } = render();
    click('rename-group');
    const input = element.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Les copains');
    input.value = '  Les amis ';
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.renamed).toEqual(['Les amis']);
  });

  it('ne renomme pas avec un nom vide', () => {
    const { fixture, element, host, click } = render();
    click('rename-group');
    const input = element.querySelector('input') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.renamed).toEqual([]);
  });

  it('demande confirmation avant de remettre le nom à zéro', () => {
    const { host, click } = render();
    click('reset-group-name');
    expect(host.resets).toBe(0);
    click('confirm-reset');
    expect(host.resets).toBe(1);
  });

  it('demande confirmation avant de supprimer, et peut renoncer', () => {
    const { element, host, click } = render();
    click('delete-group');
    expect(host.removals).toBe(0);
    expect(element.querySelector('[data-testid="confirm-delete"]')).not.toBeNull();
    (Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('admin.groups.cancel')) as HTMLElement).click();
    expect(host.removals).toBe(0);
  });

  it('se referme quand l\'attente se termine sans refus, et reste ouverte avec un refus', () => {
    const { fixture, element, host, click } = render();
    click('delete-group');
    host.pending.set(true);
    fixture.detectChanges();
    host.pending.set(false);
    host.errorKey.set('errors.social.group_not_found');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="group-error"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="confirm-delete"]')).not.toBeNull();

    host.errorKey.set(null);
    host.pending.set(true);
    fixture.detectChanges();
    host.pending.set(false);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="confirm-delete"]')).toBeNull();
  });
});
