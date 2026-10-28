import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastFrameAccent, ToastFrameComponent } from './toast-frame.component';

@Component({
  imports: [ToastFrameComponent],
  template: `<app-toast-frame [accent]="accent" [animationClass]="animation"><p id="content">Bravo</p></app-toast-frame>`,
})
class HostComponent {
  accent: ToastFrameAccent = 'orange';
  animation = '';
}

describe('ToastFrameComponent', () => {
  function render(setup: (h: HostComponent) => void = () => {}) {
    const fixture = TestBed.createComponent(HostComponent);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { host: el.querySelector('app-toast-frame')!, panel: el.querySelector<HTMLElement>('app-toast-frame > div')! };
  }

  it('projette le contenu dans le panneau, posé en bas de l\'écran', () => {
    const { host, panel } = render();

    expect(host.classList).toContain('fixed');
    expect(panel.querySelector('#content')?.textContent).toBe('Bravo');
    expect(panel.classList).toContain('rounded-xl');
  });

  it('colore le liseré selon l\'accent', () => {
    expect(render().panel.classList).toContain('border-l-(--color-accent-3)');
    TestBed.resetTestingModule();
    expect(render(h => (h.accent = 'cyan')).panel.classList).toContain('border-l-(--color-accent-2)');
  });

  it('sans animation, pas de data-anim ; avec, la classe et data-anim', () => {
    expect(render().panel.hasAttribute('data-anim')).toBe(false);
    TestBed.resetTestingModule();
    const { panel } = render(h => (h.animation = 'toast-entree'));
    expect(panel.hasAttribute('data-anim')).toBe(true);
    expect(panel.classList).toContain('toast-entree');
    expect(panel.classList).toContain('rounded-xl');
  });
});
