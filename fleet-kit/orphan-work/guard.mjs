#!/usr/bin/env node
/**
 * `PreToolUse` hook on delegation (`Agent|Task`): refuses to launch a new agent while a STOPPED agent's
 * work sits parked in its worktree — uncommitted, or committed but in no integration branch.
 *
 * THE LESSON (b100, 2026-09-09): three dead agents' worktrees held real finished work, and fresh agents
 * were being launched to redo two of those tasks from scratch. "Is this task still open?" and "is work for
 * it already sitting somewhere?" are different questions; a dispatch needs both, and parked work is
 * invisible from the main checkout by construction.
 *
 * WHAT IT DOES NOT FIRE ON: a LIVE agent's dirty worktree (that is the job), a clean worktree whose
 * commits all reached the integration branch, and a registered worktree whose directory is gone. What is
 * "work" here is deliberately plain — porcelain entries, or commits `git cherry` finds missing from the
 * primary integration branch — unlike the b100 reference, whose predicate also reads that repository's
 * declarations of ignored deliverables. A worktree it cannot measure is REFUSED and named: a failed
 * measurement is never a clean one.
 *
 * FAILS OPEN on a malfunction of its own (config, git answering at all), journaled.
 *
 * @es Hook `PreToolUse` sobre delegación: se niega a lanzar un agente nuevo mientras el trabajo de un agente
 * PARADO sigue aparcado en su worktree. No dispara con un agente vivo, un worktree integrado o un directorio
 * que ya no existe. Un worktree que no se puede medir se RECHAZA y se nombra.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { findConfig } from '../config/load-config.mjs';
import { isAgentWorktree, listWorktrees } from '../lib/agent-worktrees.mjs';
import { gitAsker, porcelainEntries } from '../lib/git.mjs';
import { deny, evaluator, hookMain, runWhenMain } from '../lib/hook-io.mjs';
import { ACTIVE_WINDOW_MS, activeOwner, agentRecords } from '../vendor/agent-liveness/liveness.mjs';
import { nativeSpelling } from '../vendor/cherry-pick-guard/working-directory.mjs';

export const DELEGATION_TOOLS = new Set(['Agent', 'Task']);

/**
 * What a worktree holds that no integration branch does.
 * @returns `{ dirty, unintegrated }` counts, or `{ unmeasurable: why }`.
 * @es Lo que guarda un worktree que ninguna rama de integración tiene.
 */
export function workIn(worktree, integrationBranch) {
  const ask = gitAsker(worktree.path);

  try {
    const dirty = porcelainEntries(ask).length;
    const cherry = ask('cherry', integrationBranch, worktree.branch ?? 'HEAD');

    if (cherry.status !== 0) return { unmeasurable: `git cherry ${integrationBranch} failed: ${cherry.stderr.trim()}` };

    return { dirty, unintegrated: cherry.stdout.split('\n').filter((line) => line.startsWith('+')).length };
  } catch (error) {
    return { unmeasurable: error instanceof Error ? error.message : String(error) };
  }
}

const holdsWork = (work) => work.unmeasurable !== undefined || work.dirty > 0 || work.unintegrated > 0;

/**
 * The path a porcelain entry names (the destination of a rename), or `undefined` for a quoted path, which
 * git only emits for names it had to escape and which this check does not decode.
 * @es La ruta que nombra una entrada de porcelain (el destino de un renombrado), o `undefined` para una
 * ruta entre comillas, que git solo emite cuando tuvo que escaparla y que esta comprobación no decodifica.
 */
function entryPath(entry) {
  const named = entry.slice(3);
  const target = named.includes(' -> ') ? named.slice(named.indexOf(' -> ') + 4) : named;

  return target.startsWith('"') ? undefined : target;
}

