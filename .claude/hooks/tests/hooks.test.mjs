// Tests des hooks Claude Code du dépôt : node --test .claude/hooks/tests/
// Chaque test lance le script comme Claude Code le fait (JSON sur stdin) dans un dépôt git jetable.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EM_DASH = String.fromCharCode(0x2014);
const CLEMENT = 'GIT_AUTHOR_NAME="Clément" GIT_AUTHOR_EMAIL="clement.rageau@gmail.com" GIT_COMMITTER_NAME="Clément" GIT_COMMITTER_EMAIL="clement.rageau@gmail.com"';

const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const temps = [];
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// Dépôt jetable dont l'identité locale est celle de Claude (comme dans une session cloud).
function repo(branch = 'feat/x') {
  const dir = mkdtempSync(path.join(tmpdir(), 'hooks-'));
  temps.push(dir);
  const g = (...args) => execFileSync('git', args, { cwd: dir, env: cleanEnv, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Claude');
  g('config', 'user.email', 'noreply@anthropic.com');
  g('-c', 'user.name=Clément', '-c', 'user.email=clement.rageau@gmail.com', 'commit', '-q', '--allow-empty', '-m', 'init');
  if (branch !== 'main') g('checkout', '-q', '-b', branch);
  return dir;
}

function hook(script, input) {
  const result = spawnSync('node', [path.join(HOOKS, script)], { input: JSON.stringify(input), encoding: 'utf8', env: cleanEnv });
  return { code: result.status, stderr: result.stderr, stdout: result.stdout };
}

const bash = (script, command, cwd) => hook(script, { tool_name: 'Bash', tool_input: { command }, cwd });
const pwsh = (command, cwd) => hook('shell-guard.mjs', { tool_name: 'PowerShell', tool_input: { command }, cwd });
const PS_CLEMENT =
  "$env:GIT_AUTHOR_NAME='Clément'; $env:GIT_AUTHOR_EMAIL='clement.rageau@gmail.com'; " +
  "$env:GIT_COMMITTER_NAME='Clément'; $env:GIT_COMMITTER_EMAIL='clement.rageau@gmail.com'";

describe('commit-identity', { concurrency: true }, () => {
  const cwd = repo();

  test('lit un fichier -F donné en chemin Git Bash, refuse un fichier introuvable', () => {
    const msg = path.join(cwd, 'msg.txt');
    writeFileSync(msg, 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n');
    const bashPath = process.platform === 'win32' ? msg.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()) : msg;
    assert.equal(bash('commit-identity.mjs', `${CLEMENT} git commit -F ${bashPath}`, cwd).code, 2);
    assert.equal(bash('commit-identity.mjs', `${CLEMENT} git commit -F absent.txt`, cwd).code, 2);
  });

  test('refuse un commit avec l\'identité par défaut de Claude', () => {
    const r = bash('commit-identity.mjs', 'git commit -m "msg"', cwd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /author = Claude/);
    assert.match(r.stderr, /committer = Claude/);
  });

  test('refuse --author seul (le committer reste Claude)', () => {
    const r = bash('commit-identity.mjs', 'git commit --author="Clément <clement.rageau@gmail.com>" -m "msg"', cwd);
    assert.equal(r.code, 2);
    assert.doesNotMatch(r.stderr, /author =/);
    assert.match(r.stderr, /committer = Claude/);
  });

  test('accepte les quatre variables, y compris derrière cd et git add', () => {
    assert.equal(bash('commit-identity.mjs', `${CLEMENT} git commit -m "msg"`, cwd).code, 0);
    assert.equal(bash('commit-identity.mjs', `cd ${cwd} && git add -A && ${CLEMENT} git commit -m "msg"`, '/').code, 0);
  });

  test('accepte un heredoc qui contient des guillemets et des mots git', () => {
    const command = `${CLEMENT} git commit -m "$(cat <<'EOF'\nTitre "cité"\n\ngit push origin main\nEOF\n)"`;
    assert.equal(bash('commit-identity.mjs', command, cwd).code, 0);
  });

  test('refuse une ligne Co-Authored-By, même avec la bonne identité', () => {
    const command = `${CLEMENT} git commit -m "$(cat <<'EOF'\nTitre\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF\n)"`;
    const r = bash('commit-identity.mjs', command, cwd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Co-Authored-By/);
  });

  test('lit le message d\'un fichier passé par -F', () => {
    const file = path.join(cwd, 'msg.txt');
    writeFileSync(file, 'Titre\n\nco-authored-by: Claude <noreply@anthropic.com>\n');
    assert.equal(bash('commit-identity.mjs', `${CLEMENT} git commit -F msg.txt`, cwd).code, 2);
  });

  test('accepte les variables posées par export', () => {
    const exports = CLEMENT.split(' ').map((a) => `export ${a}`).join('; ');
    assert.equal(bash('commit-identity.mjs', `${exports}; git commit -m "msg"`, cwd).code, 0);
  });

  test('vérifie le committer d\'un rebase et d\'un cherry-pick, ignore --abort', () => {
    assert.equal(bash('commit-identity.mjs', 'git rebase origin/env/staging', cwd).code, 2);
    assert.equal(bash('commit-identity.mjs', 'git cherry-pick abc123', cwd).code, 2);
    assert.equal(bash('commit-identity.mjs', 'git rebase --abort', cwd).code, 0);
    assert.equal(bash('commit-identity.mjs', 'git pull --ff-only origin env/staging', cwd).code, 0);
  });

  test('laisse passer ce qui ne crée pas de commit', () => {
    assert.equal(bash('commit-identity.mjs', 'git status && git log -1', cwd).code, 0);
    assert.equal(bash('commit-identity.mjs', 'echo "git commit"', cwd).code, 0);
  });

  test('accepte un commit quand la config locale est déjà celle de Clément', () => {
    const own = repo();
    execFileSync('git', ['config', 'user.name', 'Clément'], { cwd: own });
    execFileSync('git', ['config', 'user.email', 'clement.rageau@gmail.com'], { cwd: own });
    assert.equal(bash('commit-identity.mjs', 'git commit -m "msg"', own).code, 0);
  });
});

describe('protected-branches', { concurrency: true }, () => {
  test('refuse un commit sur main ou env/staging', () => {
    assert.equal(bash('protected-branches.mjs', `${CLEMENT} git commit -m "x"`, repo('main')).code, 2);
    assert.equal(bash('protected-branches.mjs', `${CLEMENT} git commit -m "x"`, repo('env/staging')).code, 2);
  });

  test('accepte un commit sur une branche de travail', () => {
    assert.equal(bash('protected-branches.mjs', `${CLEMENT} git commit -m "x"`, repo('feat/x')).code, 0);
  });

  test('suit un checkout -b fait plus tôt dans la même commande', () => {
    const cwd = repo('main');
    assert.equal(bash('protected-branches.mjs', `git checkout -b feat/y && ${CLEMENT} git commit -m "x"`, cwd).code, 0);
    assert.equal(bash('protected-branches.mjs', `git checkout main && git commit -m "x"`, repo('feat/x')).code, 2);
  });

  test('refuse les push vers main ou env/staging, sous toutes leurs formes', () => {
    const cwd = repo('feat/x');
    for (const command of [
      'git push origin main',
      'git push -u origin HEAD:main',
      'git push origin feat/x:refs/heads/main',
      'git push --force origin +feat/x:env/staging',
      'git push origin --delete main',
      'git push --all origin',
    ]) {
      assert.equal(bash('protected-branches.mjs', command, cwd).code, 2, command);
    }
  });

  test('refuse un git push sans destination depuis main', () => {
    assert.equal(bash('protected-branches.mjs', 'git push', repo('main')).code, 2);
  });

  test('accepte les push vers une branche de travail et un pull sur main', () => {
    const cwd = repo('feat/x');
    assert.equal(bash('protected-branches.mjs', 'git push -u origin claude/project-thread-abc', cwd).code, 0);
    assert.equal(bash('protected-branches.mjs', 'git push', cwd).code, 0);
    assert.equal(bash('protected-branches.mjs', 'git push --force-with-lease origin HEAD', cwd).code, 0);
    assert.equal(bash('protected-branches.mjs', 'git pull origin main', repo('main')).code, 0);
  });
});

describe('no-em-dash', { concurrency: true }, () => {
  const edit = (tool_name, tool_input) => hook('no-em-dash.mjs', { tool_name, tool_input });

  test('refuse un tiret cadratin dans Write, Edit et MultiEdit', () => {
    assert.equal(edit('Write', { file_path: '/x.md', content: `a ${EM_DASH} b` }).code, 2);
    assert.equal(edit('Edit', { file_path: '/x.ts', old_string: 'a', new_string: `'a ${EM_DASH} b'` }).code, 2);
    assert.equal(edit('MultiEdit', { file_path: '/x.ts', edits: [{ old_string: 'a', new_string: EM_DASH }] }).code, 2);
  });

  test('accepte un tiret simple et la suppression d\'un tiret cadratin', () => {
    assert.equal(edit('Write', { file_path: '/x.md', content: 'a - b' }).code, 0);
    assert.equal(edit('Edit', { file_path: '/x.md', old_string: `a ${EM_DASH} b`, new_string: 'a : b' }).code, 0);
  });

  test('refuse un message de commit ou un corps de PR, laisse passer une recherche', () => {
    assert.equal(edit('Bash', { command: `git commit -m "a ${EM_DASH} b"` }).code, 2);
    assert.equal(edit('mcp__github__create_pull_request', { title: 't', body: `x ${EM_DASH} y` }).code, 2);
    assert.equal(edit('Bash', { command: `grep -rn "${EM_DASH}" docs` }).code, 0);
  });
});

describe('grafana-reminder', { concurrency: true }, () => {
  function backRepo() {
    const dir = repo();
    mkdirSync(path.join(dir, 'deploy', 'grafana'), { recursive: true });
    const expr = '{service_name="inseconds-api"} |~ "Défi du|Pool insuffisant" | json';
    const metric = 'sum(increase(inseconds_players_guests_created_total[1h]))';
    writeFileSync(
      path.join(dir, 'deploy', 'grafana', 'activite.json'),
      JSON.stringify({ panels: [{ targets: [{ expr }, { expr: metric }] }] }),
    );
    return dir;
  }
  const edited = (dir, content, old_string) => {
    const file = path.join(dir, 'DailyLog.cs');
    writeFileSync(file, content);
    return hook('grafana-reminder.mjs', { tool_name: 'Edit', tool_input: { file_path: file, old_string, new_string: '' } });
  };

  test('rappelle le tableau quand un texte de log lu par Grafana disparaît', () => {
    const r = edited(backRepo(), 'Message = "Challenge of {Date}"', 'Message = "Défi du {Date}"');
    assert.equal(r.code, 0);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /Défi du.*activite\.json/s);
  });

  test('rappelle aussi pour un nom de métrique écrit avec des points', () => {
    const r = edited(backRepo(), 'Name = "inseconds.players.guests"', 'Name = "inseconds.players.guests_created"');
    assert.match(r.stdout, /inseconds_players_guests_created/);
  });

  test('se tait quand le texte reste dans le fichier ou n\'est lu par aucun tableau', () => {
    assert.equal(edited(backRepo(), 'A = "Défi du {Date}"; B = "x"', 'B = "Défi du {Date}"').stdout, '');
    assert.equal(edited(backRepo(), 'A = "autre"', 'A = "texte libre"').stdout, '');
  });
});

describe('lint-before-commit', { concurrency: true }, () => {
  test('refuse un commit qui ajoute des espaces en fin de ligne', () => {
    const cwd = repo();
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;   \n');
    execFileSync('git', ['add', 'a.ts'], { cwd });
    const r = bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /fin de ligne/);
  });

  test('accepte un fichier propre et ignore le Markdown', () => {
    const cwd = repo();
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;\n');
    writeFileSync(path.join(cwd, 'b.md'), 'Ligne avec saut  \nsuite\n');
    execFileSync('git', ['add', '.'], { cwd });
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd).code, 0);
  });

  test('ne fait rien hors d\'un commit', () => {
    const cwd = repo();
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;   \n');
    assert.equal(bash('lint-before-commit.mjs', 'git status', cwd).code, 0);
  });

  test('ne regarde que l\'index : un fichier modifié mais pas indexé ne bloque pas', () => {
    const cwd = repo();
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;\n');
    writeFileSync(path.join(cwd, 'brouillon.ts'), 'const b = 1;   \n');
    execFileSync('git', ['add', 'a.ts'], { cwd });
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd).code, 0);
  });

  test('prend aussi le travail en cours après un git add de la même commande, ou avec -a', () => {
    const cwd = repo();
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;   \n');
    assert.equal(bash('lint-before-commit.mjs', `git add . && ${CLEMENT} git commit -m "x"`, cwd).code, 2);

    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;\n');
    execFileSync('git', ['add', 'a.ts'], { cwd });
    execFileSync('git', ['-c', 'user.name=C', '-c', 'user.email=c@c', 'commit', '-q', '-m', 'a'], { cwd });
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 2;   \n');
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -am "x"`, cwd).code, 2);
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd).code, 0);
  });

  test('prend les chemins nommés par le commit, même non indexés', () => {
    const cwd = repo();
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;\n');
    execFileSync('git', ['add', 'a.ts'], { cwd });
    execFileSync('git', ['-c', 'user.name=C', '-c', 'user.email=c@c', 'commit', '-q', '-m', 'a'], { cwd });
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 2;   \n');
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit a.ts -m "x"`, cwd).code, 2);
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -i -m "x" -- a.ts`, cwd).code, 2);
  });

  test('après git add <fichier>, un brouillon non nommé ne bloque pas', () => {
    const cwd = repo();
    writeFileSync(path.join(cwd, 'a.ts'), 'const a = 1;\n');
    writeFileSync(path.join(cwd, 'brouillon.ts'), 'const b = 1;   \n');
    assert.equal(bash('lint-before-commit.mjs', `git add a.ts && ${CLEMENT} git commit -m "x"`, cwd).code, 0);
  });

  test('laisse au code généré ses espaces en fin de ligne, pas à un .cs ordinaire', () => {
    const cwd = repo();
    const wolverine = 'src/back/InSeconds.Api/Internal/Generated/WolverineHandlers/GET_api_x.cs';
    const migration = 'src/back/InSeconds.Api/Infrastructure/Persistence/Migrations/20260101000000_X.cs';
    for (const file of [wolverine, migration]) {
      mkdirSync(path.join(cwd, path.dirname(file)), { recursive: true });
      writeFileSync(path.join(cwd, file), 'class X\n{\n    \n}\n');
    }
    // Non suivis, par le git add de la même commande, puis indexés.
    assert.equal(bash('lint-before-commit.mjs', `git add . && ${CLEMENT} git commit -m "x"`, cwd).code, 0);
    execFileSync('git', ['add', '.'], { cwd });
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd).code, 0);

    writeFileSync(path.join(cwd, 'Ordinaire.cs'), 'class Y\n{\n    \n}\n');
    execFileSync('git', ['add', 'Ordinaire.cs'], { cwd });
    const r = bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Ordinaire\.cs:3: trailing whitespace/);
    assert.doesNotMatch(r.stderr, /Generated|Migrations/);
  });

  test('code généré suivi puis modifié : ses espaces passent avec -a, git commit <chemin> ou git add -u', () => {
    const cwd = repo();
    const wolverine = 'src/back/InSeconds.Api/Internal/Generated/WolverineHandlers/GET_api_x.cs';
    const migration = 'src/back/InSeconds.Api/Infrastructure/Persistence/Migrations/20260101000000_X.cs';
    for (const file of [wolverine, migration]) {
      mkdirSync(path.join(cwd, path.dirname(file)), { recursive: true });
      writeFileSync(path.join(cwd, file), 'class X\n{\n}\n');
    }
    execFileSync('git', ['add', '.'], { cwd });
    execFileSync('git', ['-c', 'user.name=C', '-c', 'user.email=c@c', 'commit', '-q', '-m', 'a'], { cwd });
    for (const file of [wolverine, migration]) writeFileSync(path.join(cwd, file), 'class X\n{\n    \n}\n');
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -am "x"`, cwd).code, 0);
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x" -- ${wolverine} ${migration}`, cwd).code, 0);
    assert.equal(bash('lint-before-commit.mjs', `git add -u && ${CLEMENT} git commit -m "x"`, cwd).code, 0);
  });

  test('l\'exception ne vaut que pour le back : un dossier Migrations ailleurs reste contrôlé', () => {
    const cwd = repo();
    mkdirSync(path.join(cwd, 'src/front/app/Migrations'), { recursive: true });
    writeFileSync(path.join(cwd, 'src/front/app/Migrations/b.ts'), 'const b = 1;   \n');
    assert.equal(bash('lint-before-commit.mjs', `git add . && ${CLEMENT} git commit -m "x"`, cwd).code, 2);
  });

  test('cherche toujours les marqueurs de conflit dans le code généré, ceux de l\'index', () => {
    const cwd = repo();
    const file = 'src/back/InSeconds.Api/Internal/Generated/WolverineHandlers/GET_api_x.cs';
    const full = path.join(cwd, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, 'class X\n{\n    \n<<<<<<< HEAD\n=======\n>>>>>>> autre\n}\n');
    // Non suivi, par le git add de la même commande (copie de travail en CRLF comprise).
    assert.equal(bash('lint-before-commit.mjs', `git add . && ${CLEMENT} git commit -m "x"`, cwd).code, 2);
    writeFileSync(full, 'class X\r\n{\r\n=======\r\n}\r\n');
    assert.equal(bash('lint-before-commit.mjs', `git add . && ${CLEMENT} git commit -m "x"`, cwd).code, 2);

    // Indexé avec ses marqueurs, copie de travail régénérée propre : le commit partirait avec eux.
    writeFileSync(full, 'class X\n{\n    \n<<<<<<< HEAD\n=======\n>>>>>>> autre\n}\n');
    execFileSync('git', ['add', '.'], { cwd });
    writeFileSync(full, 'class X\n{\n    \n}\n');
    const r = bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /GET_api_x\.cs:4: leftover conflict marker/);
    assert.match(r.stderr, /GET_api_x\.cs:5: leftover conflict marker/);
    assert.doesNotMatch(r.stderr, /trailing whitespace/);

    // L'inverse : index propre, marqueur seulement dans la copie de travail non indexée.
    execFileSync('git', ['add', '.'], { cwd });
    writeFileSync(full, 'class X\n{\n<<<<<<< HEAD\n}\n');
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -m "x"`, cwd).code, 0);
    assert.equal(bash('lint-before-commit.mjs', `${CLEMENT} git commit -am "x"`, cwd).code, 2);
  });
});

describe('shell-guard (Bash)', { concurrency: true }, () => {
  test('enchaîne les contrôles en un seul processus', () => {
    const r = bash('shell-guard.mjs', 'git commit -m "msg"', repo('main'));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /protected-branches/);
    assert.match(r.stderr, /commit-identity/);
  });

  test('laisse passer une commande sans git', () => {
    assert.equal(bash('shell-guard.mjs', 'ls -la && npm run build', repo()).code, 0);
  });
});

describe('shell-guard (PowerShell)', { concurrency: true }, () => {
  test('refuse un git commit PowerShell avec l\'identité par défaut de Claude', () => {
    const r = pwsh('git commit -m "msg"', repo());
    assert.equal(r.code, 2);
    assert.match(r.stderr, /committer = Claude/);
  });

  test('accepte les quatre variables posées par $env:, avec ou sans espaces', () => {
    const cwd = repo();
    assert.equal(pwsh(`${PS_CLEMENT}; git commit -m "msg"`, cwd).code, 0);
    const spaced = PS_CLEMENT.replaceAll('=', ' = ').replaceAll("'", '"');
    assert.equal(pwsh(`${spaced}\ngit commit -m "msg"`, cwd).code, 0);
    assert.equal(pwsh('${env:GIT_AUTHOR_NAME}=\'Clément\'; ' + PS_CLEMENT.split('; ').slice(1).join('; ') + '; git commit -m x', cwd).code, 0);
  });

  test('refuse quand seul l\'author est posé, ou quand Remove-Item retire une variable', () => {
    const cwd = repo();
    const authorOnly = "$env:GIT_AUTHOR_NAME='Clément'; $env:GIT_AUTHOR_EMAIL='clement.rageau@gmail.com'; git commit -m x";
    assert.match(pwsh(authorOnly, cwd).stderr, /committer = Claude/);
    assert.equal(pwsh(`${PS_CLEMENT}; Remove-Item Env:GIT_COMMITTER_EMAIL; git commit -m x`, cwd).code, 2);
  });

  test('lit un message en here-string sans y voir de commandes, et y trouve Co-Authored-By', () => {
    const cwd = repo();
    const message = (body) => `${PS_CLEMENT}\ngit commit -m @'\nTitre "cité"\n\n${body}\n'@`;
    assert.equal(pwsh(message('git push origin main'), cwd).code, 0);
    const r = pwsh(message('Co-Authored-By: Claude <noreply@anthropic.com>'), cwd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Co-Authored-By/);
  });

  test('suit l\'accent grave de continuation et l\'opérateur d\'appel &', () => {
    const cwd = repo();
    assert.equal(pwsh(`${PS_CLEMENT}; git commit \`\n  -m "msg"`, cwd).code, 0);
    assert.equal(pwsh('& git commit -m "msg"', cwd).code, 2);
    assert.equal(pwsh('& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m "msg"', cwd).code, 2);
  });

  test('refuse un commit sur main, y compris après Set-Location', () => {
    const main = repo('main');
    assert.equal(pwsh(`${PS_CLEMENT}; git commit -m x`, main).code, 2);
    assert.equal(pwsh(`Set-Location -Path '${main}'; ${PS_CLEMENT}; git commit -m x`, repo()).code, 2);
    assert.equal(pwsh(`cd '${repo()}'; ${PS_CLEMENT}; git commit -m x`, main).code, 0);
  });

  test('refuse les push vers main ou env/staging', () => {
    const cwd = repo();
    for (const command of [
      'git push origin main',
      'git push -u origin HEAD:env/staging',
      'git fetch; if ($?) { git push origin main }',
      'git status && git push origin main',
    ]) {
      assert.equal(pwsh(command, cwd).code, 2, command);
    }
    assert.equal(pwsh('git push -u origin feat/x', cwd).code, 0);
  });

  test('refuse un appel à git que le découpage ne sait pas lire', () => {
    const cwd = repo();
    assert.equal(pwsh('Invoke-Expression "git commit -m x"', cwd).code, 2);
    assert.equal(pwsh('Start-Process git -ArgumentList "push","origin","main"', cwd).code, 2);
  });

  test('refuse un exécuteur opaque ou un splatting à côté d\'un git lisible', () => {
    const cwd = repo();
    assert.equal(pwsh(`${PS_CLEMENT}; git status; iex $c; git commit -m x`, cwd).code, 2);
    assert.equal(pwsh(`${PS_CLEMENT}; $a = @('commit','-m','x'); git @a`, cwd).code, 2);
    assert.equal(pwsh(`${PS_CLEMENT}; $g = 'git'; & $g push origin main; git status`, cwd).code, 2);
    assert.equal(pwsh(`${PS_CLEMENT}; $sha = git rev-parse HEAD; git commit -m x`, cwd).code, 0);
    for (const command of [
      "$s = 'commit'; git $s -m x",
      "git status; git @('commit','-m','x')",
      'Set-Alias g git; g commit -m x; git status',
      "git status; [Diagnostics.Process]::Start('git','commit -m x')",
      'git status; & (Get-Command git) commit -m x',
    ]) {
      assert.equal(pwsh(`${PS_CLEMENT}; ${command}`, cwd).code, 2, command);
    }
  });

  test('laisse passer les formes PowerShell courantes autour d\'un commit', () => {
    const cwd = repo();
    for (const command of [
      'git commit -m x; if ($LASTEXITCODE -ne 0) { exit 1 }',
      'git commit -m x; $LASTEXITCODE',
      'foreach ($f in $files) { git add $f }; git commit -m x',
      'git status --short | ForEach-Object { $_.Trim() }; git commit -m x',
      'git commit -m x; Write-Host $env:GIT_AUTHOR_NAME',
    ]) {
      assert.equal(pwsh(`${PS_CLEMENT}; ${command}`, cwd).code, 0, command);
    }
  });

  test('refuse une identité posée autrement que par $env:NOM = valeur', () => {
    const cwd = repo();
    const others = PS_CLEMENT.split('; ').slice(1).join('; ');
    for (const setter of [
      "Set-Item Env:GIT_AUTHOR_NAME 'Clément'",
      "[Environment]::SetEnvironmentVariable('GIT_AUTHOR_NAME','Clément')",
      "$env:GIT_AUTHOR_NAME += 'x'",
    ]) {
      assert.equal(pwsh(`${others}; ${setter}; git commit -m x`, cwd).code, 2, setter);
    }
  });

  test('un contrôle qui plante au chargement n\'empêche pas les autres', async () => {
    const { check } = await import(new URL('../shell-guard.mjs', import.meta.url));
    const input = { tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd: repo() };
    const r = await check(input, [['absent', './absent.mjs'], ['protected-branches', './protected-branches.mjs']]);
    assert.ok(r.block);
    assert.match(r.context, /Hook absent en échec/);
  });

  test('laisse passer la lecture et un commentaire qui parle de commit', () => {
    const cwd = repo();
    assert.equal(pwsh('git status; git log -1 --format=%H', cwd).code, 0);
    assert.equal(pwsh('# git commit plus tard\nGet-ChildItem', cwd).code, 0);
  });

  test('refuse un tiret cadratin écrit par Set-Content ou Out-File', () => {
    const cwd = repo();
    assert.equal(pwsh(`Set-Content x.md "a ${EM_DASH} b"`, cwd).code, 2);
    assert.equal(pwsh(`"a ${EM_DASH} b" | Out-File x.md`, cwd).code, 2);
    assert.equal(pwsh(`Select-String -Pattern "${EM_DASH}" -Path docs/*.md`, cwd).code, 0);
  });
});

