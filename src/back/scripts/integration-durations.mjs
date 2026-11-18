// Durée des tests d'intégration par dossier, lue dans les rapports XML de xUnit (`--report-xunit-xml`) : sert à répartir
// les dossiers entre les jobs d'intégration de la CI (`GROUP_1`, `GROUP_2` de .github/workflows/ci.yml).
//
//   gh run download <run> -p 'back-integration-*' -D <dossier>
//   node src/back/scripts/integration-durations.mjs <dossier ou fichier…>
//
// Chaque job en écrit aussi le tableau dans le résumé de son run. La durée d'un dossier est la somme des durées de ses
// tests (sans la création de l'API de chaque classe, que xUnit ne compte pas) : les classes tournant en parallèle, c'est un
// poids pour comparer les dossiers, pas la durée d'un job, que donne la ligne « Durée réelle » de chaque rapport.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = 'InSeconds.IntegrationTests.';

const paths = process.argv.slice(2);
if (paths.length === 0 || paths.some((path) => !existsSync(path))) {
  console.error('Usage : node src/back/scripts/integration-durations.mjs <dossier ou fichier…>');
  process.exit(64);
}

function findReports(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    if (statSync(child).isDirectory()) return findReports(child);
    return name.endsWith('.xml') ? [child] : [];
  });
}

const attribute = (tag, name) => tag.match(new RegExp(String.raw`\s${name}="([^"]*)"`))?.[1];

// Le dossier d'une classe : le segment qui suit l'espace de noms du projet, « (racine) » pour les classes posées à sa racine.
function folderOf(type) {
  const rest = type.startsWith(ROOT) ? type.slice(ROOT.length) : type;
  return rest.includes('.') ? rest.slice(0, rest.indexOf('.')) : '(racine)';
}

const folders = new Map();
const walls = [];
for (const report of paths.flatMap(findReports)) {
  const xml = readFileSync(report, 'utf8');
  const assembly = xml.match(/<assembly\s[^>]*>/)?.[0];
  if (!assembly) continue;
  walls.push([basename(report), Number(attribute(assembly, 'time'))]);
  for (const [tag] of xml.matchAll(/<test\s[^>]*>/g)) {
    const type = attribute(tag, 'type');
    if (!type) continue;
    const folder = folders.get(folderOf(type)) ?? { seconds: 0, tests: 0, classes: new Set() };
    folder.seconds += Number(attribute(tag, 'time') ?? 0);
    folder.tests += 1;
    folder.classes.add(type);
    folders.set(folderOf(type), folder);
  }
}

if (walls.length === 0) {
  console.error('Aucun rapport XML de xUnit dans ces chemins.');
  process.exit(1);
}

const rows = [...folders].sort(([, a], [, b]) => b.seconds - a.seconds);
const total = rows.reduce((sum, [, folder]) => sum + folder.seconds, 0);
console.log('| Dossier | Classes | Tests | Durée cumulée (s) | Part |');
console.log('|---|---:|---:|---:|---:|');
for (const [name, folder] of rows) {
  const share = total > 0 ? Math.round((folder.seconds / total) * 100) : 0;
  console.log(`| ${name} | ${folder.classes.size} | ${folder.tests} | ${Math.round(folder.seconds)} | ${share} % |`);
}
console.log('');
for (const [report, seconds] of walls) console.log(`Durée réelle de ${report} : ${Math.round(seconds)} s`);
