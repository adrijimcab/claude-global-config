#!/usr/bin/env node
/**
 * failure-capture — turns a correction into a durable rule, and a REPEATED correction into contract.
 *
 * WHY THIS EXISTS. `~/.claude/lessons-ledger.md` already works, but an entry reaches it only when
 * someone REMEMBERS to write one. This project has ruled that control inadequate more than once
 * (ledger, 2026-06-16: "when the goal is never repeat X, enforce via hook injection, not memory
 * alone"; 2026-07-07: "a lesson without a blocking gate WILL recur"). This file is the writing half;
 * `turn-guard.mjs` is the half that makes NOT writing impossible to walk past.
 *
 * WHAT IS DETERMINISTIC HERE, STATED HONESTLY:
 *   - deterministic : that a capture was recorded; its FORM (key, scope, actor, a stated RULE);
 *                     that a key already exists, i.e. RECURRENCE; who the actor was (the harness
 *                     tells us: `SubagentStop` carries agent_id/agent_type, `Stop` does not); and
 *                     that a promotion actually landed in BOTH contract files plus the parity anchor;
 *                     and that it was CLOSED by a mechanism whose selftest ran and passed, or by a
 *                     recorded reason no mechanism is possible (`closure.mjs`) — text alone never closes.
 *   - NOT deterministic : whether a mistake occurred, and whether two incidents are "the same
 *                     lesson". The key is chosen by the model from the printed list of existing keys.
 *                     What is enforced is that a key MUST be given and MUST come from that vocabulary
 *                     or be new — not that the choice is correct. Said plainly rather than dressed up.
 *
 * CONCURRENCY. This repository routinely runs several worktree workers at once, and a read-modify-
 * write against one 50 KB file from five processes loses entries. So a capture is first written to a
 * spool file of its own (atomic create+rename), and only a lock holder folds the spool into the
 * ledger. A spool file is deleted only after it is folded, so a lost lock costs latency, never data.
 *
 * @es failure-capture — convierte una corrección en regla durable, y una corrección REPETIDA en
 * contrato. POR QUÉ EXISTE: al lessons-ledger solo llega lo que alguien RECUERDA escribir, y este
 * proyecto ya dictaminó que ese control es inadecuado. DETERMINISTA aquí: que hubo captura, su FORMA,
 * la RECURRENCIA de una clave, quién fue el actor (lo dice el harness) y que una promoción aterrizó en
 * AMBOS ficheros de contrato con su anchor de paridad. NO determinista: que hubiera error, y que dos
 * incidentes sean "la misma lección" (la clave la elige el modelo de la lista impresa). CONCURRENCIA:
 * cada captura va primero a su propio fichero de spool y solo quien tiene el lock lo pliega al ledger;
 * un spool se borra solo tras plegarse, así que perder el lock cuesta latencia, nunca datos.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { baselineFor, closureClause, closureRecord, contractFileId, MECHANISM_FLAG, NO_MECHANISM_FLAG, readClosure, verifyMechanism } from './closure.mjs';
import { describeOutcome, newRunId, runCondense } from './condense.mjs';
import { isValidKey, MARK_CLOSE, MARK_OPEN, readMarker } from './ledger-line.mjs';
import { promotedStub } from './promotion.mjs';
import { GLOBAL_LOADER, globalLedgerFile, HEADER, ledgerFiles, ledgerForScope, locateKey, PROJECT_LOADER, readLedgers, writeLedger } from './ledgers.mjs';
import { withLock } from './ledger-lock.mjs';
import { GLOBAL_SCOPE, projectOf } from './project.mjs';
import { captureTextProblems, newLessonLine } from './tiered-capture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The PROJECT this command runs in (`project.mjs`), never the folder this code sits in: the loop is
// global since 2026-09-30, so `HERE/../..` would name the user's home, not a repository.
// @es El PROYECTO donde corre el comando, nunca la carpeta del código: el bucle es global.
const PROJECT = projectOf(process.cwd());
const STATE_DIR = path.join(HERE, 'state');
const SPOOL_DIR = path.join(STATE_DIR, 'spool');
const LOCK_FILE = path.join(STATE_DIR, 'ledger.lock');
const INCIDENTS = path.join(STATE_DIR, 'incidents.jsonl');
const DISMISSALS = path.join(STATE_DIR, 'dismissals.jsonl');
const LAST_CAPTURE = path.join(STATE_DIR, 'last-capture.json');
// Read-only since `ledger-tiering-budget`: the record of promotions made by the OLD tool (`status` honours it).
// @es Solo lectura desde `ledger-tiering-budget`: el registro de promociones de la herramienta ANTIGUA.
const PROMOTED = path.join(STATE_DIR, 'promoted.md');

// One ledger per scope (`ledgers.mjs`): a project's lessons never travel to every other project.
// @es Un ledger por alcance: las lecciones de un proyecto no viajan a los demás.
const LEDGERS = ledgerFiles({ project: PROJECT, home: homedir() });
// El contrato del ORQUESTADOR ya no está en CLAUDE.md: las reglas promovidas viven en un archivo de
// `~/.claude/rules/`, que Claude Code carga en todo proyecto y que `gentle-ai sync` no toca (sync
// reescribe las regiones gestionadas de CLAUDE.md). El destino conserva el nombre histórico
// `claude-md` en los registros de cierre para no romper `incidents.jsonl`.
const ORCHESTRATOR_RULES = path.join(homedir(), '.claude', 'rules', 'promoted-rules.md');
// The delegated-worker contract of THIS project: its configured files (`.claude/failure-capture.json`),
// or `.claude/CLAUDE.md`, which every subagent of the project loads. The first file is the one whose
// token count the text-growth check reads.
// @es El contrato de worker de ESTE proyecto: sus ficheros configurados, o `.claude/CLAUDE.md`.
const WORKER_CONTRACTS = PROJECT?.workerContracts ?? [];
// The parity gate LEFT the repository (owner directive: nothing AI-related lives inside the lib).
// This constant pointed at the removed `scripts/` path afterwards, which silently killed the loop's
// escalation arm: `promote` verifies the anchor on disk, the file was absent, so EVERY promotion
// refused forever while `capture` kept counting recurrences no one could ever act on. A dangling
// reference after a move is not cosmetic — here it disabled the only mechanism that turns a repeated
// incident into a binding rule.
// @es El gate de paridad salió del repo; esta constante siguió apuntando a la ruta eliminada, lo que
// mató en silencio el brazo de escalada del loop: `promote` verifica el ancla en disco, el fichero no
// estaba, y toda promoción se negaba para siempre mientras `capture` seguía contando reincidencias.
// Since the loop went global the gate is per project, and optional: only a project whose contract lives in
// several files declares one (`parityGate` in `.claude/failure-capture.json`).
// @es Desde que el bucle es global, el gate es por proyecto y opcional.
const PARITY_GATE = PROJECT?.parityGate;

/** The scopes a capture from here may declare. @es Los alcances que puede declarar una captura desde aquí. */
const SCOPES = PROJECT === undefined ? [GLOBAL_SCOPE] : [GLOBAL_SCOPE, PROJECT.scope];