describe('no-em-dash : redirections', { concurrency: true }, () => {
  const run = (command) => hook('no-em-dash.mjs', { tool_name: 'Bash', tool_input: { command } });

  test('refuse une vraie redirection vers un fichier', () => {
    assert.equal(run(`echo "a ${EM_DASH} b" > docs/x.md`).code, 2);
    assert.equal(run(`echo "a ${EM_DASH} b" >> x.md`).code, 2);
    assert.equal(run(`cat <<'EOF' >x.md\na ${EM_DASH} b\nEOF`).code, 2);
  });

  test('ne prend pas 2>/dev/null, une flèche ou >&2 pour une écriture', () => {
    assert.equal(run(`grep -rn "${EM_DASH}" docs 2>/dev/null`).code, 0);
    assert.equal(run(`grep -c "${EM_DASH}" a.md > /dev/null`).code, 0);
    assert.equal(run(`node -e "x => '${EM_DASH}'" -> y`).code, 0);
    assert.equal(run(`echo "${EM_DASH}" >&2`).code, 0);
    assert.equal(run(`grep "${EM_DASH}" a.md 2>&1`).code, 0);
  });

  test('refuse &>, &>> et >|', () => {
    assert.equal(run(`echo "a ${EM_DASH} b" &> x.md`).code, 2);
    assert.equal(run(`echo "a ${EM_DASH} b" &>> x.md`).code, 2);
    assert.equal(run(`echo "a ${EM_DASH} b" >| x.md`).code, 2);
  });
});

