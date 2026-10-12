#!/usr/bin/env node
/**
 * Is the agent that owns a worktree still working?
 *
 * Extracted rather than duplicated: two guards need this answer — `worktree-tenancy` refuses a
 * mutating `git -C` into a live agent's tree, and `orphan-work-guard` refuses a delegation while a
 * DEAD agent's finished work sits unlanded. Same question, opposite answers wanted. Under the owner's
 * standing bar a defect that appears twice is a missing abstraction, so this is that abstraction.
 *
 * ## Why not a process scan, which is the obvious thing and is WRONG
 *
 * Measured 2026-09-09: of 8 live `node`/`claude` processes on this machine, **ZERO** named any
 * worktree in their command line. Agents run in-process inside the harness, so a process scan has no
 * YES to give — a probe that answers "not running" for every worktree that will ever exist. An
 * earlier version of `orphan-work-guard` was built on exactly that scan and flagged a LIVE agent as
 * orphaned on its first run, which is why it was never registered.
 *
 * ## The record that does answer it
 *
 * `occupancy.ts` already documents the authoritative store, cross-read there over 674 agents and 171
 * worktrees: the harness writes `agent-<id>.meta.json` carrying `worktreePath`, beside an
 * `agent-<id>.jsonl` transcript it appends to while the agent works. So liveness is the transcript's
 * mtime — an agent at work writes on every tool round; a stopped one goes quiet.
 *
 * ## The honest limit, stated rather than hidden
 *
 * A HUNG agent reads as stopped. That is the right answer for both callers rather than a flaw: a hung
 * agent's work does need collecting, and one observed this session had gone 9 minutes without a write
 * while its interface counter was frozen. What this distinguishes is "still writing" from "not
 * writing", which is the question both guards actually turn on — not "alive" in any deeper sense.
 *
 * @es ¿Sigue trabajando el agente dueño de un worktree? Extraído en vez de duplicado: lo necesitan dos
 * guards, y bajo la regla del propietario un defecto que aparece dos veces es una abstracción que
 * falta. NO se decide por procesos: medido, de 8 procesos vivos CERO nombran un worktree, porque los
 * agentes corren dentro del harness — esa sonda no tiene un SÍ que dar. Se decide por el mtime del
 * transcript que el harness va escribiendo. Límite honesto: un agente COLGADO se lee como parado, que
 * es la respuesta correcta para ambos llamantes.
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { declarationOf } from '../brief-tenancy/tenancy-declaration.mjs';

/**
 * How recently the transcript must have been written for the agent to count as working.
 *
 * THIS WAS 4 MINUTES AND IT WAS WRONG, measured 2026-09-09. The first value came from one observation
 * — a hung agent quiet for 9 minutes — and mistook "long enough to catch that one" for "longer than
 * legitimate silence". An agent writes on every tool ROUND, not continuously, so its silence is as
 * long as its current tool call: single Storybook browser test files were measured at 30-120s each, a
 * full `test-storybook:ci` runs for many minutes, and `build:ci-pr` runs for the better part of an
 * hour. Caught in the act: `orphan-work-guard` listed a worktree as parked while its agent was
 * demonstrably alive and 6m14s into one tool call. Red over correct state — which is worse than a
 * guard that cannot fire, because it is how a control gets switched off.
 *
 * WHY LONGER IS THE SAFE DIRECTION FOR BOTH CALLERS, which is what makes one value enough:
 *  - `worktree-tenancy` asks "may I mutate this tree". A window that is too SHORT answers "nobody
 *    home" about a live agent and lets its work be overwritten. Unrecoverable.
 *  - `orphan-work-guard` asks "is finished work stranded". A window that is too short refuses a
 *    delegation that should have proceeded. Annoying, self-clearing, and it costs nothing but a
 *    triage that was going to happen anyway.
 * Neither caller is harmed by assuming an agent is still working for longer, so the threshold is set
 * above every legitimate gap rather than tuned to catch a stop quickly.
 *
 * THE LIMIT, STATED RATHER THAN HIDDEN: an agent inside a truly long command still reads as stopped
 * once it passes this window, and no mtime threshold can separate that from a real stop. What this
 * distinguishes is "has written recently" from "has not" — good enough for both decisions, and never
 * a claim about liveness in a deeper sense.
 *
 * @es ESTO ERA 4 MINUTOS Y ESTABA MAL. Un agente escribe por RONDA, no continuamente, así que su
 * silencio dura lo que dure su llamada actual: un fichero de test de navegador son 30-120s, una tanda
 * completa de storybook varios minutos, y `build:ci-pr` casi una hora. Pillado en el acto: se listó
 * como aparcado un worktree cuyo agente estaba vivo y llevaba 6m14s en una sola llamada. Alargar es la
 * dirección SEGURA para los dos llamantes: uno se juega sobrescribir trabajo vivo (irrecuperable), el
 * otro solo se juega un rechazo que se limpia solo.
 */
