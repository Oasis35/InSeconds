#!/usr/bin/env node
// Hook PreToolUse (Bash, PowerShell ; lancé par shell-guard.mjs) : avant un `git commit`, contrôle
// des fichiers qui partent dans le commit (l'index) :
//  - espaces en fin de ligne et marqueurs de conflit (git diff --check, hors Markdown) ;
//  - C# : formatage (dotnet format whitespace, sur les fichiers indexés seulement) ;
//  - front : frontières Sheriff et domaine pur (npm run lint:arch, comme le job CI front).
// Les deux derniers tournent en parallèle. Le hook passe avant la commande : un `git add` placé
// devant le commit dans la même commande, ou `git commit -a`, n'a pas encore rempli l'index, le
// hook prend alors aussi les fichiers modifiés (et non suivis après un `git add`).
// Le projet n'a ni Prettier ni ESLint : le hook ne lance que ce qui existe déjà.
// Un outil absent (dotnet, node_modules) est signalé sans bloquer : la CI repasse derrière.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { git, gitInvocations, isMain, runCheck, shellOf } from './lib/shell.mjs';

const FRONT_DIR = 'src/front/InSeconds.Client';
const BACK_DIR = 'src/back';
const GENERATED_CS = /\/(Internal\/Generated|Migrations)\//;

const lines = (text) => text.split('\n').filter(Boolean);

// `-a`, `--all`, ou un groupe d'options courtes qui le contient (`-am "msg"`).
const commitsAll = (inv) => inv.args.some((a) => a === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(a));

function committedFiles(root, { all, added }) {
  const files = lines(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], root));
  if (all || added) files.push(...lines(git(['ls-files', '--modified'], root)));
  if (added) files.push(...lines(git(['ls-files', '--others', '--exclude-standard'], root)));
  return [...new Set(files)].filter((f) => existsSync(path.join(root, f)));
}

// git diff --check ignore les fichiers non suivis : après un `git add` de la même commande, ils
// partent pourtant dans le commit. Même contrôle à la main (texte seulement, hors Markdown).
function checkUntracked(root) {
  const problems = [];
  for (const file of lines(git(['ls-files', '--others', '--exclude-standard'], root))) {
    if (file.endsWith('.md')) continue;
    const full = path.join(root, file);
    if (!existsSync(full) || statSync(full).size > 1_000_000) continue;
    const content = readFileSync(full, 'utf8');
    if (content.includes('\0')) continue;
    content.split('\n').forEach((line, i) => {
      if (/[ \t]+\r?$/.test(line)) problems.push(`${file}:${i + 1}: trailing whitespace.`);
      else if (/^(<{7}|>{7})( |$)/.test(line)) problems.push(`${file}:${i + 1}: leftover conflict marker`);
    });
  }
  return problems.join('\n');
}

function run(cmd, args, cwd, { shell = false } = {}) {
  return new Promise((resolve) => {
    let output = '';
    let child;
    try {
      child = spawn(cmd, args, { cwd, shell, timeout: 240_000 });
    } catch {
      resolve({ ok: false, output: '', missing: true });
      return;
    }
    child.stdout?.on('data', (d) => (output += d));
    child.stderr?.on('data', (d) => (output += d));
    child.on('error', () => resolve({ ok: false, output: output.trim(), missing: true }));
    child.on('close', (code) => resolve({ ok: code === 0, output: output.trim(), missing: false }));
  });
}

function findDotnet() {
  const candidates = [process.env.DOTNET_ROOT && path.join(process.env.DOTNET_ROOT, 'dotnet'), 'dotnet'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // essayer le suivant
    }
  }
  return null;
}

const tail = (text, count = 25) => text.split('\n').slice(-count).join('\n');

async function checkCSharp(root, files) {
  const csFiles = files
    .filter((f) => f.startsWith(`${BACK_DIR}/`) && f.endsWith('.cs') && !GENERATED_CS.test(f))
    .map((f) => f.slice(BACK_DIR.length + 1));
  if (!csFiles.length) return {};
  const dotnet = findDotnet();
  if (!dotnet) return { skipped: 'formatage C# (dotnet introuvable)' };
  const result = await run(dotnet, ['format', 'whitespace', '.', '--folder', '--verify-no-changes', '--include', ...csFiles], path.join(root, BACK_DIR));
  if (result.ok) return {};
  return {
    failure: `Formatage C# à corriger (lancer depuis ${BACK_DIR} : dotnet format whitespace . --folder --include <fichiers>) :\n${tail(result.output)}`,
  };
}

async function checkFront(root, files) {
  if (!files.some((f) => f.startsWith(`${FRONT_DIR}/`))) return {};
  const frontDir = path.join(root, FRONT_DIR);
  if (!existsSync(path.join(frontDir, 'node_modules'))) return { skipped: 'npm run lint:arch (node_modules absent, lancer npm ci)' };
  // npm est un script .cmd sous Windows : il passe par le shell.
  const result = await run('npm', ['run', '--silent', 'lint:arch'], frontDir, { shell: process.platform === 'win32' });
  if (result.missing) return { skipped: 'npm run lint:arch (npm introuvable)' };
  if (result.ok) return {};
  return { failure: `npm run lint:arch en échec (frontières Sheriff ou domaine pur) :\n${tail(result.output)}` };
}

export async function check(input) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !/\bgit\b/i.test(command)) return null;
  const invocations = gitInvocations(command, input.cwd, shellOf(input));
  const index = invocations.findIndex((inv) => inv.sub === 'commit' && !inv.args.includes('--dry-run'));
  if (index < 0) return null;
  const commit = invocations[index];

  const root = git(['rev-parse', '--show-toplevel'], commit.cwd);
  if (!root) return null;
  const all = commitsAll(commit);
  const added = invocations.slice(0, index).some((inv) => inv.sub === 'add');
  const files = committedFiles(root, { all, added });
  if (!files.length) return null;

  // git diff --check sort en code 2 quand il trouve quelque chose : lire sa sortie, pas son code.
  const exclude = ['--', '.', ':(exclude)*.md'];
  const [staged, working, csharp, front] = await Promise.all([
    run('git', ['diff', '--cached', '--check', ...exclude], root),
    all || added ? run('git', ['diff', '--check', ...exclude], root) : Promise.resolve({ output: '' }),
    checkCSharp(root, files),
    checkFront(root, files),
  ]);

  const failures = [];
  const whitespace = [staged.output, working.output, added ? checkUntracked(root) : ''].filter(Boolean);
  if (whitespace.length) failures.push(`Espaces en fin de ligne ou marqueurs de conflit :\n${tail(whitespace.join('\n'))}`);
  for (const r of [csharp, front]) if (r.failure) failures.push(r.failure);
  const skipped = [csharp, front].map((r) => r.skipped).filter(Boolean);

  if (failures.length) {
    return {
      block: `Commit refusé par le hook lint-before-commit :\n\n${failures.join('\n\n')}\n\nCorriger puis relancer le commit (ne jamais contourner le contrôle).`,
    };
  }
  if (skipped.length) {
    return { context: `lint-before-commit : contrôles non lancés, faute d'outil : ${skipped.join(' ; ')}. La CI les repassera.` };
  }
  return null;
}

if (isMain(import.meta.url)) await runCheck(check, 'PreToolUse');