describe('lancement par un lien', () => {
  test('shell-guard contrôle encore quand le dossier des hooks est atteint par une jonction', () => {
    const cwd = repo();
    const link = path.join(mkdtempSync(path.join(tmpdir(), 'hooks-link-')), 'hooks');
    temps.push(path.dirname(link));
    symlinkSync(HOOKS, link, 'junction');
    const input = { tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd };
    const r = spawnSync('node', [path.join(link, 'shell-guard.mjs')], { input: JSON.stringify(input), encoding: 'utf8', env: cleanEnv });
    assert.equal(r.status, 2);
  });
});

describe('session-start', { concurrency: true }, () => {
  const start = (cwd) => hook('session-start.mjs', { hook_event_name: 'SessionStart', cwd });

  test('donne la branche et confirme que les hooks sont actifs', () => {
    const out = JSON.parse(start(repo('feat/x')).stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /\[hooks InSeconds actifs\][\s\S]*Branche courante : feat\/x/);
    assert.equal(out.systemMessage, undefined);
  });

  test('alerte sur main ou env/staging', () => {
    for (const branch of ['main', 'env/staging']) {
      const out = JSON.parse(start(repo(branch)).stdout);
      assert.match(out.hookSpecificOutput.additionalContext, /ATTENTION/);
      assert.match(out.systemMessage, /protégée/);
    }
  });
});