export const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

/**
 * Worktrees are compared by DIRECTORY NAME, never by full path. Measured the same day: git reports a
 * worktree with forward slashes while other sources use backslashes, so a full-path comparison
 * matched nothing and silently answered "no owner" for everything. The directory name is unique per
 * agent and carries no separator at all.
 * @es Se comparan por NOMBRE de directorio, nunca por ruta completa: git usa `/` y otras fuentes `\`,
 * y comparar rutas completas no casaba nunca.
 */
export function worktreeName(path) {
  return String(path).replaceAll('\\', '/').split('/').filter((part) => part.length > 0).pop() ?? '';
}

/**
 * Every subagent record this harness has written, across projects and sessions.
 *
 * The record carries `description` and `project` as well as liveness inputs, because a THIRD caller
 * needs them: `resume-before-fresh` asks "has an agent already been given this work", which is a
 * question about identity, not about whether anyone is writing. Widening the shared record is right
 * where copying the directory walk would not be — the walk is the same walk, and two of them drift.
 * @es El registro lleva `description` y `project` además de la vivacidad, porque un TERCER llamante
 * pregunta «¿ya se le encargó esto a alguien?», que es identidad y no escritura. Ensanchar el registro
 * compartido es lo correcto donde copiar el recorrido de directorios no lo sería: es el mismo
 * recorrido, y dos copias divergen.
 */
export function agentRecords(root = join(homedir(), '.claude', 'projects')) {
  const records = [];

  if (!existsSync(root)) return records;

  for (const project of readdirSync(root)) {
    const sessions = join(root, project);

    if (!statSync(sessions).isDirectory()) continue;

    for (const session of readdirSync(sessions)) {
      const dir = join(sessions, session, 'subagents');

      if (!existsSync(dir)) continue;

      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.meta.json')) continue;

        try {
          const meta = JSON.parse(readFileSync(join(dir, file), 'utf8'));

          records.push({
            id: file.replace('.meta.json', ''),
            project,
            description: String(meta?.description ?? ''),
            worktree: worktreeName(meta?.worktreePath ?? ''),
            worktreePath: String(meta?.worktreePath ?? ''),
            transcript: join(dir, file.replace('.meta.json', '.jsonl'))
          });
        } catch {
          continue;
        }
      }
    }
  }

  return records;
}

/** How much of a transcript's head is read to find its first record. @es Cuánto se lee del inicio. */
const BRIEF_HEAD_BYTES = 256 * 1024;

/**
 * The brief an agent was given: the text of the first record in its transcript. `''` when it cannot
 * be read. Only the head of the file is read, because a transcript grows to megabytes and the brief is
 * always its first line.
 * @es El brief que recibió un agente: el texto del primer registro de su transcript, o `''`. Se lee
 * solo la cabeza del fichero: el transcript crece a megas y el brief es siempre su primera línea.
 */
