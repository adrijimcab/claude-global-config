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

import { closureRecord, MECHANISM_FLAG, NO_MECHANISM_FLAG, readClosure, verifyMechanism } from './closure.mjs';
import { adviseOnBudget } from './budget-advisory.mjs';
import { budgetVerdict } from './budget-verdict.mjs';
import { renderBudget, renderUnmeasured } from './budget-report.mjs';
import { describeOutcome, newRunId, runCondense } from './condense.mjs';
import { isValidKey, MARK_CLOSE, MARK_OPEN, readMarker } from './ledger-line.mjs';
import { loadedSet } from './loaded-set.mjs';
import { promotedStub } from './promotion.mjs';
import { describeSupersede, runSupersede } from './supersede.mjs';
import { isPromotedStub, promotedRecurrenceLines } from './promoted-recurrence.mjs';
import { GLOBAL_TARGET, PROJECT_TARGET, promotionFiles, promotionTargetOf } from './promotion-target.mjs';
import { PROMOTE_MESSAGES } from './promote-messages.mjs';
import { facesByFile, staleFiles } from './text-growth.mjs';
import { GLOBAL_LOADER, globalLedgerFile, HEADER, ledgerForScope, locateKey, PROJECT_LOADER, readLedgers, writeLedger } from './ledgers.mjs';
import { withLock } from './ledger-lock.mjs';
import { resolveLoopContext } from './loop-context.mjs';
import { GLOBAL_SCOPE, projectOf } from './project.mjs';
import { captureTextProblems, newLessonLine } from './tiered-capture.mjs';
import { CAPTURE_MESSAGES } from './capture-messages.mjs';
import { makeSpeaker } from '../bilingual-output/speaker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Everything this command prints goes through here, in the house bilingual form (`bilingual-output/speaker.mjs`). @es Todo lo que este comando imprime pasa por aquí, en la forma bilingüe de la casa. */
const speaker = makeSpeaker({ ...CAPTURE_MESSAGES, ...PROMOTE_MESSAGES });
// The PROJECT this command runs in (`project.mjs`), never the folder this code sits in: the loop is
// global since 2026-09-30, so `HERE/../..` would name the user's home, not a repository. It, and the five
// values derived from it below, are bound by `bindLoopContext` for the commands that read the project, never
// when this file loads: an invalid project configuration must fail only those commands.
// @es El PROYECTO donde corre el comando, nunca la carpeta del código: el bucle es global. Él y los cinco
// valores derivados de él, abajo, los fija `bindLoopContext` para los comandos que leen el proyecto, nunca al
// cargar este fichero: una configuración inválida debe fallar solo a esos comandos.
let PROJECT;
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
let LEDGERS;
// El contrato del ORQUESTADOR ya no está en CLAUDE.md: las reglas promovidas viven en un archivo de
// `~/.claude/rules/`, que Claude Code carga en todo proyecto y que `gentle-ai sync` no toca (sync
// reescribe las regiones gestionadas de CLAUDE.md). El destino conserva el nombre histórico
// `claude-md` en los registros de cierre para no romper `incidents.jsonl`.
const ORCHESTRATOR_RULES = path.join(homedir(), '.claude', 'rules', 'promoted-rules.md');
// The delegated-worker contract of THIS project: its configured files (`.claude/failure-capture.json`),
// or `.claude/CLAUDE.md`, which every subagent of the project loads. The first file is the one whose
// token count the text-growth check reads.
// @es El contrato de worker de ESTE proyecto: sus ficheros configurados, o `.claude/CLAUDE.md`.
let WORKER_CONTRACTS;
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
let PARITY_GATE;

/** The scopes a capture from here may declare. @es Los alcances que puede declarar una captura desde aquí. */
let SCOPES;

/** The commands that read the project: every one except `dismiss`, `budget` (which resolves its own) and the usage text. @es Los comandos que leen el proyecto: todos salvo `dismiss`, `budget` (que resuelve el suyo) y el texto de uso. */
const PROJECT_COMMANDS = new Set(['init', 'keys', 'capture', 'promote', 'condense', 'supersede', 'status']);

/** Resolves the project of the current directory and binds what derives from it. @es Resuelve el proyecto del directorio actual y fija lo que se deriva de él. */
function bindLoopContext() {
  ({ project: PROJECT, ledgers: LEDGERS, workerContracts: WORKER_CONTRACTS, parityGate: PARITY_GATE, scopes: SCOPES } = resolveLoopContext({ directory: process.cwd(), home: homedir() }));
}

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
    speaker.say('keys.none');

    return 0;
  }

  speaker.say('keys.header');

  for (const [key, count] of [...keys].sort()) {
    speaker.data(`  ${key}  (${String(count)}x)`);
  }

  return 0;
}

