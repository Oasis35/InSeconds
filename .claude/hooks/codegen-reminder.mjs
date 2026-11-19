#!/usr/bin/env node
// Hook PostToolUse (Write, Edit, MultiEdit) : après la modification d'un endpoint ou d'un handler
// Wolverine (fichier de src/back/InSeconds.Api/Modules/ qui porte un attribut [WolverineGet|Post|
// Put|Delete|Patch] ou finit par Handler.cs), rappeler de régénérer le code Wolverine commité, puis
// le document OpenAPI du module et le client NSwag du front. Ne bloque rien.
// Se tait si Internal/Generated est déjà plus récent que le fichier, et ne rappelle qu'une fois par
// fichier et par session.

import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { git, readHookInput, runSafely, writeContext } from './lib/shell.mjs';

const MODULES = 'src/back/InSeconds.Api/Modules/';
const GENERATED = 'src/back/InSeconds.Api/Internal/Generated';
const WOLVERINE_ENDPOINT = /\[Wolverine(?:Get|Post|Put|Delete|Patch)\b/;

function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) newest = Math.max(newest, statSync(path.join(entry.parentPath ?? entry.path, entry.name)).mtimeMs);
  }
  return newest;
}

// Une fois par fichier et par session : la liste des fichiers déjà rappelés vit dans un fichier temporaire.
function firstTime(sessionId, file) {
  if (!sessionId) return true;
  const marker = path.join(tmpdir(), `inseconds-codegen-${sessionId.replace(/[^\w-]/g, '')}.json`);
  let seen = [];
  try {
    seen = JSON.parse(readFileSync(marker, 'utf8'));
  } catch {
    // premier rappel de la session
  }
  if (seen.includes(file)) return false;
  writeFileSync(marker, JSON.stringify([...seen, file]));
  return true;
}

export function reminder(filePath) {
  if (typeof filePath !== 'string' || !filePath.endsWith('.cs') || !existsSync(filePath)) return null;
  const root = git(['rev-parse', '--show-toplevel'], path.dirname(filePath));
  if (!root) return null;
  // Chemins réels des deux côtés : sous Windows, le dossier temporaire peut arriver en nom court (CLEMEN~1).
  const relative = path.relative(realpathSync.native(root), realpathSync.native(filePath)).split(path.sep).join('/');
  if (!relative.startsWith(MODULES)) return null;
  if (!relative.endsWith('Handler.cs') && !WOLVERINE_ENDPOINT.test(readFileSync(filePath, 'utf8'))) return null;
  if (newestMtime(path.join(root, GENERATED)) > statSync(filePath).mtimeMs) return null;
  return {
    relative,
    text:
      `Rappel codegen : ${path.basename(filePath)} définit un endpoint ou un handler Wolverine.\n` +
      `1. Depuis src/back, avant de lancer les tests : rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write\n` +
      `2. Si une route, un corps ou une réponse a changé : régénérer le document OpenAPI du module (InSeconds.Api.Testing/openapi/<module>.json, ` +
      `cf. skill nouvel-endpoint), puis npm run generate-api dans src/front/InSeconds.Client.\n` +
      `Commiter Internal/Generated, le document et le client ensemble (jobs CI back-checks et api-clients).`,
  };
}

runSafely(() => {
  const input = readHookInput();
  const found = reminder(input.tool_input?.file_path);
  if (found && firstTime(input.session_id, found.relative)) writeContext('PostToolUse', found.text);
});
