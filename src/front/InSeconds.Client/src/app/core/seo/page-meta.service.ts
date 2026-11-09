import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs';

const SITE_ORIGIN = 'https://inseconds.cc';

/** Les seules adresses que Google doit indexer (le jeu du jour, les réponses d'un jour passé, les deux pages légales). */
const INDEXABLE = [/^\/daily$/, /^\/daily\/archive\/\d{4}-\d{2}-\d{2}$/, /^\/legal$/, /^\/privacy$/];

/** Les pages légales ont leur propre titre (clé de traduction) ; les autres gardent celui de `index.html`. */
const TITLE_KEYS: Readonly<Record<string, string>> = { '/legal': 'legal.title', '/privacy': 'privacy.title' };

/**
 * Dit à Google quelle est l'adresse de chaque page : `index.html` est le même pour toutes les routes, donc sans balise
 * canonique propre à la page Google les prend pour des doublons. Une canonique auto-référencée sans query string
 * (`?utm_source=…`) pour les pages à indexer ; `noindex` (et pas de canonique) pour tout le reste : compte, admin, Platines,
 * page introuvable.
 */
@Injectable({ providedIn: 'root' })
export class PageMetaService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);

  private readonly siteTitle = this.title.getTitle();
  private titled = false;

  /** Appelé au démarrage (provideAppInitializer). */
  init(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.apply(e.urlAfterRedirects));
  }

  /** Applique les balises de l'adresse donnée (query string et fragment ignorés). */
  apply(url: string): void {
    const path = normalize(url);
    const indexable = INDEXABLE.some(rule => rule.test(path));

    if (indexable) {
      const canonical = SITE_ORIGIN + path;
      this.setCanonical(canonical);
      this.meta.updateTag({ property: 'og:url', content: canonical });
      this.meta.removeTag('name="robots"');
    } else {
      this.setCanonical(null);
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    }
    this.applyTitle(path);
  }

  private applyTitle(path: string): void {
    const key = TITLE_KEYS[path];
    if (key) {
      this.translate.get(key).subscribe(t => this.title.setTitle(`${t} - InSeconds`));
      this.titled = true;
    } else if (this.titled) {
      this.title.setTitle(this.siteTitle);
      this.titled = false;
    }
  }

  private setCanonical(href: string | null): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (href === null) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      head.appendChild(link);
    }
    link.href = href;
  }
}

/** Chemin seul, sans query string ni fragment ni slash final ; la racine est le jeu du jour. */
export function normalize(url: string): string {
  let end = url.search(/[?#]/);
  if (end < 0) end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return end === 0 ? '/daily' : url.slice(0, end);
}