/** Recurrences needed before a lesson stops being an incident and becomes a rule. @es Recurrencias necesarias para que una lección deje de ser incidente y pase a regla. */
const PROMOTION_THRESHOLD = 2;

// ---------------------------------------------------------------------------------------------
// small utilities — no regexes anywhere (owner mandate M5) / utilidades: cero regex (mandato M5)
// ---------------------------------------------------------------------------------------------

/** Parses `--flag value` pairs into a plain object. @es Convierte pares `--flag valor` en un objeto. */
function parseArgs(argv) {
  const out = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) continue;

    const name = token.slice(2);
    const next = argv[i + 1];

    if (next === undefined || next.startsWith('--')) {
      out[name] = true;
      continue;
    }

    out[name] = next;
    i += 1;
  }

  return out;
}

/** Today as YYYY-MM-DD in local time. @es Hoy como YYYY-MM-DD en hora local. */
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function ensureDirs() {
  mkdirSync(SPOOL_DIR, { recursive: true });
}

function readFileOr(file, fallback) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

/** Every key currently carried by the ledger, with its recurrence count. @es Todas las claves del ledger con su recuento. */
function ledgerKeys() {
  const found = new Map();

  for (const ledger of readLedgers(LEDGERS)) {
    for (const line of ledger.lines ?? []) {
      const marker = readMarker(line);

      if (marker !== undefined) found.set(marker.key, marker.count);
    }
  }

  return found;
}

// ---------------------------------------------------------------------------------------------
// spool + lock — the only writer of the ledger / spool + lock: el único escritor del ledger
// (the lock is `ledger-lock.mjs` / el lock es `ledger-lock.mjs`)
// ---------------------------------------------------------------------------------------------

/** Writes one spool entry atomically: temp file then rename. @es Escribe una entrada de spool atómicamente: temporal y luego rename. */
function spool(entry) {
  const name = `${String(Date.now())}-${String(process.pid)}-${Math.random().toString(36).slice(2, 10)}.json`;
  const temp = path.join(SPOOL_DIR, `.${name}.tmp`);
  const final = path.join(SPOOL_DIR, name);

  writeFileSync(temp, JSON.stringify(entry), 'utf8');
  renameSync(temp, final);

  return final;
}

/**
 * The ledgers each spooled entry can see — the global one and the one of the project it was captured in —
 * read once per file and SHARED between entries, so two entries touching the same file edit one copy.
 * @returns `(entry) => ledgers | undefined`.
 * @es Los ledgers que ve cada entrada del spool, leídos una vez por fichero y COMPARTIDOS entre entradas.
 */
function ledgerCache() {
  const byFile = new Map();
  const load = (scope, file, header) => {
    if (!byFile.has(file)) byFile.set(file, readLedgers({ [scope]: { file, header } })[0]);

    return byFile.get(file);
  };

  return (entry) => {
    const global = load(GLOBAL_SCOPE, globalLedgerFile(homedir()), HEADER(GLOBAL_SCOPE, GLOBAL_LOADER));
    const project = entry.project ?? (PROJECT !== undefined && entry.scope === PROJECT.scope ? { scope: PROJECT.scope, ledgerFile: PROJECT.ledgerFile } : undefined);

    if (project === undefined) return entry.scope === GLOBAL_SCOPE ? [global] : undefined;

    return [global, load(project.scope, project.ledgerFile, HEADER(project.scope, PROJECT_LOADER))];
  };
}

/**
 * Folds every spooled capture into the ledger under the lock. A key already present is a RECURRENCE:
 * the counter is bumped and the ORIGINAL line is kept, so the ledger grows by DISTINCT lessons and
 * not by incidents — that is the whole answer to "an append-only log injected on every prompt becomes
 * a token tax". The incident's own text is never discarded; it goes to `incidents.jsonl`, which is
 * never injected.
 * @es Pliega cada captura del spool al ledger bajo el lock. Una clave ya presente es RECURRENCIA: se
 * incrementa el contador y se conserva la línea ORIGINAL, así el ledger crece por lecciones DISTINTAS
 * y no por incidentes. El texto del incidente no se pierde: va a `incidents.jsonl`, que no se inyecta.
 */