describe('codegen-reminder', { concurrency: true }, () => {
  function apiRepo() {
    const dir = repo();
    mkdirSync(path.join(dir, 'src/back/InSeconds.Api/Modules/Social/Application'), { recursive: true });
    mkdirSync(path.join(dir, 'src/back/InSeconds.Api/Internal/Generated'), { recursive: true });
    writeFileSync(path.join(dir, 'src/back/InSeconds.Api/Internal/Generated/Old.cs'), '// ancien');
    return dir;
  }
  const edited = (dir, relative, content, session = 's1') => {
    const file = path.join(dir, relative);
    writeFileSync(file, content);
    return hook('codegen-reminder.mjs', { tool_name: 'Edit', session_id: `${session}-${path.basename(dir)}`, tool_input: { file_path: file } });
  };
  const ENDPOINT = 'src/back/InSeconds.Api/Modules/Social/Application/GroupEndpoints.cs';

  test('rappelle le codegen pour un endpoint Wolverine, une fois par session', () => {
    const dir = apiRepo();
    const first = edited(dir, ENDPOINT, '[WolverinePost("/api/social/groups")]');
    assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /codegen write[\s\S]*generate-api/);
    assert.equal(edited(dir, ENDPOINT, '[WolverinePost("/api/social/groups")] // bis').stdout, '');
  });

  test('rappelle pour un fichier *Handler.cs', () => {
    const dir = apiRepo();
    assert.match(edited(dir, 'src/back/InSeconds.Api/Modules/Social/Application/PurgeHandler.cs', 'class X {}').stdout, /codegen/);
  });

  test('se tait hors des modules, sans endpoint, ou quand Generated est plus récent', () => {
    const dir = apiRepo();
    assert.equal(edited(dir, 'src/back/InSeconds.Api/Modules/Social/Application/SocialSupport.cs', 'class X {}').stdout, '');
    mkdirSync(path.join(dir, 'src/back/InSeconds.Infrastructure'), { recursive: true });
    assert.equal(edited(dir, 'src/back/InSeconds.Infrastructure/X.cs', '[WolverineGet("/x")]').stdout, '');
    const file = path.join(dir, ENDPOINT);
    writeFileSync(file, '[WolverineGet("/x")]');
    const later = new Date(Date.now() + 60_000);
    utimesSync(path.join(dir, 'src/back/InSeconds.Api/Internal/Generated/Old.cs'), later, later);
    const r = hook('codegen-reminder.mjs', { tool_name: 'Edit', session_id: `s2-${path.basename(dir)}`, tool_input: { file_path: file } });
    assert.equal(r.stdout, '');
  });
});
