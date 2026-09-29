#!/usr/bin/env node
/**
 * `Stop` guard — work that LANDED may not leave the session unrecorded in engram.
 *
 * WHY THIS EXISTS. Engram is this project's persistent memory: the owner's standing instruction is
 * that every report of what is done, what remains, and every important finding goes there, always,
 * because a session's context dies and engram does not. That instruction has been given repeatedly
 * and is still satisfied by remembering — the weakest control available, and the same shape as every
 * other lesson this fleet has had to mechanise.
 *
 * WHAT IT CHECKS, and why THIS property. Not "did the turn feel significant" — no hook can judge
 * that, and one that tried would fire constantly and be switched off. The checkable property is
 * narrower and load-bearing: **did the integration branch advance?** A commit is the project's own
 * definition of work that landed. If HEAD moved since this guard was last satisfied and no `mem_save`
 * appears in the transcript since that moment, then something real happened that the next session
 * will not know about.
 *
 * HOW IT DECIDES, without guessing. State records two things at each satisfaction: the HEAD it saw
 * and how far into the transcript it had read. On the next Stop it compares HEAD; if unchanged,
 * nothing landed and it allows. If changed, it reads ONLY the transcript written since that offset
 * and looks for a save. So a save made before the commits does not satisfy the commits — the order
 * is part of the check, which is what stops a stale save from covering new work.
 *
 * WHY IT NAMES THE COMMITS. A refusal that says "save something" is a refusal you satisfy with
 * anything. This one lists the commit subjects that would otherwise go unrecorded, because those
 * subjects ARE the content the save owes.
 *
 * FAILS OPEN on every malfunction of its own — no git, no transcript, unreadable state, a detached
 * HEAD: a guard able to wedge a session is a larger hazard than the one it closes. It also allows
 * immediately when `stop_hook_active` is set, so it can never trap a turn in a loop.
 *
 * @es Guard de `Stop`: el trabajo que ATERRIZÓ no puede salir de la sesión sin quedar en engram, que
 * es nuestra memoria persistente — el contexto de una sesión muere y engram no. No juzga si el turno
 * fue «importante»: comprueba si la rama de integración AVANZÓ, que es la propia definición de
 * trabajo aterrizado del proyecto. El estado guarda el HEAD visto y hasta dónde leyó el transcript,
 * así que un guardado ANTERIOR a los commits no los cubre: el orden forma parte de la comprobación.
 * Y nombra los commits que quedarían sin registrar, porque esos asuntos SON lo que el guardado debe.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, 'state');

/**
 * The literal that marks a save in the transcript. A tool name, not a phrase: prose about saving is
 * not a save, and this project has been burned by exactly that distinction elsewhere.
 * @es El literal que marca un guardado: un nombre de herramienta, no una frase. Hablar de guardar no
 * es guardar.
 */
const SAVE_MARKERS = ['mem_save', 'mem_session_summary'];

const statePathFor = (sessionId) => join(STATE_DIR, `${sessionId || 'unknown'}.json`);

function readState(sessionId) {
  try {
    return JSON.parse(readFileSync(statePathFor(sessionId), 'utf8'));
  } catch {
    return undefined;
  }
}

function writeState(sessionId, state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(statePathFor(sessionId), JSON.stringify(state), 'utf8');
  } catch {
    /* state is an optimisation, never a precondition */
  }
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * Transcript written since `offset`. Reading only the new tail is what makes the check ORDER-aware:
 * a save that predates the commits sits before the offset and cannot satisfy them.
 * @es Solo la cola nueva del transcript. Es lo que hace la comprobación sensible al ORDEN.
 */
function transcriptSince(path, offset) {
  try {
    const size = statSync(path).size;

    if (size <= offset) return '';

    // The offset is a BYTE count (it comes from `statSync().size`), so the cut is made on the bytes and
    // only the tail is decoded. Measured 2026-09-14: cutting the decoded STRING by that byte offset
    // landed past its end on a transcript carrying 459,662 bytes of multi-byte text, returned an empty
    // tail, and the guard refused twice straight after real saves. A byte boundary may split one UTF-8
    // character; that only garbles the first character of the tail, never an ASCII marker after it.
    // @es El offset son BYTES, así que se corta en bytes y solo se decodifica la cola. Cortar el STRING
    // decodificado con un offset en bytes caía más allá del final y devolvía una cola vacía.
    return readFileSync(path).subarray(offset).toString('utf8');
  } catch {
    return undefined;
  }
}

function reason(subjects) {
  return [
    'ENGRAM-PERSISTENCE: work landed on the integration branch and nothing was saved to memory.',
    '',
    'Commits since the last recorded save:',
    ...subjects.map((subject) => `  ${subject}`),
    '',
    'Engram is this project\'s persistent memory — this session\'s context dies, engram does not. The',
    'owner\'s standing instruction is that what is done, what remains, and every important finding goes',
    'there ALWAYS. Those commit subjects are the content this save owes.',
    '',
    'Call mem_save (or mem_session_summary) with what actually happened — the decision and its reason,',
    'the measurement and the command that produced it, what is now open. Then stop again.',
    '',
    'This checks whether HEAD MOVED, not whether the turn felt important, because a commit is the',
    'project\'s own definition of work that landed. A save made BEFORE these commits does not cover',
    'them: the check reads only the transcript written since the last save, so order counts.'
  ].join('\n');
}

/** La decisión sobre un payload ya parseado: la salida que bloquea, o `undefined`. */
function decide(payload) {
  // Never trap a turn: if this guard already fired for this stop, let it through.
  if (payload?.stop_hook_active === true) return;

  const sessionId = payload?.session_id;
  const transcriptPath = payload?.transcript_path;

  let head;

  try {
    head = git(['rev-parse', 'HEAD']);
  } catch {
    return; // no git, no verdict
  }

  const state = readState(sessionId);
  const size = (() => {
    try {
      return statSync(transcriptPath).size;
    } catch {
      return undefined;
    }
  })();

  // First sighting of this session: record and allow. There is nothing to compare against yet.
  if (state === undefined || typeof state.head !== 'string') {
    writeState(sessionId, { head, offset: size ?? 0 });
    return;
  }

  if (state.head === head) {
    // Nothing landed. Keep the offset current so a later save is measured from here.
    writeState(sessionId, { head, offset: size ?? state.offset });
    return;
  }

  const tail = transcriptSince(transcriptPath, state.offset ?? 0);

  if (tail === undefined) {
    // Cannot read the transcript, so cannot tell. Fail open and re-baseline.
    writeState(sessionId, { head, offset: size ?? 0 });
    return;
  }

  if (SAVE_MARKERS.some((marker) => tail.includes(marker))) {
    writeState(sessionId, { head, offset: size ?? 0 });
    return;
  }

  let subjects = [];

  try {
    const log = git(['log', '--oneline', `${state.head}..${head}`]);
    subjects = log === '' ? [] : log.split('\n').slice(0, 12);
  } catch {
    return; // the range is unreadable (rebased, gone) — no honest verdict
  }

  if (subjects.length === 0) {
    writeState(sessionId, { head, offset: size ?? 0 });
    return;
  }

  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(
      join(STATE_DIR, 'refusals.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), session: sessionId, from: state.head, to: head, commits: subjects.length })}\n`,
      'utf8'
    );
  } catch {
    /* evidence, never a precondition */
  }

  return { decision: 'block', reason: reason(subjects) };
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un payload ilegible deja pasar.
 */
export function evaluate(raw) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  return decide(payload);
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