/**
 * When `worktree` was last worked on, in milliseconds: the newest of its dirty entries' modification
 * times and its HEAD commit's author time, or `0` when neither can be read.
 *
 * WHY THIS EXISTS (2026-10-04): an agent record is not the only proof that somebody is working in a
 * worktree. A session's workers can write a worktree by absolute path while their transcripts are rooted
 * elsewhere, so `activeOwner` finds no owner. MEASURED: `di_1700002_discovery_fe`'s `migration-study`
 * worktree had files written one minute earlier and a commit from the same minute, and this guard refused
 * every delegation of another session as "a stopped agent's work". The author time is used, not the
 * committer time, so a replayed or cherry-picked branch keeps its original age and errs toward "parked",
 * the safe side.
 * @es Cuándo se trabajó por última vez en `worktree`, en milisegundos: lo más reciente entre la
 * modificación de sus entradas sucias y la fecha de autor de su commit HEAD, o `0` si no se puede leer
 * ninguna. POR QUÉ (2026-10-04): un registro de agente no es la única prueba de que alguien trabaja en un
 * worktree; los workers de una sesión pueden escribirlo por ruta absoluta con sus transcripts en otro
 * sitio. MEDIDO: el worktree `migration-study` tenía archivos escritos un minuto antes y un commit de ese
 * mismo minuto, y este guard rechazaba toda delegación de otra sesión como «trabajo de un agente parado».
 * Se usa la fecha de autor, no la del committer, para que una rama reaplicada conserve su antigüedad y se
 * equivoque hacia «aparcado», el lado seguro.
 */
export function lastWorkedMs(worktree) {
  const ask = gitAsker(worktree.path);
  const times = [];

  try {
    for (const entry of porcelainEntries(ask)) {
      const relative = entryPath(entry);

      if (relative === undefined) continue;

      try {
        times.push(statSync(path.join(worktree.path, relative)).mtimeMs);
      } catch {
        // A deleted entry has no modification time to offer. @es Una entrada borrada no tiene fecha de modificación que aportar.
      }
    }

    const head = ask('log', '-1', '--format=%at');

    if (head.status === 0 && head.stdout.trim().length > 0) times.push(Number(head.stdout.trim()) * 1000);
  } catch {
    return 0;
  }

  return times.length === 0 ? 0 : Math.max(...times);
}

const BACKSLASH = '\\';

/** Where a path run ends. @es Dónde termina una ruta. */
const PATH_STOPS = ' \t\r\n"\'`)]>';

/**
 * What may stand right before a POSIX, Git Bash or UNC path: the start of the text, a blank, a quote, an
 * opener or `=` (`--cwd=/srv/x`). A path glued to a word is no path: `and/or`, `src/a/b`, `./a`, `~/a`
 * and `https://h/x` all have a letter, a dot, a tilde or a colon before their slash.
 * @es Lo que puede preceder a una ruta POSIX, de Git Bash o UNC: inicio, blanco, comilla, apertura o `=`.
 * Una ruta pegada a una palabra no es ruta: `and/or`, `src/a/b`, `./a`, `~/a` y `https://h/x` tienen una
 * letra, un punto, una tilde o dos puntos antes de la barra.
 */
const BEFORE_A_PATH = ' \t\r\n"\'`([<=';

/** Prose punctuation a sentence puts after a path, never part of it. @es Puntuación de la frase tras una ruta. */
const SENTENCE_PUNCTUATION = '.,;:!?';

const isSeparator = (character) => character === '/' || character === BACKSLASH;
const isLetter = (character) => character !== undefined && character.toLowerCase() !== character.toUpperCase();
const isDigit = (character) => character !== undefined && character >= '0' && character <= '9';
const isPathCharacter = (character) => character !== undefined && !PATH_STOPS.includes(character) && !isSeparator(character);

/**
 * Whether a path starts at `at`, and in which spelling:
 *   `drive`   `C:\` or `C:/`, on every platform (a brief may name a place on another machine);
 *   `unc`     `\\server\share`;
 *   `posix`   `/home/u/x`, off Windows, where it is a filesystem path;
 *   `gitbash` `/c/Users/x`, on Windows, the only POSIX spelling that names a Windows location. A lone
 *             `/c` (`cmd /c`) is a switch, not a path.
 * @es Si en `at` empieza una ruta, y con qué grafía: `drive` (en toda plataforma), `unc`, `posix` (fuera de
 * Windows, donde es ruta del sistema) y `gitbash` (en Windows, la única grafía POSIX que nombra una
 * ubicación de Windows; un `/c` suelto es un switch).
 */
