#!/usr/bin/env node
// Hook PostToolUse (Write, Edit, MultiEdit) sur le back : si une modification fait disparaître
// d'un fichier un texte de log ou un nom de métrique lu par un tableau Grafana
// (deploy/grafana/*.json), rappeler de mettre le tableau à jour. Ne bloque rien.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { git, readHookInput, runSafely } from './lib/shell.mjs';

// Ce que les requêtes des tableaux lisent dans le code : textes des filtres de lignes Loki
// (|= "…", |~ "a|b") et noms de métriques Prometheus (inseconds_daily_sessions_total s'écrit
// inseconds.daily.sessions dans le code : les points y deviennent des soulignés).
function dashboardNeedles(grafanaDir) {
  const needles = new Map();
  const add = (needle, dashboard) => {
    if (needle.length < 4 || needle.includes('$')) return;
    if (!needles.has(needle)) needles.set(needle, new Set());
    needles.get(needle).add(dashboard);
  };
  for (const file of readdirSync(grafanaDir).filter((f) => f.endsWith('.json'))) {
    const json = readFileSync(path.join(grafanaDir, file), 'utf8');
    const exprs = [];
    JSON.parse(json, (key, value) => {
      if (key === 'expr' && typeof value === 'string') exprs.push(value);
      return value;
    });
    for (const expr of exprs) {
      for (const [, op, raw] of expr.matchAll(/(\|=|\|~|!=|!~)\s*"((?:[^"\\]|\\.)*)"/g)) {
        const text = raw.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
        const parts = op.endsWith('~') ? text.split('|') : [text];
        for (const part of parts) add(part.replace(/\\(.)/g, '$1'), file);
      }
      for (const [metric] of expr.matchAll(/\binseconds_[a-z0-9_]+/g)) {
        add(metric.replace(/_(total|bucket|sum|count)$/, ''), file);
      }
    }
  }
  return needles;
}

function previousText(input, repoRoot) {
  const toolInput = input.tool_input ?? {};
  if (input.tool_name === 'Edit') return toolInput.old_string ?? '';
  if (input.tool_name === 'MultiEdit') return (toolInput.edits ?? []).map((e) => e.old_string).join('\n');
  if (input.tool_name === 'Write') {
    const relative = path.relative(repoRoot, toolInput.file_path).split(path.sep).join('/');
    return git(['show', `HEAD:${relative}`], repoRoot);
  }
  return '';
}

runSafely(() => {
  const input = readHookInput();
  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath.endsWith('.cs') || !existsSync(filePath)) return;

  const repoRoot = git(['rev-parse', '--show-toplevel'], path.dirname(filePath));
  const grafanaDir = path.join(repoRoot, 'deploy', 'grafana');
  if (!repoRoot || !existsSync(grafanaDir)) return;

  const before = previousText(input, repoRoot);
  const after = readFileSync(filePath, 'utf8');
  const contains = (text, needle) =>
    needle.startsWith('inseconds_') ? text.replaceAll('.', '_').includes(needle) : text.includes(needle);
  const lost = [...dashboardNeedles(grafanaDir)].filter(([needle]) => contains(before, needle) && !contains(after, needle));
  if (!lost.length) return;

  const lines = lost.map(([needle, dashboards]) => `  - « ${needle} » (${[...dashboards].join(', ')})`);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          `Rappel Grafana : ${path.basename(filePath)} ne contient plus ce que lisent ces tableaux :\n${lines.join('\n')}\n` +
          `Si le texte ou la métrique a été renommé, mettre à jour le JSON dans deploy/grafana/ (même PR), ` +
          `et dire à Clément de réimporter le tableau (deploy/grafana/README.md). Si le texte a seulement changé de fichier, rien à faire.`,
      },
    }),
  );
});
