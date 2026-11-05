import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunCardKey, RunCardOffer, RunHandCard } from '../../domain/run-cards';
import { RunPalierComponent } from './run-palier.component';

describe('RunPalierComponent', () => {
  function render(overrides: { offer?: RunCardOffer | null; hand?: RunHandCard[]; pending?: RunCardKey | null } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunPalierComponent);
    const set = fixture.componentRef.setInput.bind(fixture.componentRef);
    set('passed', { round: 1, score: 250, objective: 200, disc: { key: 'runs.discs.wax', stars: 0 } });
    set('rounds', 4);
    set('wonDiscs', ['runs.discs.wax']);
    set('nextRound', 2);
    set('nextObjective', 366);
    set('nextDisc', 'runs.discs.bronze');
    set('offer', overrides.offer === undefined ? { afterRound: 1, cards: ['three_choices', 'joker', 'hourglass'] } : overrides.offer);
    set('hand', overrides.hand ?? [{ slot: 1, card: 'year' }]);
    set('handSize', 2);
    set('values', { extendListenSeconds: 20, hourglassSeconds: 30, lowerTargetPercent: 20 });
    set('pending', overrides.pending ?? null);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const text = (testId: string) => element.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    return { fixture, element, text };
  }

  it('le disque gagné, le score de la manche (qui monte jusqu\'à lui) et l\'objectif suivant', async () => {
    const { element, text } = render();

    expect(text('run-palier-disc')).toBe('Disque de cire');
    await vi.waitFor(() => expect(text('run-palier-score')).toBe('250'));
    expect(text('run-palier-next')).toContain('366');
    expect(text('run-palier-next')).toContain('pts pour');
    // L'étagère : le disque gagné, puis trois emplacements en pointillé.
    expect(element.querySelectorAll('ul[aria-label] > li app-run-disc')).toHaveLength(1);
    expect(element.querySelectorAll('ul[aria-label] > li')).toHaveLength(4);
  });

  it('les trois cartes de l\'offre, leur signe et leur nom ; la main et son emplacement libre', () => {
    const { element, text } = render();

    // Le signe dans le coin, puis le nom : deux éléments.
    expect(text('run-offer-three_choices')).toBe('3Trois choix');
    expect(text('run-offer-joker')).toBe('↻Joker');
    expect(text('run-offer-hourglass')).toBe('+30Sablier');
    expect(text('run-hand-year')).toBe('’95Année');
    expect(element.querySelectorAll('[data-testid="run-hand"] > li')).toHaveLength(2);
    expect(element.querySelector('[data-testid="run-hand-drop-hint"]')).toBeNull();
  });

  it('toucher une carte, passer, suite : la page reçoit chaque geste', () => {
    const { fixture, element } = render();
    const picked: RunCardKey[] = [];
    let passed = 0;
    let next = 0;
    fixture.componentInstance.pick.subscribe(card => picked.push(card));
    fixture.componentInstance.pass.subscribe(() => passed++);
    fixture.componentInstance.next.subscribe(() => next++);

    element.querySelector<HTMLButtonElement>('[data-testid="run-offer-joker"]')!.click();
    element.querySelector<HTMLButtonElement>('[data-testid="run-palier-pass"]')!.click();
    element.querySelector<HTMLButtonElement>('[data-testid="run-palier-next-button"]')!.click();

    expect(picked).toEqual(['joker']);
    expect([passed, next]).toEqual([1, 1]);
  });

  it('main pleine avec une carte en attente : « Touche la carte à lâcher », la carte de la main s\'échange', () => {
    const { fixture, element } = render({ hand: [{ slot: 1, card: 'year' }, { slot: 2, card: 'net' }], pending: 'joker' });
    const dropped: number[] = [];
    fixture.componentInstance.drop.subscribe(slot => dropped.push(slot));

    expect(element.querySelector('[data-testid="run-hand-drop-hint"]')?.textContent?.trim()).toBe('Touche la carte à lâcher');
    expect(element.querySelector('[data-testid="run-offer-joker"]')?.getAttribute('aria-pressed')).toBe('true');
    element.querySelector<HTMLButtonElement>('[data-testid="run-hand-net"]')!.click();

    expect(dropped).toEqual([2]);
  });

  it('sans carte en attente, les cartes de la main ne se touchent pas', () => {
    const { element } = render();

    expect(element.querySelector<HTMLButtonElement>('[data-testid="run-hand-year"]')!.disabled).toBe(true);
  });

  it('l\'offre prise ou passée disparaît', () => {
    const { element } = render({ offer: null });

    expect(element.querySelector('[data-testid="run-palier-pass"]')).toBeNull();
    expect(element.querySelector('[data-card]')).toBeNull();
  });
});
