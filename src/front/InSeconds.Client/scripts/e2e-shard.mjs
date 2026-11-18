// Répartit les specs E2E entre les jobs parallèles de la CI : `node scripts/e2e-shard.mjs <n> <total>` écrit les
// fichiers du job n, à passer à `playwright test`. Playwright découpe (--shard) par nombre de tests et dans l'ordre
// alphabétique : les specs qui jouent des parties entières, en fin d'alphabet, finissaient dans le même job (4 min 20
// contre 1 min 20 pour le premier). Ici, chaque spec a un poids (sa durée en CI, en secondes, dans e2e-weights.json)
// et va au job le moins chargé, la plus lourde d'abord. Toute spec est jouée : une spec absente de la table compte
// pour DEFAULT_WEIGHT. Poids mesurés, jamais estimés : `node scripts/e2e-weights.mjs <rapports>` les recalcule.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SPECS = fileURLToPath(new URL('../e2e/specs/', import.meta.url));
const DEFAULT_WEIGHT = 10;
const { weights: WEIGHTS } = JSON.parse(readFileSync(new URL('./e2e-weights.json', import.meta.url), 'utf8'));

const [shard, total] = process.argv.slice(2).map(Number);
if (!Number.isInteger(shard) || !Number.isInteger(total) || shard < 1 || shard > total) {
  console.error('Usage : node scripts/e2e-shard.mjs <n> <total>, avec 1 ≤ n ≤ total');
  process.exit(64);
}

const weightOf = (file) => WEIGHTS[file] ?? DEFAULT_WEIGHT;
const specs = readdirSync(SPECS)
  .filter((file) => file.endsWith('.spec.ts'))
  .sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b));

const jobs = Array.from({ length: total }, () => ({ load: 0, files: [] }));
for (const file of specs) {
  const lightest = jobs.reduce((min, job) => (job.load < min.load ? job : min), jobs[0]);
  lightest.load += weightOf(file);
  lightest.files.push(`e2e/specs/${file}`);
}

console.log(jobs[shard - 1].files.join(' '));