function reconcile() {
  ensureDirs();

  const pending = readdirSync(SPOOL_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('.'));

  if (pending.length === 0) return { folded: [], deferred: 0 };

  const outcome = withLock(LOCK_FILE, () => {
    const folded = [];
    const ledgersOf = ledgerCache();
    const touched = new Set();

    for (const file of pending.sort()) {
      const full = path.join(SPOOL_DIR, file);
      let entry;

      try {
        entry = JSON.parse(readFileSync(full, 'utf8'));
      } catch {
        continue; // a corrupt spool file is left in place for a human, never silently dropped
      }

      const ledgers = ledgersOf(entry);

      // An entry spooled from a project that is not the one reconciling, with no ledger recorded (written
      // before the loop went global), is left in the spool for a capture from its own project.
      // @es Una entrada de otro proyecto sin ledger registrado se deja en el spool para su propio proyecto.
      if (ledgers === undefined) continue;

      // A key already present folds in WHERE it is, whatever scope this capture declares.
      // @es Una clave ya presente se suma DONDE está, sea cual sea el alcance de esta captura.
      const found = locateKey(ledgers, entry.key, readMarker);

      if (found === undefined) {
        const ledger = ledgerForScope(ledgers, entry.scope);
        const marker = `${MARK_OPEN}${entry.key}#1${MARK_CLOSE}`;

        // A capture with a `--rule` is written tiered, or as the full line when shortening fails
        // (`tiered-capture.mjs`); without one the line is exactly what it always was.
        // @es Una captura con `--rule` se escribe con niveles, o completa si acortar falla.
        const made = newLessonLine({ ledgerFile: ledger.file, scope: entry.scope, date: entry.date, key: entry.key, lesson: entry.lesson, rule: entry.rule, marker });

        ledger.lines.push(made.line);
        touched.add(ledger);
        folded.push({ ...entry, count: 1, recurrence: false, fallback: made.problem });
      } else {
        const { ledger, index } = found;
        const marker = readMarker(ledger.lines[index]);
        const count = marker.count + 1;
        const line = ledger.lines[index];

        ledger.lines[index] = `${line.slice(0, marker.open)}${MARK_OPEN}${marker.key}#${String(count)}${MARK_CLOSE}${line.slice(marker.close)}`;
        touched.add(ledger);
        folded.push({ ...entry, count, recurrence: true });
      }

      appendFileSync(INCIDENTS, `${JSON.stringify(entry)}\n`, 'utf8');
      unlinkSync(full);
    }

    for (const ledger of touched) writeLedger(ledger);

    return folded;
  });

  return outcome.held ? { folded: outcome.value, deferred: 0 } : { folded: [], deferred: pending.length };
}

/** Stamps that this session recorded something, so the turn guard can see it deterministically. @es Sella que esta sesión registró algo, para que el guard lo vea de forma determinista. */
function stamp(sessionId, kind) {
  ensureDirs();
  writeFileSync(LAST_CAPTURE, JSON.stringify({ session: sessionId ?? 'unknown', kind, at: Date.now() }), 'utf8');
}

// ---------------------------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------------------------

function commandKeys() {
  const keys = ledgerKeys();

  if (keys.size === 0) {
    console.log('(no keyed lessons yet — every capture so far predates the failure-capture loop)');

    return 0;
  }

  console.log('EXISTING LESSON KEYS — reuse one if this incident is the SAME lesson:');

  for (const [key, count] of [...keys].sort()) {
    console.log(`  ${key}  (recorded ${String(count)}x)`);
  }

  return 0;
}