/**
 * Records a lesson, then advises when the always-loaded instruction set is over its ceiling. The advisory
 * runs only after the capture succeeded, outside the ledger lock the capture held, and never changes the
 * capture's exit status (spec R4.4).
 * @es Registra una lección y luego avisa si el conjunto de instrucciones siempre cargado supera su techo. El
 * aviso corre solo tras una captura exitosa, fuera del lock del ledger que la captura tomó, y nunca cambia el
 * estado de salida de la captura (spec R4.4).
 */
function commandCapture(args) {
  const status = recordCapture(args);

  if (status === 0) {
    adviseOnBudget({
      measure: () => measureLoadedSet({ project: PROJECT, directory: process.cwd(), ceiling: args.ceiling }).verdict,
      condense: () => describeOutcome(condenseLedgers({ keyMap: [], write: true })),
      print: (line) => speaker.data(line)
    });
  }

  return status;
}

function recordCapture(args) {
  const { key, scope, actor, lesson, rule, session } = args;
  const problems = [];

  if (!isValidKey(key)) problems.push(speaker.line('capture.problem.key'));
  if (!SCOPES.includes(scope)) problems.push(speaker.line(PROJECT === undefined ? 'capture.problem.scope.noProject' : 'capture.problem.scope', { allowed: SCOPES.map((one) => `"${one}"`).join(' / ') }));
  if (typeof actor !== 'string' || (actor !== 'orchestrator' && !actor.startsWith('worker'))) problems.push(speaker.line('capture.problem.actor'));
  if (typeof lesson !== 'string' || lesson.length < 40) problems.push(speaker.line('capture.problem.lessonShort'));
  if (rule === undefined && typeof lesson === 'string' && !lesson.includes('RULE')) problems.push(speaker.line('capture.problem.lessonRule'));

  problems.push(...captureTextProblems({ lesson, rule }));

  if (problems.length > 0) {
    speaker.complain('capture.refused');
    for (const problem of problems) speaker.dataError(`  - ${problem}`);

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
    speaker.say('capture.deferred', { count: deferred });

    return 0;
  }

  const mine = folded.find((f) => f.key === key);

  if (mine === undefined) {
    speaker.say('capture.spooled');

    return 0;
  }

  // The fallback reason is already bilingual (`tiered-capture.mjs`), so it is printed after its label as it is.
  // @es El motivo del respaldo ya es bilingüe (`tiered-capture.mjs`), así que se imprime tras su etiqueta tal cual.
  if (mine.fallback !== undefined) speaker.data(`NOTE — ${mine.fallback}`);

  if (mine.count < PROMOTION_THRESHOLD) {
    speaker.say('capture.new', { key });

    return 0;
  }

  const target = promotionTarget(key);
  const found = locateKey(readLedgers(LEDGERS), key, readMarker);

  // A rule that is already promoted is not promoted twice: the reader reads its text and extends it.
  // @es Una regla ya promovida no se promueve dos veces: se lee su texto y se extiende.
  if (isPromotedStub(found?.ledger.lines[found.index])) {
    for (const line of promotedRecurrenceLines({ key, count: mine.count, files: contractFilesOf(target) })) speaker.data(line);

    return 0;
  }

  speaker.say('capture.recurrence', { key, count: mine.count });
  speaker.blank();
  speaker.data(promotionInstructions(key, target));

  return 0;
}

/**
 * Where a repeated lesson must be promoted to: decided by the lesson's OWN scope (the scope of the ledger
 * that carries its line), never by who repeated it (`promotion-target.mjs`).
 * @es A dónde promociona una lección repetida: lo decide el alcance PROPIO de la lección (el del ledger
 * que lleva su línea), nunca quién la repitió.
 */
const promotionTarget = (key) => promotionTargetOf(locateKey(readLedgers(LEDGERS), key, readMarker)?.ledger.scope);

/**
 * The steps a recurring lesson owes before it closes. The LAST step is the one the stop-the-line
 * directive added: contract text records the rule, but only a mechanism — or a written reason none is
 * possible — closes the incident, so `promote` refuses without one (`closure.mjs`).
 * @es Los pasos que debe una lección recurrente antes de cerrarse. El ÚLTIMO lo añadió la directiva de
 * parar la línea: el texto de contrato registra la regla, pero sólo un mecanismo —o un motivo escrito de
 * por qué no cabe— cierra el incidente.
 */
