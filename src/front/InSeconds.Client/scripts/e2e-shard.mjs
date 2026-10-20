// Répartit les specs E2E entre les jobs parallèles de la CI : `node scripts/e2e-shard.mjs <n> <total>` écrit les
// fichiers du job n, à passer à `playwright test`. Playwright découpe (--shard) par nombre de tests et dans l'ordre
// alphabétique : les specs qui jouent des parties entières, en fin d'alphabet, finissaient dans le même job (4 min 20
// contre 1 min 20 pour le premier). Ici, chaque spec a un poids (sa durée en CI, en secondes) et va au job le moins
// chargé, la plus lourde d'abord. Toute spec est jouée : une spec absente de la table compte pour DEFAULT_WEIGHT.
// Poids à remettre à jour quand l'écart entre les jobs se creuse (rapport Playwright : durée par fichier).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SPECS = fileURLToPath(new URL('../e2e/specs/', import.meta.url));
const DEFAULT_WEIGHT = 10;

// Durées mesurées en CI le 19/10/2026 (run 1557).
const WEIGHTS = {
  'admin.spec.ts': 92,
  'scoring.spec.ts': 65,
  'streak-freeze.spec.ts': 52,
  'already-played.spec.ts': 49,
  'login-nudges.spec.ts': 49,
  'share-button.spec.ts': 44,
  'thanks-notice.spec.ts': 30,
  'score-distribution.spec.ts': 30,
  'resume-game.spec.ts': 21,
  'account-data.spec.ts': 19,
  'happy-path.spec.ts': 19,
  'answers-hidden.spec.ts': 19,
  'autocomplete-keyboard-nav.spec.ts': 17,
  'multi-tab.spec.ts': 16,
  'login.spec.ts': 12,
  'devices.spec.ts': 10,
  'profile.spec.ts': 10,
  'change-email.spec.ts': 8,
  'autocomplete-dedup.spec.ts': 7,
  'guess-time-chart.spec.ts': 7,
  'sound-on-click.spec.ts': 6,
  'audio-error.spec.ts': 6,
  'legacy-urls.spec.ts': 4,
  'clear-search.spec.ts': 3,
  'leave-guard.spec.ts': 3,
  'footer.spec.ts': 3,
  'skip-track.spec.ts': 2,
  'no-challenge.spec.ts': 2,
  'mobile-input-zoom.spec.ts': 2,
  'service-down.spec.ts': 1,
  'error-reporting.spec.ts': 1,
};

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