function commandCapture(args) {
  const { key, scope, actor, lesson, rule, session } = args;
  const problems = [];

  if (!isValidKey(key)) problems.push('--key must be lowercase-kebab-case, 4-60 chars (it becomes the parity anchor if this lesson is ever promoted)');
  if (!SCOPES.includes(scope)) problems.push(`--scope must be ${SCOPES.map((one) => `"${one}"`).join(' or ')} here${PROJECT === undefined ? ' (no project holds this directory: run from inside one to record a project lesson)' : ''}`);
  if (typeof actor !== 'string' || (actor !== 'orchestrator' && !actor.startsWith('worker'))) problems.push('--actor must be "orchestrator" or "worker:<agent-type>"');
  if (typeof lesson !== 'string' || lesson.length < 40) problems.push('--lesson must be a real one-line lesson (40+ chars)');
  if (rule === undefined && typeof lesson === 'string' && !lesson.includes('RULE')) problems.push('--lesson must state the rule explicitly and contain the word RULE (ledger format: what went wrong -> root cause -> RULE)');

  problems.push(...captureTextProblems({ lesson, rule }));

  if (problems.length > 0) {
    console.error('capture REFUSED — the entry would not be a usable lesson:');
    for (const problem of problems) console.error(`  - ${problem}`);

    return 1;
  }

  ensureDirs();
  // The entry names the project it was captured in — whatever its declared scope, because a recurrence of
  // a project key folds into the project ledger even when captured as global — so any later reconcile,
  // from any project, sees the same two ledgers this capture saw.
  // @es La entrada nombra el proyecto donde se capturó, sea cual sea su alcance, para que cualquier
  // reconciliación posterior vea los mismos dos ledgers.
  const project = PROJECT === undefined ? undefined : { scope: PROJECT.scope, ledgerFile: PROJECT.ledgerFile };

  spool({ key, scope, actor, lesson, ...(rule === undefined ? {} : { rule }), date: today(), session: session ?? 'unknown', at: new Date().toISOString(), ...(project === undefined ? {} : { project }) });

  const { folded, deferred } = reconcile();

  stamp(session, 'capture');

  if (deferred > 0) {
    console.log(`RECORDED (spooled) — the ledger is locked by another writer; ${String(deferred)} entr(y/ies) will fold on the next capture. Nothing is lost. @es El ledger está bloqueado por otro escritor; ${String(deferred)} entrada(s) se plegará(n) en la próxima captura. No se pierde nada.`);

    return 0;
  }

  const mine = folded.find((f) => f.key === key);

  if (mine === undefined) {
    console.log('RECORDED (spooled) — not folded in this pass; it will fold on the next capture.');

    return 0;
  }

  if (mine.fallback !== undefined) console.log(`NOTE — ${mine.fallback}`);

  if (mine.count < PROMOTION_THRESHOLD) {
    console.log(`RECORDED in the lessons ledger as a NEW lesson: ${key} (1x).`);
    console.log('It stays an INCIDENT. If it happens again the loop will demand promotion AND a mechanism (or a written reason none is possible).');

    return 0;
  }

  const target = promotionTarget(key);

  console.log(`RECURRENCE — "${key}" has now been recorded ${String(mine.count)}x.`);
  console.log('');
  console.log('An incident that repeats is no longer an incident: ledger injection alone did NOT prevent it.');
  console.log('This project already ruled on that (ledger 2026-07-07: "a lesson without a blocking gate WILL recur").');
  console.log('');
  console.log(promotionInstructions(key, target));

  return 0;
}

/**
 * Where a repeated lesson must be promoted to. The actor is DETERMINISTIC — the harness reports it —
 * so the target is derived, not guessed: a worker's repeated mistake belongs in the contract both
 * runtimes read; the orchestrator's belongs in the orchestrator's own standing instructions.
 * @es A dónde promociona una lección repetida. El actor es DETERMINISTA (lo reporta el harness), así
 * que el destino se DERIVA: el error repetido de un worker va al contrato de ambos runtimes; el del
 * orquestador, a sus propias instrucciones permanentes.
 */
function promotionTarget(key) {
  const actors = new Set();

  for (const line of readFileOr(INCIDENTS, '').split('\n')) {
    if (line.length === 0) continue;

    try {
      const entry = JSON.parse(line);

      // A closure record names no actor: it is how a lesson was closed, not who repeated it.
      if (entry.kind === 'promotion') continue;

      if (entry.key === key) actors.add(entry.actor.startsWith('worker') ? 'worker' : 'orchestrator');
    } catch {
      /* skip an unparseable incident line rather than failing the whole verdict */
    }
  }

  if (actors.has('worker')) return 'contract';

  return 'claude-md';
}

/**
 * The steps a recurring lesson owes before it closes. The LAST step is the one the stop-the-line
 * directive added: contract text records the rule, but only a mechanism — or a written reason none is
 * possible — closes the incident, so `promote` refuses without one (`closure.mjs`).
 * @es Los pasos que debe una lección recurrente antes de cerrarse. El ÚLTIMO lo añadió la directiva de
 * parar la línea: el texto de contrato registra la regla, pero sólo un mecanismo —o un motivo escrito de
 * por qué no cabe— cierra el incidente.
 */
function promotionInstructions(key, target) {
  const closeStep = (number) => [
    `  ${String(number)}. Close it with a MECHANISM that makes the repeat impossible, or say why none is possible:`,
    `       node "${path.join(HERE, 'capture.mjs')}" promote --key ${key} ${MECHANISM_FLAG} <guard path>`,
    `       node "${path.join(HERE, 'capture.mjs')}" promote --key ${key} ${NO_MECHANISM_FLAG} "<reason>"`,
    '     The mechanism must name the key and its selftest.mjs is RUN and must pass; the reason is recorded verbatim.',
  ];

  if (target === 'claude-md') {
    return [
      'PROMOTION REQUIRED -> the ORCHESTRATOR contract (every incident so far was the orchestrator).',
      `  1. Add the rule to ${ORCHESTRATOR_RULES}, and include the literal token "${key}" in it.`,
      ...closeStep(2),
      '     It refuses until the token is actually there. Do not hand-edit the ledger instead.',
    ].join('\n');
  }

  if (WORKER_CONTRACTS.length === 0) {
    return [
      'PROMOTION REQUIRED -> the DELEGATED-WORKER contract, but no project holds this directory, so there is',
      'no worker contract to promote into. Re-run `promote` from inside the project the lesson belongs to.',
    ].join('\n');
  }

  const contractSteps = WORKER_CONTRACTS.map((file, at) => `  ${String(at + 1)}. Add the rule to ${file}, including the literal token "${key}".`);
  const paritySteps = PARITY_GATE === undefined ? [] : [`  ${String(contractSteps.length + 1)}. Add "${key}" to the ANCHORS array in ${PARITY_GATE}, so the parity gate enforces the files from now on.`];

  return [
    `PROMOTION REQUIRED -> the DELEGATED-WORKER contract of ${PROJECT.scope} (${String(WORKER_CONTRACTS.length)} file(s)${PARITY_GATE === undefined ? '' : ' and a parity gate'}).`,
    ...(WORKER_CONTRACTS.length > 1 ? ['A rule added to one file only means workers on another runtime silently never receive it.'] : []),
    ...contractSteps,
    ...paritySteps,
    ...closeStep(contractSteps.length + paritySteps.length + 1),
    `     It verifies every step${PARITY_GATE === undefined ? '' : ' and runs the parity gate'}; it refuses while any step is missing.`,
  ].join('\n');
}

