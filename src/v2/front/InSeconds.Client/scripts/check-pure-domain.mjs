// Vérifie que la couche `domain/` de chaque domaine du front v2 reste du TypeScript pur
// (§ 3.3 du plan v2) : aucun import d'Angular, de NgRx, de RxJS ni de ngx-translate. Sheriff ne
// contrôle que les imports entre dossiers de l'app, pas les bibliothèques : ce script complète
// `sheriff verify` dans `npm run lint:arch`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = new URL('../src/app/', import.meta.url).pathname;
const FORBIDDEN = /from\s+['"](@angular\/|@ngrx\/|rxjs|@ngx-translate\/)/;

function* filesIn(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* filesIn(path);
    else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) yield path;
  }
}

const violations = [];
for (const domain of readdirSync(APP)) {
  const domainDir = join(APP, domain, 'domain');
  let exists = false;
  try {
    exists = statSync(domainDir).isDirectory();
  } catch {
    // ce dossier n'a pas de couche domain
  }
  if (!exists) continue;
  for (const file of filesIn(domainDir)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (FORBIDDEN.test(line)) violations.push(`${relative(process.cwd(), file)}:${index + 1}  ${line.trim()}`);
    });
  }
}

if (violations.length > 0) {
  console.error('La couche domain/ doit rester du TypeScript pur (aucun import Angular, NgRx, RxJS, ngx-translate) :');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log('check-pure-domain : aucune couche domain/ n\'importe de bibliothèque interdite.');
