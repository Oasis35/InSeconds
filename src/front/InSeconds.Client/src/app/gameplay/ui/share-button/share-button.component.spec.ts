import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ShareButtonComponent } from './share-button.component';

describe('ShareButtonComponent', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ShareButtonComponent);
    fixture.componentRef.setInput('copied', false);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  it('émet « share » au clic', () => {
    const fixture = render({});
    const emitted = vi.fn();
    fixture.componentInstance.share.subscribe(emitted);
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('désactive le bouton quand « disabled »', () => {
    const fixture = render({ disabled: true });
    expect((fixture.nativeElement as HTMLElement).querySelector('button')!.disabled).toBe(true);
  });

  it('affiche le message d’échec seulement quand « failed »', () => {
    expect((render({}).nativeElement as HTMLElement).querySelector('p')).toBeNull();
  });

  it('affiche le message d’échec quand « failed »', () => {
    TestBed.resetTestingModule();
    expect((render({ failed: true }).nativeElement as HTMLElement).querySelector('p')).not.toBeNull();
  });

  describe('avec des options (bouton scindé)', () => {
    const options = [
      { id: 'short', labelKey: 'daily.share.short', preview: '✅🔶🅾️' },
      { id: 'long', labelKey: 'daily.share.long', preview: '✅❌ 3 s …' },
    ];
    const toggle = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid="share-format-toggle"]')!;
    const menu = (el: HTMLElement) => el.querySelector('[role="menu"]');

    it('la partie principale partage comme avant ; la flèche ouvre le menu avec un aperçu par option', () => {
      const fixture = render({ options });
      const el = fixture.nativeElement as HTMLElement;
      const shared = vi.fn();
      fixture.componentInstance.share.subscribe(shared);

      el.querySelector<HTMLButtonElement>('button')!.click();
      expect(shared).toHaveBeenCalledOnce();
      expect(menu(el)).toBeNull();
      expect(toggle(el).getAttribute('aria-expanded')).toBe('false');

      toggle(el).click();
      fixture.detectChanges();
      expect(toggle(el).getAttribute('aria-expanded')).toBe('true');
      const items = [...el.querySelectorAll('[role="menuitem"]')].map(i => i.textContent);
      expect(items[0]).toContain('daily.share.short');
      expect(items[0]).toContain('✅🔶🅾️');
      expect(items[1]).toContain('✅❌ 3 s …');
    });

    it('un choix émet son identifiant et referme le menu', () => {
      const fixture = render({ options });
      const el = fixture.nativeElement as HTMLElement;
      const chosen = vi.fn();
      fixture.componentInstance.optionChosen.subscribe(chosen);
      toggle(el).click();
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('[data-format="long"]')!.click();
      fixture.detectChanges();
      expect(chosen).toHaveBeenCalledExactlyOnceWith('long');
      expect(menu(el)).toBeNull();
    });

    it('le menu se ferme à Échap et en touchant ailleurs', () => {
      const fixture = render({ options });
      const el = fixture.nativeElement as HTMLElement;
      toggle(el).click();
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(menu(el)).toBeNull();

      toggle(el).click();
      fixture.detectChanges();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      expect(menu(el)).toBeNull();
    });

    it('le partage principal referme le menu ouvert', () => {
      const fixture = render({ options });
      const el = fixture.nativeElement as HTMLElement;
      toggle(el).click();
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('button')!.click();
      fixture.detectChanges();
      expect(menu(el)).toBeNull();
    });

    it('clavier : le premier choix a le focus à l ouverture, ↓ et ↑ passent de l un à l autre en boucle', async () => {
      const fixture = render({ options });
      const el = fixture.nativeElement as HTMLElement;
      document.body.appendChild(el);
      toggle(el).click();
      fixture.detectChanges();
      await fixture.whenStable();
      const items = [...el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      expect(document.activeElement).toBe(items[0]);

      const press = (key: string) => menu(el)!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      press('ArrowDown');
      expect(document.activeElement).toBe(items[1]);
      press('ArrowDown');
      expect(document.activeElement).toBe(items[0]);
      press('ArrowUp');
      expect(document.activeElement).toBe(items[1]);
      el.remove();
    });

    it('désactivé : les deux parties le sont', () => {
      const el = render({ options, disabled: true }).nativeElement as HTMLElement;
      expect([...el.querySelectorAll('button')].map(b => b.disabled)).toEqual([true, true]);
    });
  });

  it('un mode donne ses propres libellés ; ceux du Daily sont les défauts', () => {
    const daily = render({}).nativeElement as HTMLElement;
    expect(daily.querySelector('button')!.textContent).toContain('daily.share.button');

    TestBed.resetTestingModule();
    const runs = render({ labelKey: 'runs.finished.share', copiedKey: 'runs.finished.shareCopied', failedKey: 'runs.finished.shareFailed', failed: true }).nativeElement as HTMLElement;
    expect(runs.querySelector('button')!.textContent).toContain('runs.finished.share');
    expect(runs.querySelector('p')!.textContent).toContain('runs.finished.shareFailed');

    TestBed.resetTestingModule();
    const copied = render({ labelKey: 'runs.finished.share', copiedKey: 'runs.finished.shareCopied', copied: true }).nativeElement as HTMLElement;
    expect(copied.querySelector('button')!.textContent).toContain('runs.finished.shareCopied');
  });
});