function promotionInstructions(key, target) {
  const closeSteps = (number) => [
    speaker.line('instructions.close', { number }),
    `       node "${path.join(HERE, 'capture.mjs')}" promote --key ${key} ${MECHANISM_FLAG} <guard path>`,
    `       node "${path.join(HERE, 'capture.mjs')}" promote --key ${key} ${NO_MECHANISM_FLAG} "<reason>"`,
    speaker.line('instructions.close.note')
  ];

  if (target === GLOBAL_TARGET) return [speaker.line('instructions.global', { file: ORCHESTRATOR_RULES, key }), ...closeSteps(2), speaker.line('instructions.global.tail')].join('\n');


  const contractSteps = WORKER_CONTRACTS.map((file, at) => speaker.line('instructions.contract.step', { number: at + 1, file, key }));
  const paritySteps = PARITY_GATE === undefined ? [] : [speaker.line('instructions.contract.parity', { number: contractSteps.length + 1, key, gate: PARITY_GATE })];

  return [
    speaker.line(PARITY_GATE === undefined ? 'instructions.contract' : 'instructions.contract.gate', { scope: PROJECT.scope, count: WORKER_CONTRACTS.length }),
    ...(WORKER_CONTRACTS.length > 1 ? [speaker.line('instructions.contract.many')] : []),
    ...contractSteps,
    ...paritySteps,
    ...closeSteps(contractSteps.length + paritySteps.length + 1),
    speaker.line(PARITY_GATE === undefined ? 'instructions.contract.tail' : 'instructions.contract.tail.gate')
  ].join('\n');
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

/** Every file whose text carries a promotion of `target`. @es Cada fichero cuyo texto lleva una promoción de `target`. */
const contractFilesOf = (target) => promotionFiles({ target, globalRules: ORCHESTRATOR_RULES, workerContracts: WORKER_CONTRACTS });

/**
 * The refusal text when a lesson recurred and some promoted file has not grown a face (`text-growth.mjs`),
 * or `undefined` when every file grew or nothing recurred.
 * @es El texto de la negativa cuando la lección reincidió y algún fichero promovido no ha ganado una cara.
 */
function textGrowthProblem(key, target) {
  const stale = staleFiles({ entries: incidentsFor(key), files: contractFilesOf(target), key, read: (file) => readFileOr(file, '') });

  if (stale.length === 0) return undefined;

  return [...stale.map(({ file, now, then, date }) => speaker.line('growth.file', { key, date, file, now, then })), speaker.line('growth.advice')].join('\n');
}

/**
 * What a promotion actually verified, and nothing more: claiming "parity gate green" where no gate ran
 * would be this tool committing the defect it exists to catch.
 * @es Lo que una promoción verificó de verdad, y nada más.
 */
function proofMessage(target) {
  if (target !== PROJECT_TARGET) return ['promote.proof.token', {}];

  return [PARITY_GATE === undefined ? 'promote.proof.contracts' : 'promote.proof.contractsGate', { count: WORKER_CONTRACTS.length }];
}

function commandPromote(args) {
  const { key } = args;

  if (!isValidKey(key)) {
    speaker.complain('promote.keyInvalid');

    return 1;
  }

  const keys = ledgerKeys();

  if (!keys.has(key)) {
    speaker.complain('promote.notALesson', { key });

    return 1;
  }

  // The closure is read FIRST and cheaply: a promotion that names neither a mechanism nor a reason is
  // refused before anything is checked or run, with both ways to close it named (`closure.mjs`).
  // @es El cierre se lee PRIMERO y barato: sin mecanismo ni motivo se rechaza antes de comprobar nada.
  const closure = readClosure(args);

  if (closure.kind === 'refused') {
    speaker.complain('promote.noClosure');
    for (const problem of closure.problems) speaker.dataError(`  ${problem}`);

    return 1;
  }

  const target = promotionTarget(key);
  const missing = [];

  if (target === GLOBAL_TARGET) {
    if (!readFileOr(ORCHESTRATOR_RULES, '').includes(key)) missing.push(speaker.line('promote.missing.token', { key, file: ORCHESTRATOR_RULES }));
  } else {
    for (const file of WORKER_CONTRACTS) if (!readFileOr(file, '').includes(key)) missing.push(speaker.line('promote.missing.token', { key, file }));
    if (PARITY_GATE !== undefined && !readFileOr(PARITY_GATE, '').includes(`'${key}'`)) missing.push(speaker.line('promote.missing.anchor', { key, gate: PARITY_GATE }));
  }

  if (missing.length > 0) {
    speaker.complain('promote.notLanded');
    for (const problem of missing) speaker.dataError(problem);
    speaker.dataError('');
    speaker.dataError(promotionInstructions(key, target));

    return 1;
  }

  const stale = textGrowthProblem(key, target);

  if (stale !== undefined) {
    speaker.complain('promote.alreadyPromoted');
    speaker.dataError(stale);

    return 1;
  }

  if (target === PROJECT_TARGET && PARITY_GATE !== undefined) {
    try {
      execFileSync(process.execPath, [PARITY_GATE], { cwd: PROJECT.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      speaker.complain('promote.parityRed');
      speaker.dataError(String(error.stdout ?? '') + String(error.stderr ?? ''));

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
      speaker.complain('promote.mechanismFailed');
      speaker.dataError(`  - ${verification.problem}`);

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
  const where = target === GLOBAL_TARGET ? '~/.claude/rules/promoted-rules.md' : `the delegated-worker contract (${WORKER_CONTRACTS.length > 1 ? `all ${String(WORKER_CONTRACTS.length)} files` : 'its file'})`;
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
    appendFileSync(INCIDENTS, `${JSON.stringify(closureRecord({ key, closure, verification, target, scope: ledger.scope, faces: facesByFile({ files: contractFilesOf(target), key, read: (file) => readFileOr(file, '') }) }))}\n`, 'utf8');

    return stub;
  });

  if (!collapsed.held) {
    speaker.complain('promote.locked');

    return 1;
  }

  if (collapsed.value?.ok !== true) {
    if (collapsed.value?.problem === undefined) speaker.complain('promote.lessonGone');
    else speaker.dataError(`promote REFUSED — ${collapsed.value.problem}`);

    return 1;
  }

  // Report only what was actually checked. Claiming "parity gate green" on the CLAUDE.md path, where
  // the parity gate is never run, would be this tool committing the exact defect it exists to catch.
  // @es Reportar solo lo comprobado: decir "parity gate verde" en el camino de CLAUDE.md, donde el
  // gate ni se ejecuta, sería esta herramienta cometiendo el fallo que existe para cazar.
  

  speaker.say('promote.done', { key });
  speaker.say(target === GLOBAL_TARGET ? 'promote.landed.global' : 'promote.landed.contract', { count: WORKER_CONTRACTS.length, files: contractFilesOf(target).join(', ') });
  speaker.say(...proofMessage(target));
  speaker.say(closure.kind === 'mechanism' ? 'promote.closed.mechanism' : 'promote.closed.reason', closure.kind === 'mechanism' ? { path: closure.path } : { reason: closure.reason });
  speaker.say('promote.stub');

  return 0;
}

function commandDismiss(args) {
  const { marker, reason, session } = args;

  if (typeof reason !== 'string' || reason.length < 25) {
    speaker.complain('dismiss.refused');

    return 1;
  }

  ensureDirs();
  appendFileSync(DISMISSALS, `${JSON.stringify({ marker: marker ?? 'unknown', reason, session: session ?? 'unknown', at: new Date().toISOString() })}\n`, 'utf8');
  stamp(session, 'dismiss');
  speaker.say('dismiss.done');

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

    speaker.say('status.ledger', { scope: ledger.scope, file: ledger.file, bytes, tokens: Math.round(bytes / 4) });
  }
  speaker.say('status.keyed', { count: keys.size });
  speaker.say('status.incidents', { count: incidents });
  speaker.say('status.dismissals', { count: dismissals });

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
    speaker.blank();
    speaker.say('status.due');
    for (const [key, count] of due) speaker.data(`  ${key} (${String(count)}x) -> ${promotionTarget(key)}`);
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
    speaker.complain('init.noProject');

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

  speaker.say(created ? 'init.ledger.created' : 'init.ledger.present', { scope: PROJECT.scope, file: PROJECT.ledgerFile });
  speaker.say(imported ? 'init.import.present' : 'init.import.added', { scope: PROJECT.scope, file: instructions });

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
/** The ledgers of this project that exist, read afresh: what a command that rewrites a ledger line loads under the ledger lock. @es Los ledgers de este proyecto que existen, leídos de nuevo: lo que carga bajo el lock un comando que reescribe una línea del ledger. */
const loadLedgers = () => readLedgers(LEDGERS).filter((ledger) => ledger.lines !== undefined);

/** Runs the condense over this project's ledgers, reading them under the ledger lock. @es Ejecuta el condense sobre los ledgers de este proyecto, leyéndolos bajo el lock del ledger. */
const condenseLedgers = ({ keyMap, write }) => runCondense({ load: loadLedgers, keyMap, write, date: today(), runId: newRunId(), lockFile: LOCK_FILE, preImageRoot: path.join(STATE_DIR, 'condense') });

function commandCondense(args) {
  let keyMap = [];

  if (args.keys !== undefined) {
    try {
      keyMap = JSON.parse(readFileSync(String(args.keys), 'utf8')).keys;

      if (!Array.isArray(keyMap)) throw new TypeError('the file has no "keys" array');
    } catch (error) {
      speaker.complain('condense.keysInvalid', { detail: error instanceof Error ? error.message : String(error) });

      return 1;
    }
  }

  const outcome = condenseLedgers({ keyMap, write: args.write === true });

  for (const line of describeOutcome(outcome)) speaker.data(line);

  return outcome.status;
}

/**
 * Replaces the rule a ledger line states with the current one (`supersede.mjs`): `--key` names the lesson, `--rule`
 * is the rule that now holds and `--by` says where the directive that superseded the old one is written. The
 * old line is archived whole to the evidence store first. Exit 0 done (or already so), 1 refused, 2 the ledger
 * is locked.
 * @es Sustituye la regla que enuncia una línea del ledger por la vigente: `--key` nombra la lección, `--rule`
 * es la regla que rige ahora y `--by` dice dónde está escrita la directiva que sustituyó a la vieja. La línea
 * vieja se archiva entera en la evidencia primero. Salida 0 hecho (o ya estaba), 1 rechazado, 2 ledger bloqueado.
 */
function commandSupersede(args) {
  ensureDirs();

  const outcome = runSupersede({ load: loadLedgers, key: args.key, rule: args.rule, by: args.by, date: today(), lockFile: LOCK_FILE });

  for (const line of describeSupersede(outcome)) (outcome.status === 0 ? speaker.data : speaker.dataError)(line);

  return outcome.status;
}

/**
 * The loaded instruction set of a project (or of `directory` when no project holds it) and its verdict,
 * shared by the `budget` command and the advisory after a capture. `ceiling` is the highest directory walked.
 * @es El conjunto de instrucciones cargado de un proyecto (o de `directory` si ningún proyecto lo contiene) y
 * su veredicto, compartido por el comando `budget` y el aviso tras una captura. `ceiling` es el directorio más alto que se recorre.
 */
function measureLoadedSet({ project, directory, ceiling }) {
  const loaded = loadedSet({ home: homedir(), projectRoot: project?.root ?? directory, ceiling: typeof ceiling === 'string' ? path.resolve(ceiling) : undefined });

  return { loaded, verdict: budgetVerdict({ loaded, projectCeiling: project?.loadedSetCeiling }) };
}

/**
 * Measures the instruction set Claude Code loads for a project and prints its verdict against the ceiling.
 * `--project <dir>` names the project (default: the current directory); `--ceiling <dir>` is the highest
 * directory walked for ancestor instruction files (default: the filesystem root, as the harness does), which
 * lets a fixture stay out of the real home. Exit 0 within, 1 over, 2 when the set cannot be measured or the
 * project configuration is invalid.
 * @es Mide el conjunto de instrucciones que Claude Code carga para un proyecto e imprime su veredicto frente
 * al techo. `--project <dir>` nombra el proyecto (por omisión, el directorio actual); `--ceiling <dir>` es el
 * directorio más alto que se recorre buscando ficheros de instrucciones de ancestros (por omisión, la raíz
 * del sistema de ficheros, como el harness), para que un fixture no toque el home real. Salida 0 dentro, 1
 * sobre el techo, 2 si no se puede medir o la configuración del proyecto es inválida.
 */
function commandBudget(args) {
  const directory = typeof args.project === 'string' ? path.resolve(args.project) : process.cwd();

  try {
    if (!existsSync(directory)) throw new Error(`${directory} does not exist. @es ${directory} no existe.`);

    const { loaded, verdict } = measureLoadedSet({ project: projectOf(directory), directory, ceiling: args.ceiling });

    for (const line of renderBudget({ verdict, missing: loaded.missing })) speaker.data(line);

    return verdict.status === 'within' ? 0 : 1;
  } catch (error) {
    speaker.dataError(renderUnmeasured(error instanceof Error ? error.message : String(error)));

    return 2;
  }
}

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

  if (PROJECT_COMMANDS.has(command)) {
    try {
      bindLoopContext();
    } catch (error) {
      const defect = error instanceof Error ? error.message : String(error);

      speaker.complain('project.configUnreadable', { command, defect });

      return 2;
    }
  }

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
    case 'supersede':
      return commandSupersede(args);
    case 'budget':
      return commandBudget(args);
    case 'status':
      return commandStatus();
    default:
      speaker.say('usage');

      return command === undefined || command === '--help' ? 0 : 1;
  }
}

process.exit(main());
