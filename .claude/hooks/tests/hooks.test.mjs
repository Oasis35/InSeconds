// Tests des hooks Claude Code du dépôt : node --test .claude/hooks/tests/
// Chaque test lance le script comme Claude Code le fait (JSON sur stdin) dans un dépôt git jetable.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

describe('commit-identity', () => {
  const cwd = repo();

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

describe('protected-branches', () => {
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

describe('no-em-dash', () => {
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

describe('grafana-reminder', () => {
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

describe('lint-before-commit', () => {
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
});
