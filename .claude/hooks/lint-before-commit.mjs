#!/usr/bin/env node
// Hook PreToolUse (Bash) : avant un `git commit`, contrôle des fichiers modifiés :
//  - espaces en fin de ligne et marqueurs de conflit (git diff --check, hors Markdown) ;
//  - C# : formatage (dotnet format whitespace, sur les fichiers touchés seulement) ;
//  - front : frontières Sheriff et domaine pur (npm run lint:arch, comme le job CI front).
// Le projet n'a ni Prettier ni ESLint : le hook ne lance que ce qui existe déjà.
// Un outil absent (dotnet, node_modules) est signalé sans bloquer : la CI repasse derrière.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { block, git, gitInvocations, readHookInput, runSafely } from './lib/shell.mjs';

const FRONT_DIR = 'src/front/InSeconds.Client';
const BACK_DIR = 'src/back';
const GENERATED_CS = /\/(Internal\/Generated|Migrations)\//;

function changedFiles(root) {
  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], root).split('\n');
  const working = git(['ls-files', '--modified', '--others', '--exclude-standard'], root).split('\n');
  return [...new Set([...staged, ...working])].filter((f) => f && existsSync(path.join(root, f)));
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', timeout: 240_000 });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(), missing: !!result.error };
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

const tail = (text, lines = 25) => text.split('\n').slice(-lines).join('\n');

runSafely(() => {
  const input = readHookInput();
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !/\bgit\b/.test(command)) return;
  const commit = gitInvocations(command, input.cwd).find((inv) => inv.sub === 'commit' && !inv.args.includes('--dry-run'));
  if (!commit) return;

  const root = git(['rev-parse', '--show-toplevel'], commit.cwd);
  if (!root) return;
  const files = changedFiles(root);
  if (!files.length) return;

  const failures = [];
  const skipped = [];

  // git diff --check sort en code 2 quand il trouve quelque chose : lire sa sortie, pas son code.
  const whitespace = [
    run('git', ['diff', '--cached', '--check', '--', '.', ':(exclude)*.md'], root).output,
    run('git', ['diff', '--check', '--', '.', ':(exclude)*.md'], root).output,
  ].filter(Boolean);
  if (whitespace.length) failures.push(`Espaces en fin de ligne ou marqueurs de conflit :\n${tail(whitespace.join('\n'))}`);

  const csFiles = files
    .filter((f) => f.startsWith(`${BACK_DIR}/`) && f.endsWith('.cs') && !GENERATED_CS.test(f))
    .map((f) => f.slice(BACK_DIR.length + 1));
  if (csFiles.length) {
    const dotnet = findDotnet();
    if (!dotnet) {
      skipped.push('formatage C# (dotnet introuvable)');
    } else {
      const result = run(dotnet, ['format', 'whitespace', '.', '--folder', '--verify-no-changes', '--include', ...csFiles], path.join(root, BACK_DIR));
      if (!result.ok) {
        failures.push(
          `Formatage C# à corriger (lancer depuis ${BACK_DIR} : dotnet format whitespace . --folder --include <fichiers>) :\n${tail(result.output)}`,
        );
      }
    }
  }

  if (files.some((f) => f.startsWith(`${FRONT_DIR}/`))) {
    const frontDir = path.join(root, FRONT_DIR);
    if (!existsSync(path.join(frontDir, 'node_modules'))) {
      skipped.push('npm run lint:arch (node_modules absent, lancer npm ci)');
    } else {
      const result = run('npm', ['run', '--silent', 'lint:arch'], frontDir);
      if (result.missing) skipped.push('npm run lint:arch (npm introuvable)');
      else if (!result.ok) failures.push(`npm run lint:arch en échec (frontières Sheriff ou domaine pur) :\n${tail(result.output)}`);
    }
  }

  if (failures.length) {
    block(`Commit refusé par le hook lint-before-commit :\n\n${failures.join('\n\n')}\n\nCorriger puis relancer le commit (ne jamais contourner le contrôle).`);
  }
  if (skipped.length) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `lint-before-commit : contrôles non lancés, faute d'outil : ${skipped.join(' ; ')}. La CI les repassera.`,
        },
      }),
    );
  }
});
