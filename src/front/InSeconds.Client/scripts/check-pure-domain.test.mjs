// Tests de la garde `check-pure-domain.mjs` : `node --test scripts/check-pure-domain.test.mjs`.
// Le script lit `../src/app/` à côté de lui : on le copie dans un dossier temporaire avec des fixtures, sans le modifier.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-pure-domain.mjs', import.meta.url));

/** Un faux dépôt : le script copié et les fichiers donnés (chemin sous `src/app/`, contenu). Rend son résultat. */
function runOn(files) {
  const root = mkdtempSync(join(tmpdir(), 'pure-domain-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    copyFileSync(SCRIPT, join(root, 'scripts', 'check-pure-domain.mjs'));
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, 'src', 'app', path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    mkdirSync(join(root, 'src', 'app'), { recursive: true });
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'check-pure-domain.mjs')], { cwd: root, encoding: 'utf8' });
    return { status: result.status, out: result.stdout, err: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('un domaine en TypeScript pur passe', () => {
  const { status, out } = runOn({ 'daily/domain/score.ts': "import { other } from './other';\nexport const x = other + 1;\n", 'daily/domain/other.ts': 'export const other = 1;\n' });

  assert.equal(status, 0);
  assert.match(out, /aucune couche domain\/ n'importe de bibliothèque interdite/);
});

test('un dépôt sans couche domain passe', () => {
  assert.equal(runOn({ 'core/thing.ts': "import { Injectable } from '@angular/core';\n" }).status, 0);
});

for (const library of ['@angular/core', '@ngrx/signals', 'rxjs', 'rxjs/operators', '@ngx-translate/core']) {
  test(`un import de ${library} dans domain/ est refusé, avec son fichier et sa ligne`, () => {
    const { status, err } = runOn({ 'gameplay/domain/round.ts': `export const a = 1;\nimport { x } from '${library}';\n` });

    assert.equal(status, 1);
    assert.match(err, /gameplay[\\/]domain[\\/]round\.ts:2/);
    assert.match(err, new RegExp(library.replace(/[/.]/g, '[/.]')));
  });
}

test('un import multi-lignes est vu à la ligne de son `from`', () => {
  const { status, err } = runOn({ 'runs/domain/run.ts': "import {\n  Component,\n  signal,\n} from '@angular/core';\n" });

  assert.equal(status, 1);
  assert.match(err, /run\.ts:4/);
});

test('les guillemets doubles comptent aussi', () => {
  assert.equal(runOn({ 'social/domain/g.ts': 'import { of } from "rxjs";\n' }).status, 1);
});

test('un fichier de test dans domain/ peut importer ce qu\'il veut', () => {
  assert.equal(runOn({ 'daily/domain/score.spec.ts': "import { TestBed } from '@angular/core/testing';\n", 'daily/domain/score.ts': 'export const x = 1;\n' }).status, 0);
});

test('les sous-dossiers de domain/ sont parcourus', () => {
  const { status, err } = runOn({ 'admin/domain/testing/fixture.ts': "import { signal } from '@angular/core';\n" });

  assert.equal(status, 1);
  assert.match(err, /testing[\\/]fixture\.ts:1/);
});

test('un import dynamique n\'est pas un `from` : la garde ne le voit pas', () => {
  assert.equal(runOn({ 'daily/domain/lazy.ts': "export const load = () => import('@angular/core');\n" }).status, 0);
});

test("la garde teste un préfixe : un nom qui commence par rxjs est refusé, un voisin d'@angular/ ne l'est pas", () => {
  assert.equal(runOn({ 'daily/domain/names.ts': "import { x } from 'rxjs-like-lib';\nimport { y } from '@angularish/core';\n" }).status, 1, 'rxjs-like-lib commence par rxjs : refusé (la garde teste le préfixe)');
  assert.equal(runOn({ 'daily/domain/names.ts': "import { y } from '@angularish/core';\n" }).status, 0);
});

test('tous les fichiers fautifs sont listés, de plusieurs domaines', () => {
  const { err } = runOn({
    'daily/domain/a.ts': "import { signal } from '@angular/core';\n",
    'runs/domain/b.ts': "import { of } from 'rxjs';\n",
    'social/domain/ok.ts': 'export const ok = 1;\n',
  });

  assert.match(err, /a\.ts:1/);
  assert.match(err, /b\.ts:1/);
  assert.doesNotMatch(err, /ok\.ts/);
});
