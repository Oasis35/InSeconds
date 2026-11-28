import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { annotations, flakyTests, summary } from './e2e-flaky.mjs';

const report = {
  suites: [
    {
      specs: [
        { file: 'specs/a.spec.ts', line: 10, title: 'stable', tests: [{ projectName: 'chromium', status: 'expected', results: [{ retry: 0 }] }] },
        { file: 'specs/a.spec.ts', line: 20, title: 'instable', tests: [{ projectName: 'chromium', status: 'flaky', results: [{ retry: 0 }, { retry: 1 }] }] },
      ],
      suites: [
        {
          // Un `describe` : la suite est imbriquée.
          specs: [
            { file: 'specs/b.spec.ts', line: 5, title: 'rouge | barre', tests: [{ projectName: 'webkit', status: 'flaky', results: [{ retry: 0 }, { retry: 1 }] }] },
            { file: 'specs/b.spec.ts', line: 9, title: 'en échec', tests: [{ projectName: 'chromium', status: 'unexpected', results: [{ retry: 0 }, { retry: 1 }] }] },
            { file: 'specs/b.spec.ts', line: 12, title: 'ignoré', tests: [{ projectName: 'chromium', status: 'skipped', results: [] }] },
          ],
        },
      ],
    },
  ],
};

test('ne retient que les tests réussis après un échec, suites imbriquées comprises', () => {
  assert.deepEqual(
    flakyTests(report).map(({ file, line, project, attempts }) => [file, line, project, attempts]),
    [['specs/a.spec.ts', 20, 'chromium', 2], ['specs/b.spec.ts', 5, 'webkit', 2]],
  );
});

test('un rapport sans suite ni test instable ne donne rien', () => {
  assert.deepEqual(flakyTests({}), []);
  assert.deepEqual(flakyTests({ suites: [{ specs: [{ file: 'x', line: 1, title: 't', tests: [{ status: 'expected', results: [{}] }] }] }] }), []);
  assert.equal(summary([]), '');
});

test('une annotation GitHub par test, avec le fichier du dépôt', () => {
  const [first] = annotations(flakyTests(report));
  assert.match(first, /^::warning file=src\/front\/InSeconds\.Client\/e2e\/specs\/a\.spec\.ts,line=20,title=/);
  assert.match(first, /instable \(chromium\) : réussi après 1 échec\(s\)$/);
});

test('le résumé liste chaque test et protège la barre verticale du tableau', () => {
  const text = summary(flakyTests(report));
  assert.match(text, /^### Tests E2E instables \(2\)/);
  assert.match(text, /\| `specs\/b\.spec\.ts:5` \| rouge \/ barre \| webkit \| 2 \|/);
});

// La ligne de commande : le rapport absent, aucun test instable, un seuil dépassé.
const SCRIPT = fileURLToPath(new URL('./e2e-flaky.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });

test('un rapport absent n\'est pas une erreur, un appel sans fichier est refusé', () => {
  assert.equal(run('absent.json').status, 0);
  assert.equal(run().status, 64);
  assert.equal(run('--max', 'x', 'absent.json').status, 64);
});

test("un rapport tronqué n'est pas une erreur de cette étape", () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-flaky-'));
  try {
    const file = join(dir, 'results.json');
    writeFileSync(file, '{"suites": [{"specs": [');
    const result = run(file);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Rapport illisible/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('les tests instables sont annoncés, et seul un seuil dépassé fait échouer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-flaky-'));
  try {
    const file = join(dir, 'results.json');
    writeFileSync(file, JSON.stringify(report));
    const warned = run(file);
    assert.equal(warned.status, 0);
    assert.equal(warned.stdout.split('\n').filter((line) => line.startsWith('::warning')).length, 2);
    assert.equal(run(file, '--max', '2').status, 0);
    assert.equal(run(file, '--max', '1').status, 1);
    writeFileSync(file, JSON.stringify({ suites: [] }));
    assert.match(run(file).stdout, /Aucun test instable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
