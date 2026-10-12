/**
 * Whether two dispatches are the same errand, judged by the linked worktree each one NAMES.
 *
 * WHY. Errand identity by wording alone (`guard.mjs`) misreads both ways: one errand re-described in other
 * vocabulary passes, and two errands that share their object words are refused. A worker sent to take over
 * a worktree is already required to say so — `brief-tenancy` refuses a brief with no `TENANCY:` line — so
 * the worktree is a declared identity the author already wrote, and the harness records it too
 * (`worktreePath`) for an isolated agent.
 *
 * THE RULE. When the new brief and the stopped agent both name a linked worktree: the same worktree is the
 * same errand, different worktrees are different errands, whatever the words. When either side names none,
 * the answer is `'unknown'` and the caller's wording rule decides, unchanged.
 *
 * WHAT COUNTS AS A WORKTREE. An absolute path, on a `TENANCY:` line (read by the lines `brief-tenancy`
 * itself recognises — no second parser of the marker), that exists and is a LINKED worktree: its `.git` is a
 * FILE. A main checkout has a `.git` DIRECTORY and is shared by every agent of the project, so treating it as
 * an identity would refuse every second delegation (the hazard `agent-liveness` documents for `isAgentWorktree`).
 * A path that does not resolve is not an identity either. Worktrees are compared by directory name, the way
 * `agent-liveness` compares them (`worktreeName`): git reports `/`, other sources `\`.
 *
 * LIMIT. A path containing a space is not read whole (the line is split on whitespace); it then fails the
 * existence check and falls back to wording, which is the conservative side.
 *
 * @es Si dos despachos son el mismo encargo, juzgado por el worktree enlazado que cada uno NOMBRA. Con
 * ambos lados nombrando uno: el mismo worktree es el mismo encargo y worktrees distintos son encargos
 * distintos, con cualquier redacción. Si algún lado no nombra ninguno, `'unknown'` y decide la regla de
 * palabras del llamante. Cuenta como worktree una ruta absoluta en una línea `TENANCY:` (leída con las
 * líneas que `brief-tenancy` ya reconoce), que existe y es un worktree ENLAZADO (su `.git` es un FICHERO):
 * un checkout principal lo comparten todos los agentes y tomarlo como identidad rechazaría cada segunda
 * delegación. Se comparan por nombre de directorio, como `agent-liveness`.
 */

import { statSync } from 'node:fs';
import path from 'node:path';

import { briefOf, worktreeName } from '../agent-liveness/liveness.mjs';
import { tenancyLines } from '../brief-tenancy/tenancy-declaration.mjs';

/** Punctuation an author wraps around a path in prose. @es Puntuación con que se envuelve una ruta en prosa. */
const WRAPPING = '`\'"()[]<>{},;:.';

/** Whether a character is an ASCII letter. @es Si un carácter es una letra ASCII. */
const isLetter = (character) => (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z');

/** An absolute path, POSIX or drive-lettered, after separators are unified. @es Una ruta absoluta, POSIX o con unidad. */
const isAbsolute = (token) => token.startsWith('/') || (token.length > 2 && isLetter(token.charAt(0)) && token.charAt(1) === ':' && token.charAt(2) === '/');

/** Strips the punctuation that wraps a token. @es Quita la puntuación que envuelve un token. */
function unwrap(token) {
  let start = 0;
  let end = token.length;

  while (start < end && WRAPPING.includes(token.charAt(start))) start += 1;
  while (end > start && WRAPPING.includes(token.charAt(end - 1))) end -= 1;

  return token.slice(start, end);
}

/** Whether `candidate` is an existing LINKED worktree: its `.git` is a file. @es Si es un worktree enlazado existente: su `.git` es un fichero. */
function isLinkedWorktree(candidate) {
  try {
    return statSync(path.join(candidate, '.git')).isFile();
  } catch {
    return false; // missing, or unreadable: not an identity
  }
}

/** The linked-worktree names among `candidates` (raw paths). @es Los nombres de worktrees enlazados entre `candidates`. */
function linkedNames(candidates) {
  const names = new Set();

  for (const candidate of candidates) if (isLinkedWorktree(candidate)) names.add(worktreeName(candidate).toLowerCase());

  return names;
}

/**
 * The linked worktrees a brief declares on its `TENANCY:` lines, by lowercase directory name.
 * @es Los worktrees enlazados que un brief declara en sus líneas `TENANCY:`, por nombre de directorio.
 */
export function declaredWorktrees(text) {
  const candidates = [];

  for (const rest of tenancyLines(String(text))) {
    for (const raw of rest.split('\t').join(' ').split('\r').join(' ').split(' ').filter((piece) => piece.length > 0)) {
      const token = unwrap(raw.replaceAll('\\', '/'));

      if (isAbsolute(token)) candidates.push(token);
    }
  }

  return linkedNames(candidates);
}

/**
 * The linked worktrees a stopped agent worked in: the harness's own `worktreePath` when it has one — the
 * harness record wins, as in `activeOwner` — otherwise the ones its brief declared.
 * @es Los worktrees enlazados en que trabajó un agente parado: el `worktreePath` del harness si lo tiene
 * (el registro del harness gana, como en `activeOwner`), y si no los que declaró su brief.
 */
export function recordWorktrees(record) {
  const recorded = typeof record.worktreePath === 'string' ? record.worktreePath : '';

  return recorded.length > 0 ? linkedNames([recorded]) : declaredWorktrees(briefOf(record.transcript));
}

/**
 * `'same'` when the two sets share a worktree, `'different'` when both are non-empty and share none,
 * `'unknown'` when either is empty.
 * @es `'same'` si comparten un worktree, `'different'` si ambos son no vacíos y no comparten ninguno,
 * `'unknown'` si alguno está vacío.
 */
export function sameErrand(wanted, recorded) {
  if (wanted.size === 0 || recorded.size === 0) return 'unknown';

  return [...wanted].some((name) => recorded.has(name)) ? 'same' : 'different';
}
