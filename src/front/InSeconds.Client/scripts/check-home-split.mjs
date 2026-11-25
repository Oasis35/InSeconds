// Vérifie que l'accueil du jeu du jour (`/`) n'importe jamais la manche (`/daily`) : la manche, avec le lecteur audio, la forme d'onde et
// l'autocomplétion, est une route à la demande. Sheriff ne voit pas ces fichiers comme deux ensembles : ils sont tous dans `daily` et
// `gameplay`. Seul `gameplay/data-access/shared-audio` (aucune dépendance) est permis côté accueil, pour déverrouiller le son dans le clic ;
// l'import dynamique de `daily-round.routes` (chargement de fond) n'est pas un `from` et reste permis.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../src/app/', import.meta.url));

// Ce que l'accueil charge d'emblée.
const HOME_SIDE = [
  'daily/feature/home',
  'daily/feature/daily-shell',
  'daily/feature/daily.routes.ts',
  'daily/data-access/home.store.ts',
  'daily/ui/home-challenge-card',
  'daily/ui/home-done-card',
  'daily/ui/home-abandoned-card',
];

// Ce qui est réservé à la manche.
const ROUND_ONLY = [
  /daily-round\.store/,
  /daily-round\.routes/,
  /feature\/daily\/daily\.page/,
  /gameplay\/feature\//,
  /gameplay\/data-access\/(?!shared-audio|testing\/)/,
];

function* filesIn(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) yield* filesIn(join(path, entry));
  } else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) yield path;
}

const violations = [];
for (const part of HOME_SIDE) {
  for (const file of filesIn(join(APP, part))) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const imported = /^\s*(?:import|export)\b.*\bfrom\s+['"]([^'"]+)['"]/.exec(line)?.[1];
      if (imported && ROUND_ONLY.some(rule => rule.test(imported))) violations.push(`${relative(process.cwd(), file)}:${index + 1}  ${line.trim()}`);
    });
  }
}

if (violations.length > 0) {
  console.error("L'accueil (`/`) ne doit pas importer la manche (`/daily`, chargée à la demande) :");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log("check-home-split : l'accueil n'importe rien de la manche.");