export function briefOf(transcript) {
  let descriptor;

  try {
    descriptor = openSync(transcript, 'r');
    const head = Buffer.alloc(BRIEF_HEAD_BYTES);
    const read = readSync(descriptor, head, 0, BRIEF_HEAD_BYTES, 0);
    const firstLine = head.subarray(0, read).toString('utf8').split('\n')[0];
    const content = JSON.parse(firstLine)?.message?.content;

    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n');

    return '';
  } catch {
    return '';
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Whether `path` is a LINKED worktree: git marks one by keeping `.git` as a FILE, while a main checkout
 * keeps it as a directory. The same question `process-reaper/linked-worktree.mjs` answers, written here
 * because a b100 module must not import from the Claude home.
 *
 * WHY THE BRIEF CLAIM IS LIMITED TO THESE. A `TENANCY:` line names its checkout by the last path
 * segment. Nearly every brief in this project declares `TENANCY: b100-am-ui`, so accepting brief claims
 * for the main checkout would make EVERY live agent its "owner", and `worktree-tenancy` would then
 * refuse mutating git there. A linked worktree's name is unique to its task; the main checkout's name
 * is shared by everyone.
 *
 * WHY NOT THE FOLDER NAME. This used to ask whether the parent folder was called `worktrees`, which is
 * where the harness puts isolated agents. A non-isolated worker may legitimately take over a linked
 * worktree anywhere (measured 2026-10-12: `~/.claude-wt/odd-mirror-guard`), and the folder name made
 * its live owner invisible. A path that does not exist or has no `.git` is not a worktree.
 * @es Si `path` es un worktree ENLAZADO: git lo marca con `.git` como FICHERO, y un checkout principal
 * lo tiene como directorio. Es la misma pregunta de `process-reaper/linked-worktree.mjs`, escrita aquí
 * porque un módulo de b100 no importa del home de Claude. La reclamación por brief se limita a estos
 * porque casi todo brief declara `TENANCY: b100-am-ui`: aceptarla para el checkout principal haría
 * «dueño» a cualquier agente vivo. Antes se miraba si la carpeta madre se llamaba `worktrees`, y eso
 * dejaba invisible al dueño vivo de un worktree enlazado en cualquier otro sitio. Una ruta inexistente o
 * sin `.git` no es un worktree.
 */
function isLinkedWorktree(path) {
  try {
    return statSync(join(String(path), '.git')).isFile();
  } catch {
    return false;
  }
}

/**
 * The agent still writing into `path`, or undefined. `undefined` means "nobody is writing here" — it
 * does NOT mean "no agent owns it", and the two callers rely on that distinction.
 *
 * A record claims a worktree in one of two DECLARED ways, never a guessed one:
 *   - the harness's own `worktreePath`, for an agent launched with worktree isolation;
 *   - the `TENANCY:` line of its brief, for an agent launched WITHOUT isolation to take over a
 *     worktree. Measured 2026-09-29: agent a8534307c229206b6 took over a720f2ab70e86c7b4's worktree.
 *     Its meta has no `worktreePath`, so `orphan-work-guard` called live work orphaned and refused
 *     every delegation.
 * The brief is read with the SAME parser `brief-tenancy` enforces (`declarationOf`), so "claims this
 * worktree" means exactly what a brief must say to be allowed to send a worker there. A record with
 * its own `worktreePath` is never credited with its brief: the harness record wins.
 *
 * Three steps, cheapest first, so a brief is only opened for a candidate that is writing now: the
 * store holds hundreds of stopped agents.
 * @es El agente que sigue escribiendo en `path`, o undefined. Un registro reclama un worktree de dos
 * formas DECLARADAS: el `worktreePath` del harness, o la línea `TENANCY:` de su brief para un relevo
 * lanzado sin aislamiento, leída con el MISMO parser que exige `brief-tenancy`. El registro del harness
 * gana. Tres pasos, del más barato al más caro: el brief solo se abre si el candidato escribe ahora.
 */
export function activeOwner(path, records = agentRecords(), now = Date.now()) {
  const wanted = worktreeName(path).toLowerCase();

  if (wanted === '') return undefined;

  for (const record of records) {
    const byHarness = record.worktree !== '';
    const candidate = byHarness ? record.worktree.toLowerCase() === wanted : isLinkedWorktree(path);

    if (!candidate) continue;

    let quietForMs;

    try {
      quietForMs = now - statSync(record.transcript).mtimeMs;
    } catch {
      continue;
    }

    if (quietForMs >= ACTIVE_WINDOW_MS) continue;
    if (byHarness || declarationOf(briefOf(record.transcript), wanted) === 'present') return { id: record.id, quietForMs };
  }

  return undefined;
}
