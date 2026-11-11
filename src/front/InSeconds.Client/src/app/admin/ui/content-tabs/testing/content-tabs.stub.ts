import { Component, Type, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ContentTabsComponent } from '../content-tabs.component';

/** Remplace la barre des pages du contenu : les pages dont le test fournit un faux `Router` ne peuvent pas rendre de vrais liens. */
@Component({ selector: 'app-content-tabs', template: '' })
export class ContentTabsStub {
  readonly candidates = input<number | null>(null);
}

export function stubContentTabs(page: Type<unknown>): void {
  TestBed.overrideComponent(page, { remove: { imports: [ContentTabsComponent] }, add: { imports: [ContentTabsStub] } });
}
