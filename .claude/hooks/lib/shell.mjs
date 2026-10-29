// Outils partagés des hooks : lecture de l'entrée JSON, découpage approximatif d'une
// commande shell en commandes simples, repérage des appels à git.
// Le découpage n'est pas un vrai interpréteur bash : il vise les formes que Claude
// écrit (variables en préfixe, `cd x && git ...`, heredocs, guillemets, `$(...)`).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const PROTECTED_BRANCHES = ['main', 'env/staging'];

export const EXPECTED_IDENTITY = { name: 'Clément', email: 'clement.rageau@gmail.com' };

export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// Refus d'un PreToolUse : code 2, le message part sur stderr et Claude le lit.
export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

// Un hook qui plante ne doit jamais bloquer le travail : on laisse passer en le signalant.
export function runSafely(main) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Hook ${path.basename(process.argv[1] ?? '')} en échec, ignoré : ${error?.message ?? error}\n`);
    process.exit(0);
  }
}

export function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Retire le corps des heredocs (<<EOF ... EOF) pour que le texte d'un message de commit
// ne soit pas lu comme des commandes.
export function stripHeredocs(command) {
  const lines = command.split('\n');
  const out = [];
  let delimiter = null;
  for (const line of lines) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) {
        out.push(line.replace(delimiter, ''));
        delimiter = null;
      }
      continue;
    }
    out.push(line);
    const match = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (match) delimiter = match[2];
  }
  return out.join('\n');
}

// Saute une substitution `$(...)` à partir de l'index de `(` ; rend l'index après `)`.
function skipSubstitution(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return text.length;
}

// Découpe en commandes simples, chacune en liste de mots (guillemets retirés).
export function splitCommands(rawCommand) {
  const text = stripHeredocs(rawCommand);
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      word += text.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (c === '"') {
      inWord = true;
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\' && i + 1 < text.length) {
          word += text[++i];
        } else if (text[i] === '$' && text[i + 1] === '(') {
          const end = skipSubstitution(text, i + 1);
          word += text.slice(i, end);
          i = end - 1;
        } else {
          word += text[i];
        }
      }
    } else if (c === '$' && text[i + 1] === '(') {
      const end = skipSubstitution(text, i + 1);
      word += text.slice(i, end);
      inWord = true;
      i = end - 1;
    } else if (c === '\\' && i + 1 < text.length) {
      if (text[i + 1] !== '\n') {
        word += text[i + 1];
        inWord = true;
      }
      i++;
    } else if (c === ';' || c === '&' || c === '|' || c === '\n' || c === '(' || c === ')') {
      endCommand();
    } else if (c === ' ' || c === '\t') {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;

// Rend chaque appel à git de la commande, avec les variables posées devant (ou par
// `export` plus tôt), le dossier courant (suivi des `cd`) et les options globales.
export function gitInvocations(rawCommand, baseCwd) {
  const invocations = [];
  const exported = {};
  let cwd = baseCwd || process.cwd();

  for (const original of splitCommands(rawCommand)) {
    const words = [...original];
    const env = { ...exported };
    while (words.length && ASSIGNMENT.test(words[0])) {
      const [, key, value] = ASSIGNMENT.exec(words.shift());
      env[key] = value;
    }
    if (words[0] === 'env') {
      words.shift();
      while (words.length && ASSIGNMENT.test(words[0])) {
        const [, key, value] = ASSIGNMENT.exec(words.shift());
        env[key] = value;
      }
    }
    if (!words.length) continue;

    if (words[0] === 'export') {
      for (const w of words.slice(1)) {
        const m = ASSIGNMENT.exec(w);
        if (m) exported[m[1]] = m[2];
      }
      continue;
    }
    if (words[0] === 'cd') {
      const target = words[1];
      if (target && !target.startsWith('-')) {
        cwd = path.resolve(cwd, target.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
      }
      continue;
    }
    if (path.basename(words[0]) !== 'git') continue;

    let i = 1;
    let gitCwd = cwd;
    const configs = {};
    while (i < words.length && words[i].startsWith('-')) {
      const opt = words[i];
      if (opt === '-C') {
        gitCwd = path.resolve(gitCwd, words[i + 1] ?? '.');
        i += 2;
      } else if (opt === '-c') {
        const m = /^([^=]+)=(.*)$/s.exec(words[i + 1] ?? '');
        if (m) configs[m[1].toLowerCase()] = m[2];
        i += 2;
      } else {
        i += 1;
      }
    }
    if (i >= words.length) continue;
    invocations.push({ sub: words[i], args: words.slice(i + 1), env, cwd: gitCwd, configs });
  }
  return invocations;
}

export function currentBranch(cwd) {
  return git(['symbolic-ref', '--short', '-q', 'HEAD'], cwd);
}