/** How many times `token` occurs in `text`, counted without a regex. @es Cuántas veces aparece `token`. */
function occurrencesOf(text, token) {
  let count = 0;

  for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + 1)) count += 1;

  return count;
}

/** Every incident line for `key`, parsed, oldest first. @es Todas las líneas de incidente de `key`. */
function incidentsFor(key) {
  const found = [];

  for (const line of readFileOr(INCIDENTS, '').split('\n')) {
    if (line.length === 0) continue;

    try {
      const entry = JSON.parse(line);

      if (entry.key === key) found.push(entry);
    } catch {
      /* an unparseable line is not evidence either way */
    }
  }

  return found;
}

/**
 * THE TEXT MUST GROW WHEN THE LESSON RECURS, or the promotion is refused.
 *
 * This is the mechanism of `promotion-to-contract-read-as-prevention`, and it exists because that
 * lesson's own text says the rest: a promoted rule prevents only the FACES ITS TEXT NAMES, so a key
 * whose recurrence count climbs while its contract paragraph stands unchanged is telling you the TEXT
 * is the stale artifact. `measurement-failure-is-not-a-zero` recurred an EIGHTH time with its rule
 * already in both contracts and anchored in the parity gate, because the recurrence was a face the
 * paragraph never mentioned.
 *
 * WHAT IS CHECKED, and what deliberately is not. The count of the key's own token in the contract file
 * — which this project's convention puts beside every face it names, `(\`key\`, sixth occurrence)` — must
 * be HIGHER than it was at the last closure, but ONLY when a new incident has been recorded SINCE that
 * closure. So a first promotion is free; re-closing an old promotion with a mechanism is free; and the
 * one path that is refused is the one the lesson describes: the key recurred, and the text that failed
 * to prevent it is being re-promoted unchanged. Whether the new paragraph is GOOD is not decidable
 * here and is not claimed; what is decidable is that someone wrote one.
 *
 * @es EL TEXTO DEBE CRECER CUANDO LA LECCIÓN REINCIDE. Es el mecanismo de
 * `promotion-to-contract-read-as-prevention`: una regla promovida solo previene las CARAS QUE SU TEXTO
 * NOMBRA, así que una clave cuya cuenta sube con el párrafo intacto está diciendo que el TEXTO es el
 * artefacto rancio. Se exige más apariciones del token que en el cierre anterior, pero SOLO si hubo un
 * incidente nuevo desde entonces: la primera promoción es libre, y volver a cerrar una antigua con un
 * mecanismo también. Que el párrafo nuevo sea BUENO no es decidible aquí y no se afirma.
 */
/** The file whose token count measures a promotion's text: the orchestrator rules, or the project's first worker contract. @es El fichero cuyo recuento mide el texto. */
const contractFileOf = (target) => (target === 'claude-md' ? ORCHESTRATOR_RULES : WORKER_CONTRACTS[0] ?? '');

function textGrowthProblem(key, target) {
  const entries = incidentsFor(key);
  const file = contractFileOf(target);
  // Only a closure measured on THIS file is a baseline (`baselineFor`): counts of two files are not comparable.
  // @es Solo un cierre medido sobre ESTE fichero es línea base: las cuentas de dos ficheros no se comparan.
  const last = baselineFor(entries.filter((entry) => entry.kind === 'promotion'), file);

  if (last === undefined) return undefined;

  const recurred = entries.some((entry) => entry.kind !== 'promotion' && typeof entry.at === 'string' && entry.at > last.at);

  if (!recurred) return undefined;

  const now = occurrencesOf(readFileOr(file, ''), key);

  if (now > last.tokenCount) return undefined;

  return [
    `"${key}" has recurred since it was last closed on ${last.date}, and the text that failed to prevent it has not grown:`,
    `  ${file}`,
    `  names "${key}" ${String(now)} time(s); it named it ${String(last.tokenCount)} time(s) at that closure.`,
    '',
    'A promoted rule prevents only the FACES ITS TEXT NAMES. Read the existing paragraph, decide whether',
    'this recurrence is a face it already names, and when it is not, EXTEND it with the new face — in',
    'every file that carries the rule — before promoting again.'
  ].join('\n');
}

/**
 * What a promotion actually verified, and nothing more: claiming "parity gate green" where no gate ran
 * would be this tool committing the defect it exists to catch.
 * @es Lo que una promoción verificó de verdad, y nada más.
 */
function proofOf(target) {
  if (target !== 'contract') return 'token present in the file';

  const files = `token present in ${String(WORKER_CONTRACTS.length)} contract file(s)`;

  return PARITY_GATE === undefined ? `${files}; this project declares no parity gate` : `${files} and in the ANCHORS array; parity gate ran and passed`;
}