function pathSpelling(text, at, platform) {
  const here = text[at];
  const before = text[at - 1];

  if (isLetter(here) && text[at + 1] === ':' && isSeparator(text[at + 2])) return isLetter(before) || isDigit(before) ? undefined : 'drive';

  if (before !== undefined && !BEFORE_A_PATH.includes(before)) return undefined;

  if (here === BACKSLASH) return text[at + 1] === BACKSLASH && isPathCharacter(text[at + 2]) ? 'unc' : undefined;

  if (here !== '/' || !isPathCharacter(text[at + 1])) return undefined;

  if (platform !== 'win32') return 'posix';

  return isLetter(text[at + 1]) && text[at + 2] === '/' && isPathCharacter(text[at + 3]) ? 'gitbash' : undefined;
}

/**
 * One key for a location, whatever spelling named it: forward slashes, no empty or doubled separators, no
 * trailing one, Git Bash `/c/x` as `c:/x` on Windows, UNC as `//server/share`. Case is folded where the
 * filesystem folds it (on Windows, and for any drive or UNC path) and kept for a POSIX path, where
 * `/home/u/Repo` and `/home/u/repo` are two places.
 * @es Una clave para una ubicación, sea cual sea la grafía que la nombró: barras normales, sin separadores
 * vacíos ni final, `/c/x` de Git Bash como `c:/x` en Windows y UNC como `//servidor/recurso`. Se pliegan
 * mayúsculas donde el sistema las pliega (Windows y toda ruta de unidad o UNC) y se conservan en POSIX.
 */
export function canonicalPath(raw, platform = process.platform) {
  const slashed = raw.replaceAll(BACKSLASH, '/');
  // `//host/share` is UNC only where the platform reads it so; on POSIX it is a doubled separator.
  // @es `//host/share` es UNC solo donde la plataforma lo lee así; en POSIX es un separador doblado.
  const unc = slashed.startsWith('//') && (platform === 'win32' || raw.startsWith(`${BACKSLASH}${BACKSLASH}`));
  const parts = (unc ? slashed : nativeSpelling(slashed, platform)).split('/').filter((part) => part.length > 0);
  const drive = parts.length > 0 && parts[0].length === 2 && isLetter(parts[0][0]) && parts[0][1] === ':';
  const key = unc ? `//${parts.join('/')}` : drive ? parts.join('/') : `/${parts.join('/')}`;

  return platform === 'win32' || unc || drive ? key.toLowerCase() : key;
}

/**
 * Every absolute path a brief names (Windows drive, UNC, POSIX, Git Bash `/c/`) as its canonical key. A
 * path ends at whitespace, a quote, a backtick or a closing bracket, less the sentence punctuation that
 * follows it.
 * @es Cada ruta absoluta que nombra un brief (unidad de Windows, UNC, POSIX, `/c/` de Git Bash) como su
 * clave canónica. Una ruta acaba en blanco, comilla, comilla invertida o cierre, sin la puntuación que la sigue.
 */
export function absolutePathsIn(text, platform = process.platform) {
  const paths = [];

  for (let at = 0; at < text.length; at += 1) {
    if (pathSpelling(text, at, platform) === undefined) continue;

    let end = at;

    while (end < text.length && !PATH_STOPS.includes(text[end])) end += 1;

    let named = end;

    while (named > at + 1 && SENTENCE_PUNCTUATION.includes(text[named - 1])) named -= 1;

    paths.push(canonicalPath(text.slice(at, named), platform));
    at = end;
  }

  return paths;
}