function commandPromote(args) {
  const { key } = args;

  if (!isValidKey(key)) {
    console.error('promote REFUSED — --key must be a valid lesson key.');

    return 1;
  }

  const keys = ledgerKeys();

  if (!keys.has(key)) {
    console.error(`promote REFUSED — "${key}" is not a lesson in the ledger. Nothing to promote.`);

    return 1;
  }

  // The closure is read FIRST and cheaply: a promotion that names neither a mechanism nor a reason is
  // refused before anything is checked or run, with both ways to close it named (`closure.mjs`).
  // @es El cierre se lee PRIMERO y barato: sin mecanismo ni motivo se rechaza antes de comprobar nada.
  const closure = readClosure(args);

  if (closure.kind === 'refused') {
    console.error('promote REFUSED — no valid closure:');
    for (const problem of closure.problems) console.error(`  ${problem}`);

    return 1;
  }

  const target = promotionTarget(key);
  const missing = [];

  if (target === 'claude-md') {
    if (!readFileOr(ORCHESTRATOR_RULES, '').includes(key)) missing.push(`the token "${key}" is absent from ${ORCHESTRATOR_RULES}`);
  } else {
    if (WORKER_CONTRACTS.length === 0) missing.push('no project holds this directory, so there is no worker contract to promote into');
    for (const file of WORKER_CONTRACTS) if (!readFileOr(file, '').includes(key)) missing.push(`the token "${key}" is absent from ${file}`);
    if (PARITY_GATE !== undefined && !readFileOr(PARITY_GATE, '').includes(`'${key}'`)) missing.push(`"${key}" is not in the ANCHORS array of ${PARITY_GATE}`);
  }

  if (missing.length > 0) {
    console.error('promote REFUSED — the rule has not actually landed:');
    for (const problem of missing) console.error(`  - ${problem}`);
    console.error('');
    console.error(promotionInstructions(key, target));

    return 1;
  }

  const stale = textGrowthProblem(key, target);

  if (stale !== undefined) {
    console.error('promote REFUSED — the rule was already promoted and the lesson came back anyway:');
    console.error(stale);

    return 1;
  }

  if (target === 'contract' && PARITY_GATE !== undefined) {
    try {
      execFileSync(process.execPath, [PARITY_GATE], { cwd: PROJECT.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      console.error('promote REFUSED — the contract parity gate is RED after your edit:');
      console.error(String(error.stdout ?? '') + String(error.stderr ?? ''));

      return 1;
    }
  }

  // The expensive check runs LAST, once every cheap refusal has had its chance: the mechanism's own
  // selftest is executed and its exit code read, never assumed from the file being there.
  // @es La comprobación cara corre la ÚLTIMA: el selftest del mecanismo se EJECUTA y se lee su código.
  let verification;

  if (closure.kind === 'mechanism') {
    // A relative mechanism path is relative to the project the command runs in; `~/…` to the home.
    // @es Una ruta relativa es relativa al proyecto; `~/…`, al home.
    verification = verifyMechanism({ mechanismPath: closure.path, key, repoRoot: PROJECT?.root ?? homedir(), home: homedir() });

    if (!verification.ok) {
      console.error('promote REFUSED — the mechanism does not close this lesson:');
      console.error(`  - ${verification.problem}`);

      return 1;
    }
  }

  // The rule now lives somewhere binding. The ledger line collapses to a MINIMAL stub instead of being
  // deleted: `SendMessage` does NOT fire the delegation-time injector, so a resumed worker may never
  // receive the contract in this session, while the ledger is loaded at every session start.
  // Deleting outright would trade a few bytes for a hole on exactly the resume path. The whole line, and how
  // the promotion closed, go to the evidence store first (`promotion.mjs`); that store is the one place the
  // text lives, so the old `state/promoted.md` is no longer written.
  // @es La regla ya vive en un sitio vinculante. La línea del ledger se colapsa a un muñón MÍNIMO en vez de
  // borrarse: `SendMessage` NO dispara el inyector de delegación, así que un worker reanudado puede no
  // recibir el contrato en esta sesión; borrarla cambiaría impuesto de tokens por un agujero. La línea
  // entera y cómo cerró la promoción van antes al almacén de evidencia; ese almacén es el único sitio
  // del texto, así que `state/promoted.md` ya no se escribe.
  const where = target === 'claude-md' ? '~/.claude/rules/promoted-rules.md' : `the delegated-worker contract (${WORKER_CONTRACTS.length > 1 ? `all ${String(WORKER_CONTRACTS.length)} files` : 'its file'})`;
  // The ledger is read only once the lock is held: a copy read before it would be written back over any
  // line another writer added while this one waited, and would carry an out-of-date recurrence counter.
  // @es El ledger se lee solo con el lock ya tomado: una copia leída antes se reescribiría encima de las
  // líneas que otro escritor añadiera mientras este esperaba, y llevaría un contador de recurrencia viejo.
  const collapsed = withLock(LOCK_FILE, () => {
    const found = locateKey(readLedgers(LEDGERS), key, readMarker);

    if (found === undefined) return;

    const { ledger, index } = found;
    const stub = promotedStub({ ledgerFile: ledger.file, original: ledger.lines[index], date: today(), closure, where });

    if (!stub.ok) return stub;

    ledger.lines[index] = stub.line;
    writeLedger(ledger);
    appendFileSync(INCIDENTS, `${JSON.stringify(closureRecord({ key, closure, verification, target, tokenCount: occurrencesOf(readFileOr(contractFileOf(target), ''), key), file: contractFileId(contractFileOf(target)) }))}\n`, 'utf8');

    return stub;
  });

  if (!collapsed.held) {
    console.error('promote: the ledger is locked by another writer — re-run in a moment. Nothing was changed. @es promote: el ledger está bloqueado por otro escritor; reintenta en un momento. No se cambió nada.');

    return 1;
  }

  if (collapsed.value?.ok !== true) {
    console.error(`promote REFUSED — ${collapsed.value?.problem ?? 'the lesson is no longer in the ledger. @es la lección ya no está en el ledger.'}`);

    return 1;
  }

  // Report only what was actually checked. Claiming "parity gate green" on the CLAUDE.md path, where
  // the parity gate is never run, would be this tool committing the exact defect it exists to catch.
  // @es Reportar solo lo comprobado: decir "parity gate verde" en el camino de CLAUDE.md, donde el
  // gate ni se ejecuta, sería esta herramienta cometiendo el fallo que existe para cazar.
  const proof = proofOf(target);

  console.log(`PROMOTED "${key}" -> ${where}. Verified on disk (${proof}); ${closureClause(closure)}.`);
  console.log('The ledger line is now a stub, so the lesson costs a fraction of the tokens it did.');

  return 0;
}

function commandDismiss(args) {
  const { marker, reason, session } = args;

  if (typeof reason !== 'string' || reason.length < 25) {
    console.error('dismiss REFUSED — --reason must say WHY this is not a correction (25+ chars).');
    console.error('A dismissal is recorded, never silent: the dismissal log is the only evidence that');
    console.error('can ever justify tuning the markers, so an empty one destroys the data it exists for.');

    return 1;
  }

  ensureDirs();
  appendFileSync(DISMISSALS, `${JSON.stringify({ marker: marker ?? 'unknown', reason, session: session ?? 'unknown', at: new Date().toISOString() })}\n`, 'utf8');
  stamp(session, 'dismiss');
  console.log('DISMISSED and recorded. The turn may end.');

  return 0;
}

function commandStatus() {
  const keys = ledgerKeys();
  // The incident log also carries `promotion` closure records; they are not incidents and are not counted as such.
  // @es El registro de incidentes también lleva registros de cierre `promotion`; no son incidentes y no se cuentan.
  const incidents = readFileOr(INCIDENTS, '').split('\n').filter((l) => l.length > 0 && !l.includes('"kind":"promotion"')).length;
  const dismissals = readFileOr(DISMISSALS, '').split('\n').filter((l) => l.length > 0).length;
  for (const ledger of readLedgers(LEDGERS)) {
    const bytes = ledger.lines === undefined ? 0 : Buffer.byteLength(ledger.lines.join('\n'));

    console.log(`ledger ${ledger.scope.padEnd(11)}: ${ledger.file} — ${String(bytes)} bytes (~${String(Math.round(bytes / 4))} tokens, loaded once per session)`);
  }
  console.log(`keyed lessons     : ${String(keys.size)}`);
  console.log(`incidents recorded: ${String(incidents)}`);
  console.log(`dismissals        : ${String(dismissals)}`);

  // A key that has already been promoted keeps its recurrence count on the stub line, so counting on
  // the count alone would report it as still owing a promotion for ever. `promoted.md` is the record
  // of what actually landed, so it — not the counter — decides what is still outstanding.
  // @es Una clave ya promocionada conserva su recuento en el muñón, así que contar solo por el número
  // la reportaría como pendiente para siempre. What landed is now read from the ledger itself: a `[promoted]`
  // line is the stub `promote` leaves (the full text is in the evidence store). `state/promoted.md`, which
  // `promote` no longer writes, is still READ, so a promotion recorded by the old tool keeps counting.
  // @es Lo que aterrizó se lee ahora del propio ledger: una línea `[promoted]` es el muñón que deja `promote`
  // (el texto completo está en el almacén de evidencia). `state/promoted.md`, que `promote` ya no escribe,
  // se sigue LEYENDO, para que una promoción registrada por la herramienta antigua siga contando.
  const promoted = readFileOr(PROMOTED, '');
  const stubbed = new Set(readLedgers(LEDGERS).flatMap((ledger) => (ledger.lines ?? []).filter((line) => line.startsWith('- [promoted] ')).map((line) => readMarker(line)?.key)));
  const due = [...keys].filter(([key, count]) => count >= PROMOTION_THRESHOLD && !stubbed.has(key) && !promoted.includes(` — ${key} -> `));

  if (due.length > 0) {
    console.log('');
    console.log('PROMOTION DUE (recurred, still only an incident):');
    for (const [key, count] of due) console.log(`  ${key} (${String(count)}x) -> ${promotionTarget(key)}`);
  }

  return 0;
}

/** The line that loads a project's ledger from its `.claude/CLAUDE.md`. @es La línea que carga el ledger del proyecto. */
const LEDGER_IMPORT = '@lessons-ledger.md';

/**
 * Gives the project this command runs in its own ledger: creates `.claude/lessons-ledger.md` with the
 * header (only when absent — an existing ledger is never rewritten) and appends the `@lessons-ledger.md`
 * import to the project's `.claude/CLAUDE.md` when no line already carries it. Idempotent, so running it
 * twice changes nothing; the ledger is created by this tool, never by hand.
 * @es Da al proyecto su propio ledger: crea `.claude/lessons-ledger.md` con encabezado (solo si falta) y
 * añade el import `@lessons-ledger.md` a su `.claude/CLAUDE.md` si ninguna línea lo lleva. Idempotente.
 */
function commandInit() {
  if (PROJECT === undefined) {
    console.error('init REFUSED — no project holds this directory (no .claude/CLAUDE.md above it).');

    return 1;
  }

  const created = !existsSync(PROJECT.ledgerFile);

  if (created) writeFileSync(PROJECT.ledgerFile, HEADER(PROJECT.scope, PROJECT_LOADER), 'utf8');

  const instructions = path.join(PROJECT.root, '.claude', 'CLAUDE.md');
  const text = readFileSync(instructions, 'utf8');
  const imported = text.split('\n').some((line) => line.trim() === LEDGER_IMPORT);

  if (!imported) {
    const section = [
      '',
      `## Lessons of this project (single source: \`.claude/lessons-ledger.md\`, written by failure-capture)`,
      '',
      '@es Lecciones de este proyecto (fuente única: `.claude/lessons-ledger.md`, la escribe failure-capture).',
      '',
      LEDGER_IMPORT,
      ''
    ].join('\n');

    appendFileSync(instructions, `${text.endsWith('\n') ? '' : '\n'}${section}`, 'utf8');
  }

  console.log(`project ${PROJECT.scope}: ledger ${created ? 'CREATED' : 'already present'} at ${PROJECT.ledgerFile}; import ${imported ? 'already present' : 'ADDED'} in ${instructions}`);

  return 0;
}

/**
 * Shortens the ledger lines that can be shortened without losing their text (`condense.mjs`): a dry run
 * unless `--write` is given, with an optional `--keys <file>` holding `{ "keys": [{ "line", "key" }] }` that
 * names the key of each marker-less line. Exit 0 clean, 1 a line was left unchanged, 2 the ledger is locked.
 * @es Acorta las líneas del ledger que pueden acortarse sin perder su texto: simulacro salvo con `--write`,
 * y `--keys <fichero>` opcional con la clave de cada línea sin marcador. Salida 0 limpia, 1 si quedó alguna
 * línea sin cambiar, 2 si el ledger está bloqueado.
 */
function commandCondense(args) {
  let keyMap = [];

  if (args.keys !== undefined) {
    try {
      keyMap = JSON.parse(readFileSync(String(args.keys), 'utf8')).keys;

      if (!Array.isArray(keyMap)) throw new TypeError('the file has no "keys" array');
    } catch (error) {
      console.error(`condense REFUSED — --keys needs a JSON file of the form {"keys":[{"line":"...","key":"..."}]} (${error instanceof Error ? error.message : String(error)}). @es condense RECHAZADO: --keys necesita un fichero JSON de la forma {"keys":[{"line":"...","key":"..."}]}.`);

      return 1;
    }
  }

  const outcome = runCondense({ load: () => readLedgers(LEDGERS).filter((ledger) => ledger.lines !== undefined), keyMap, write: args.write === true, date: today(), runId: newRunId(), lockFile: LOCK_FILE, preImageRoot: path.join(STATE_DIR, 'condense') });

  for (const line of describeOutcome(outcome)) console.log(line);

  return outcome.status;
}

const USAGE = `failure-capture — record a correction as a durable lesson.

  init                 give this project its own ledger and import it from .claude/CLAUDE.md
  keys                 list existing lesson keys (reuse one when it is the SAME lesson)
  capture   --key <kebab-key> --scope <global|<this project's scope>> --actor <orchestrator|worker:<type>>
            --lesson "<what went wrong -> root cause -> RULE ...>" [--session <id>]
            or --lesson "<what went wrong -> root cause>" --rule "<the rule, one sentence>" (tiered ledger line)
  dismiss   --reason "<why this is not a correction>" [--marker <m>] [--session <id>]
  promote   --key <kebab-key> (--mechanism <guard path> | --no-mechanism "<why none is possible>")
  condense  [--keys <file>] [--write]   shorten ledger lines whose text is kept in evidence (dry run without --write)
  status   counts, ledger token cost, and which lessons are due for promotion
`;

/**
 * The session a record belongs to: `--session` when given, else the harness's own session id.
 *
 * MEASURED 2026-09-30: a lesson recorded without `--session` was stamped `unknown`, and the turn guard,
 * which matches the stamp against its payload's `session_id`, reported "nothing recorded" for that very
 * turn. Claude Code exports `CLAUDE_CODE_SESSION_ID` to every shell it runs, and it equals the
 * `session_id` of the Stop/SubagentStop payload, so the stamp is taken from there rather than trusted to
 * a flag somebody has to remember.
 * @es La sesión de un registro: `--session` si viene, si no el id de sesión del propio harness. Medido el
 * 2026-09-30: una lección registrada sin `--session` quedó sellada como `unknown` y el guard de turno dijo
 * «nada registrado» en ese mismo turno. Claude Code exporta `CLAUDE_CODE_SESSION_ID` a cada shell, igual
 * al `session_id` del payload de Stop, así que el sello sale de ahí.
 */
function sessionOf(args) {
  if (typeof args.session === 'string') return args.session;

  const fromHarness = process.env.CLAUDE_CODE_SESSION_ID;

  return typeof fromHarness === 'string' && fromHarness.length > 0 ? fromHarness : undefined;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const parsed = parseArgs(rest);
  const args = { ...parsed, session: sessionOf(parsed) };

  switch (command) {
    case 'init':
      return commandInit();
    case 'keys':
      return commandKeys();
    case 'capture':
      return commandCapture(args);
    case 'dismiss':
      return commandDismiss(args);
    case 'promote':
      return commandPromote(args);
    case 'condense':
      return commandCondense(args);
    case 'status':
      return commandStatus();
    default:
      console.log(USAGE);

      return command === undefined || command === '--help' ? 0 : 1;
  }
}

process.exit(main());