/**
 * Whether a delegation can touch the governed repository: true when its brief names no absolute path
 * (nothing says where it works, so the session's repository is assumed), or names at least one path
 * inside that repository's main checkout; false when every path it names lies elsewhere.
 *
 * WHY (2026-10-04): MEASURED by the guard audit (engram #1141) and live twice in one session — a
 * delegation whose brief worked only in `C:/Users/adrian.jimenez/.claude` was refused because the
 * SESSION's project (`di_1700002_discovery_fe`) held another session's unintegrated study branch. The
 * question this guard decides — "may this new agent redo parked work?" — is about the repository the
 * agent will work in, never about the repository the session happens to sit in.
 * @es Si una delegación puede tocar el repositorio gobernado: sí cuando su brief no nombra ninguna ruta
 * absoluta (nada dice dónde trabaja y se asume el de la sesión) o nombra al menos una dentro de ese
 * repositorio; no cuando todas las rutas que nombra están en otro sitio. POR QUÉ (2026-10-04): medido por
 * la auditoría de guards (#1141) y dos veces en vivo en una sesión — una delegación que solo trabajaba en
 * `~/.claude` se rechazó porque el proyecto de la SESIÓN tenía una rama de estudio de otra sesión.
 */
export function delegationTouches(payload, repositoryRoot, platform = process.platform) {
  const input = payload?.tool_input ?? {};
  const brief = [input.prompt, input.message, input.description].filter((part) => typeof part === 'string').join('\n');
  const named = absolutePathsIn(brief, platform);
  const root = canonicalPath(repositoryRoot, platform);

  return named.length === 0 || named.some((candidate) => candidate === root || candidate.startsWith(`${root}/`));
}

/**
 * The parked worktrees visible from `payload`'s repository, as `[{ worktree, work }]`.
 * @es Los worktrees aparcados visibles desde el repositorio del payload.
 */
export function parkedWork(payload, { records = agentRecords(), now = Date.now(), lastWorked = lastWorkedMs } = {}) {
  if (!DELEGATION_TOOLS.has(payload?.tool_name) || typeof payload?.cwd !== 'string') return [];

  const governed = findConfig(payload.cwd);

  if (governed === undefined || !delegationTouches(payload, governed.repository.mainCheckout)) return [];

  const integrationBranch = governed.config.integrationBranches[0];

  return listWorktrees(gitAsker(governed.repository.mainCheckout))
    .filter((worktree) => isAgentWorktree(governed, worktree.path) && existsSync(worktree.path))
    .filter((worktree) => activeOwner(worktree.path, records, now) === undefined)
    .filter((worktree) => now - lastWorked(worktree) >= ACTIVE_WINDOW_MS)
    .map((worktree) => ({ worktree, work: workIn(worktree, integrationBranch) }))
    .filter(({ work }) => holdsWork(work));
}

function describe({ worktree, work }) {
  const what = work.unmeasurable === undefined ? `${work.dirty} uncommitted entr${work.dirty === 1 ? 'y' : 'ies'}, ${work.unintegrated} commit(s) in no integration branch` : `UNMEASURABLE — ${work.unmeasurable}`;

  return `  - ${worktree.path} (${worktree.branch ?? 'detached'}): ${what}`;
}

function reason(parked) {
  return [
    'ORPHANED WORK (fleet-kit): a stopped agent\'s work is parked in its worktree, and a new agent is about to launch.',
    '',
    ...parked.map(describe),
    '',
    'A fresh agent may be about to redo exactly this. Triage first — the refusal clears itself once each is done:',
    '  - RESUME the stopped agent by its raw agentId (SendMessage), which keeps its transcript and worktree;',
    '  - or land the work, or salvage it into a live branch;',
    '  - or discard it deliberately (remove the worktree) after reading what it holds.'
  ].join('\n');
}

export const evaluate = evaluator('orphan-work', (payload) => {
  const parked = parkedWork(payload);

  return parked.length === 0 ? undefined : deny(reason(parked));
});

runWhenMain(import.meta.url, hookMain(evaluate));
