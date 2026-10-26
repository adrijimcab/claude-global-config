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

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordAuthoredWrites } from '../config-sync-guard/authored-writes.mjs';
import { changedBetween, snapshotMtimes } from '../config-sync-guard/touched-paths.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { closureRecord, MECHANISM_FLAG, NO_MECHANISM_FLAG, NO_MECHANISM_REASON_FORM, readClosure, verifyMechanism } from './closure.mjs';
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
import { promotionParity } from './promote-parity.mjs';
import { facesByFile, staleFiles } from './text-growth.mjs';
import { HEADER, homeLedgerFiles, ledgerBytes, ledgerForScope, locateKey, PROJECT_LOADER, projectAreaLedgerFiles, readLedgers, replaceFile, restoreLedgerBytes, writeLedger } from './ledgers.mjs';
import { commitHeaderRoutes, commitRoute, locateLesson, planHeaderRoute, planLessonRoute, planStubRoute, routeOutcome } from './ledger-route.mjs';
import { placeStub } from './stub-placement.mjs';
import { PROMOTED_SCOPE, areaRulesFile, areaRulesHeader, areaScopes, isAreaScope, onDemandRulesFiles, stubScopeOf } from './ledger-routes.mjs';
import { commitBlockRoute, findBlock, planBlockRoute } from './rule-block.mjs';
import { withLock } from './ledger-lock.mjs';
import { stampFile, writeJson } from './session-state.mjs';
import { resolveLoopContext } from './loop-context.mjs';
import { GLOBAL_SCOPE, areasOfLedger, projectOf } from './project.mjs';
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
/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('failure-capture');
const spoolDir = () => path.join(stateDirectory(), 'spool');
const lockFile = () => path.join(stateDirectory(), 'ledger.lock');
const incidentsFile = () => path.join(stateDirectory(), 'incidents.jsonl');
const dismissalsFile = () => path.join(stateDirectory(), 'dismissals.jsonl');
// Read-only since `ledger-tiering-budget`: the record of promotions made by the OLD tool (`status` honours it).
// @es Solo lectura desde `ledger-tiering-budget`: el registro de promociones de la herramienta ANTIGUA.
const promotedFile = () => path.join(stateDirectory(), 'promoted.md');

// One ledger per scope (`ledgers.mjs`): a project's lessons never travel to every other project.
// @es Un ledger por alcance: las lecciones de un proyecto no viajan a los demás.
let LEDGERS;
// El contrato del ORQUESTADOR ya no está en CLAUDE.md: las reglas promovidas viven en un archivo de
// `~/.claude/rules/`, que Claude Code carga en todo proyecto y que `gentle-ai sync` no toca (sync
// reescribe las regiones gestionadas de CLAUDE.md). El destino conserva el nombre histórico
// `claude-md` en los registros de cierre para no romper `incidents.jsonl`.
const ORCHESTRATOR_RULES = path.join(homedir(), '.claude', 'rules', 'promoted-rules.md');

/**
 * Every file that can hold the rule text of a promoted key: the global rules file, the rules file of each area, and the
 * on-demand files the global one names.
 * @es Cada fichero que puede guardar el texto de regla de una clave promovida: el global, el de cada área y los ficheros bajo demanda que el global nombra.
 */
const rulesFamily = () => [ORCHESTRATOR_RULES, ...areaScopes().map((area) => areaRulesFile(homedir(), area)), ...onDemandRulesFiles(homedir())];
// The delegated-worker contract of THIS project: its configured files (`.claude/failure-capture.json`),
// or `.claude/CLAUDE.md`, which every subagent of the project loads. The first file is the one whose
// token count the text-growth check reads.
// @es El contrato de worker de ESTE proyecto: sus ficheros configurados, o `.claude/CLAUDE.md`.
let WORKER_CONTRACTS;
/**
 * The contract parity of the project a promotion into `target` would write into, read from the shared
 * engine (`promote-parity.mjs`); a global promotion has none. The per-project `parityGate` script is gone:
 * a project declares its anchors in `.claude/agent-contract/anchors.json`.
 * @es La paridad de contrato del proyecto en que escribiría una promoción a `target`, leída del motor
 * compartido; una promoción global no tiene. El script `parityGate` por proyecto ya no existe: el proyecto
 * declara sus anchors en `.claude/agent-contract/anchors.json`.
 */
function parityOf(target) {
  return target === PROJECT_TARGET ? promotionParity(PROJECT.root) : { declared: false, absentSides: [] };
}

/** The scopes a capture from here may declare. @es Los alcances que puede declarar una captura desde aquí. */
let SCOPES;

/** The commands that read the project: every one except `dismiss`, `budget` (which resolves its own) and the usage text. @es Los comandos que leen el proyecto: todos salvo `dismiss`, `budget` (que resuelve el suyo) y el texto de uso. */
const PROJECT_COMMANDS = new Set(['init', 'keys', 'capture', 'promote', 'condense', 'supersede', 'status', 'route']);

/** Resolves the project of the current directory and binds what derives from it. @es Resuelve el proyecto del directorio actual y fija lo que se deriva de él. */
function bindLoopContext() {
  ({ project: PROJECT, ledgers: LEDGERS, workerContracts: WORKER_CONTRACTS, scopes: SCOPES } = resolveLoopContext({ directory: process.cwd(), home: homedir() }));
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
  mkdirSync(spoolDir(), { recursive: true });
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
  const temp = path.join(spoolDir(), `.${name}.tmp`);
  const final = path.join(spoolDir(), name);

  writeFileSync(temp, JSON.stringify(entry), 'utf8');
  renameSync(temp, final);

  return final;
}

/**
 * Leaves a spooled entry in the spool with the reason it was deferred recorded in it (`deferred: { reason, at }`),
 * written atomically like a new entry. The record is rewritten only when its reason changes, so an entry that waits
 * through many reconciles keeps the time it was first deferred for that reason.
 * @es Deja una entrada en el spool con el motivo por el que se difirió anotado en ella, escrita atómicamente como una
 * entrada nueva. Se reescribe solo si cambia el motivo, así una entrada que espera muchas reconciliaciones conserva
 * la hora en que se difirió por primera vez por ese motivo.
 */
function deferEntry(full, entry, deferred) {
  const reason = `no ledger holds the scope "${entry.scope}" any more (the project no longer declares that area), so this capture stays in the spool until the scope is declared again. @es ningún ledger tiene ya el alcance "${entry.scope}" (el proyecto ya no declara esa área), así que esta captura se queda en el spool hasta que el alcance se declare de nuevo.`;

  if (deferred?.reason !== reason) {
    const temp = path.join(spoolDir(), `.${path.basename(full)}.tmp`);

    writeFileSync(temp, JSON.stringify({ ...entry, deferred: { reason, at: new Date().toISOString() } }), 'utf8');
    renameSync(temp, full);
  }

  return reason;
}

/**
 * The ledgers each spooled entry can see — the home's (the loaded one and the unloaded stubs) and the one of the project it was captured in —
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
    const home = Object.entries(homeLedgerFiles(homedir())).map(([scope, { file, header }]) => load(scope, file, header));
    const project = entry.project ?? (PROJECT !== undefined && entry.scope === PROJECT.scope ? { scope: PROJECT.scope, ledgerFile: PROJECT.ledgerFile } : undefined);

    if (project === undefined) return Object.hasOwn(homeLedgerFiles(homedir()), entry.scope) ? home : undefined;

    // The project's own area ledgers are part of its ledgers: a key that was routed into one is still found there,
    // so a recurrence folds in where the lesson is. A project whose config cannot be read is left for its own turn.
    // @es Los ledgers de área del propio proyecto son parte de sus ledgers: una clave enrutada a uno se encuentra allí
    // y la recurrencia se suma donde está la lección. Un proyecto con config ilegible se deja para su propio turno.
    const areas = areasOfLedger(project.ledgerFile);

    if (areas === undefined) return undefined;

    const areaLedgers = Object.entries(projectAreaLedgerFiles({ root: path.dirname(path.dirname(project.ledgerFile)), areas })).map(([scope, { file, header }]) => load(scope, file, header));

    return [...home, load(project.scope, project.ledgerFile, HEADER(project.scope, PROJECT_LOADER)), ...areaLedgers];
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

  const pending = readdirSync(spoolDir()).filter((f) => f.endsWith('.json') && !f.startsWith('.'));

  if (pending.length === 0) return { folded: [], deferred: 0, left: [] };

  const outcome = withLock(lockFile(), () => {
    const folded = [];
    const left = [];
    const ledgersOf = ledgerCache();
    const touched = new Set();
    const consumed = [];

    for (const file of pending.sort()) {
      const full = path.join(spoolDir(), file);
      let spooled;

      try {
        spooled = JSON.parse(readFileSync(full, 'utf8'));
      } catch {
        continue; // a corrupt spool file is left in place for a human, never silently dropped
      }

      // The reason an earlier reconcile recorded for leaving the entry is not part of the capture.
      // @es El motivo que una reconciliación anterior anotó al dejar la entrada no es parte de la captura.
      const { deferred, ...entry } = spooled;

      const ledgers = ledgersOf(entry);

      // An entry spooled from a project that is not the one reconciling, with no ledger recorded (written
      // before the loop went global), is left in the spool for a capture from its own project.
      // @es Una entrada de otro proyecto sin ledger registrado se deja en el spool para su propio proyecto.
      if (ledgers === undefined) continue;

      // A key already present folds in WHERE it is, whatever scope this capture declares.
      // @es Una clave ya presente se suma DONDE está, sea cual sea el alcance de esta captura.
      const found = locateKey(ledgers, entry.key, readMarker);

      // A new lesson whose scope has no ledger any more (a project area dropped from the declaration after the
      // capture was spooled) is DEFERRED, never a throw: a throw here would fail every later reconcile and wedge the
      // spool. The entry stays, with the reason recorded in it, until its scope is declared again.
      // @es Una lección nueva cuyo alcance ya no tiene ledger (un área de proyecto quitada de la declaración después
      // de entrar la captura en el spool) se DIFIERE, nunca lanza: lanzar aquí haría fallar toda reconciliación
      // posterior y atascaría el spool. La entrada se queda, con el motivo anotado, hasta que su alcance se declare de nuevo.
      if (found === undefined && !ledgers.some((ledger) => ledger.scope === entry.scope)) {
        left.push({ key: entry.key, reason: deferEntry(full, entry, deferred) });
        continue;
      }

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

      consumed.push({ full, entry });
    }

    // The ledgers go to disk FIRST. A spool entry is removed, and its incident logged, only once every
    // ledger it touched is written: a crash or a failed write in between leaves the entry in the spool for
    // the next capture to fold, where the reverse order would lose the lesson. The cost is stated: a crash
    // after the ledgers and before the unlink folds an entry twice (a recurrence), never zero times.
    // @es Los ledgers van PRIMERO a disco. Una entrada del spool se borra, y su incidente se registra, solo
    // con cada ledger que tocó ya escrito: una caída o una escritura fallida entre medias deja la entrada en
    // el spool para que la siguiente captura la pliegue; el orden inverso perdería la lección. Coste: una
    // caída tras los ledgers y antes del borrado pliega una entrada dos veces (una recurrencia), nunca cero.
    for (const ledger of touched) writeLedger(ledger);

    for (const { full, entry } of consumed) {
      appendFileSync(incidentsFile(), `${JSON.stringify(entry)}\n`, 'utf8');
      unlinkSync(full);
    }

    return { folded, left };
  });

  return outcome.held ? { folded: outcome.value.folded, deferred: 0, left: outcome.value.left } : { folded: [], deferred: pending.length, left: [] };
}

/**
 * Stamps that this session recorded something, so the turn guard can see it deterministically. The stamp is the
 * session's own file: another session's stamp never overwrites it.
 * @es Sella que esta sesión registró algo, para que el guard lo vea de forma determinista. El sello es el fichero
 * propio de la sesión: el sello de otra sesión nunca lo pisa.
 */
function stamp(sessionId, kind) {
  const session = sessionId ?? 'unknown';

  writeJson(stampFile(stateDirectory(), session), { session, kind, at: Date.now() });
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
      // A capture into a project's scope tidies that scope's ledger only, never the global one; a global capture
      // tidies every ledger, as it always did. @es Una captura al alcance de un proyecto ordena solo el ledger de
      // ese alcance, nunca el global; una captura global ordena todos los ledgers, como siempre.
      condense: () => describeOutcome(condenseLedgers({ keyMap: [], write: true, scope: args.scope === GLOBAL_SCOPE ? undefined : args.scope })),
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

  const { folded, deferred, left } = reconcile();

  stamp(session, 'capture');

  // A spooled capture that could not be folded (its scope has no ledger any more) is said, never kept silent.
  // @es Una captura del spool que no se pudo plegar (su alcance ya no tiene ledger) se dice, nunca se calla.
  if (left.length > 0) {
    speaker.say('capture.left', { count: left.length });
    for (const one of left) speaker.data(`  ${one.key}: ${one.reason}`);
  }

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
    for (const line of promotedRecurrenceLines({ key, count: mine.count, files: contractFilesOf(target, key) })) speaker.data(line);

    return 0;
  }

  speaker.say('capture.recurrence', { key, count: mine.count });
  speaker.blank();
  speaker.data(promotionInstructions(key, target));

  return 0;
}

/**
 * The rules files the text of a global-family lesson lives in: its area's file when the lesson is an area's (its
 * text is path-scoped with it); otherwise the files of the family that already carry its key (an area lesson that
 * was promoted keeps its text in its area, and its stub no longer says which); otherwise the global one.
 * @es Los ficheros de reglas donde vive el texto de una lección de la familia global: el de su área si la
 * lección es de un área; si no, los ficheros de la familia que ya llevan su clave (una lección de área promovida
 * conserva su texto en su área, y su muñón ya no lo dice); si no, el global.
 */
function globalRulesOf(key) {
  const found = locateKey(readLedgers(LEDGERS), key, readMarker);

  if (isAreaScope(found?.ledger.scope)) return [areaRulesFile(homedir(), found.ledger.scope)];

  const holding = rulesFamily().filter((file) => readFileOr(file, '').includes(key));

  return holding.length > 0 ? holding : [ORCHESTRATOR_RULES];
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
    `       node "${path.join(HERE, 'capture.mjs')}" promote --key ${key} ${NO_MECHANISM_FLAG} ${NO_MECHANISM_REASON_FORM}`,
    speaker.line('instructions.close.note')
  ];

  if (target === GLOBAL_TARGET) return [speaker.line('instructions.global', { file: globalRulesOf(key)[0], key }), ...closeSteps(2), speaker.line('instructions.global.tail')].join('\n');


  const contractSteps = WORKER_CONTRACTS.map((file, at) => speaker.line('instructions.contract.step', { number: at + 1, file, key }));
  const parity = parityOf(target);
  const paritySteps = parity.declared ? [speaker.line('instructions.contract.parity', { number: contractSteps.length + 1, key, file: parity.file })] : [];

  return [
    speaker.line(parity.declared ? 'instructions.contract.gate' : 'instructions.contract', { scope: PROJECT.scope, count: WORKER_CONTRACTS.length }),
    ...(WORKER_CONTRACTS.length > 1 ? [speaker.line('instructions.contract.many')] : []),
    ...contractSteps,
    ...paritySteps,
    ...closeSteps(contractSteps.length + paritySteps.length + 1),
    speaker.line(parity.declared ? 'instructions.contract.tail.gate' : 'instructions.contract.tail')
  ].join('\n');
}

/** Every incident line for `key`, parsed, oldest first. @es Todas las líneas de incidente de `key`. */
function incidentsFor(key) {
  const found = [];

  for (const line of readFileOr(incidentsFile(), '').split('\n')) {
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

/** Every file whose text carries the promotion of `key` into `target`. @es Cada fichero cuyo texto lleva la promoción de `key` en `target`. */
const contractFilesOf = (target, key) => promotionFiles({ target, globalRules: target === GLOBAL_TARGET ? globalRulesOf(key) : undefined, workerContracts: WORKER_CONTRACTS });

/**
 * The refusal text when a lesson recurred and some promoted file has not grown a face (`text-growth.mjs`),
 * or `undefined` when every file grew or nothing recurred.
 * @es El texto de la negativa cuando la lección reincidió y algún fichero promovido no ha ganado una cara.
 */
function textGrowthProblem(key, target) {
  const stale = staleFiles({ entries: incidentsFor(key), files: contractFilesOf(target, key), key, read: (file) => readFileOr(file, '') });

  if (stale.length === 0) return undefined;

  return [...stale.map(({ file, now, then, date }) => speaker.line('growth.file', { key, date, file, now, then })), speaker.line('growth.advice')].join('\n');
}

/**
 * What a promotion actually verified, and nothing more: claiming parity where none was measured
 * would be this tool committing the defect it exists to catch.
 * @es Lo que una promoción verificó de verdad, y nada más.
 */
function proofMessage(target) {
  if (target !== PROJECT_TARGET) return ['promote.proof.token', {}];

  return [parityOf(target).declared ? 'promote.proof.contractsGate' : 'promote.proof.contracts', { count: WORKER_CONTRACTS.length }];
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
    for (const file of contractFilesOf(target, key)) if (!readFileOr(file, '').includes(key)) missing.push(speaker.line('promote.missing.token', { key, file }));
  } else {
    for (const file of WORKER_CONTRACTS) if (!readFileOr(file, '').includes(key)) missing.push(speaker.line('promote.missing.token', { key, file }));
    const { anchors, file } = parityOf(target);

    if (anchors !== undefined && !anchors.includes(key)) missing.push(speaker.line('promote.missing.anchor', { key, file }));
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

  const parity = parityOf(target);

  if (parity.refusal !== undefined) {
    speaker.complain('promote.parityRed');
    speaker.dataError(parity.refusal);

    return 1;
  }

  if (parity.absentSides.length > 0) {
    speaker.complain('promote.paritySkipped', { sides: parity.absentSides.join(', '), file: parity.file });

    return 1;
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
  const where = target === GLOBAL_TARGET ? contractFilesOf(target, key).map((file) => `~/${path.relative(homedir(), file).split(path.sep).join('/')}`).join(', ') : `the delegated-worker contract (${WORKER_CONTRACTS.length > 1 ? `all ${String(WORKER_CONTRACTS.length)} files` : 'its file'})`;
  // The ledger is read only once the lock is held: a copy read before it would be written back over any
  // line another writer added while this one waited, and would carry an out-of-date recurrence counter.
  // @es El ledger se lee solo con el lock ya tomado: una copia leída antes se reescribiría encima de las
  // líneas que otro escritor añadiera mientras este esperaba, y llevaría un contador de recurrencia viejo.
  const collapsed = withLock(lockFile(), () => {
    const ledgers = readLedgers(LEDGERS);
    const found = locateKey(ledgers, key, readMarker);

    if (found === undefined) return;

    const { ledger, index } = found;
    const stub = promotedStub({ ledgerFile: ledger.file, original: ledger.lines[index], date: today(), closure, where });

    if (!stub.ok) return stub;

    // The stub goes where its scope's stubs live (`ledger-routes.mjs`): a global lesson's, to the file the
    // harness does not load; a project's, to its own ledger, in place. The stub is written first, so a crash
    // between the two writes leaves the key twice (which `route` refuses to make worse) and never none.
    // @es El muñón va donde viven los de su alcance: el de una lección global, al fichero que el harness no
    // carga; el de un proyecto, a su propio ledger, en su sitio. Se escribe primero el muñón: una caída entre
    // las dos escrituras deja la clave dos veces y nunca ninguna.
    const home = ledgerForScope(ledgers, stubScopeOf(ledger.scope));

    if (home === ledger) {
      ledger.lines[index] = stub.line;
    } else {
      placeStub(home, key, stub.line, readMarker);
      writeLedger(home);
      ledger.lines.splice(index, 1);
    }

    writeLedger(ledger);
    appendFileSync(incidentsFile(), `${JSON.stringify(closureRecord({ key, closure, verification, target, scope: ledger.scope, faces: facesByFile({ files: contractFilesOf(target, key), key, read: (file) => readFileOr(file, '') }) }))}\n`, 'utf8');

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
  speaker.say(target === GLOBAL_TARGET ? 'promote.landed.global' : 'promote.landed.contract', { count: WORKER_CONTRACTS.length, files: contractFilesOf(target, key).join(', ') });
  speaker.say(...proofMessage(target));
  if (closure.kind === 'mechanism') {
    speaker.say('promote.closed.mechanism', { path: closure.path });
  } else {
    speaker.say('promote.closed.reason');
    speaker.data(`  ${closure.reason}`);
  }

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
  appendFileSync(dismissalsFile(), `${JSON.stringify({ marker: marker ?? 'unknown', reason, session: session ?? 'unknown', at: new Date().toISOString() })}\n`, 'utf8');
  stamp(session, 'dismiss');
  speaker.say('dismiss.done');

  return 0;
}

function commandStatus() {
  const keys = ledgerKeys();
  // The incident log also carries `promotion` closure records; they are not incidents and are not counted as such.
  // @es El registro de incidentes también lleva registros de cierre `promotion`; no son incidentes y no se cuentan.
  const incidents = readFileOr(incidentsFile(), '').split('\n').filter((l) => l.length > 0 && !l.includes('"kind":"promotion"')).length;
  const dismissals = readFileOr(dismissalsFile(), '').split('\n').filter((l) => l.length > 0).length;
  for (const ledger of readLedgers(LEDGERS)) {
    const bytes = ledger.lines === undefined ? 0 : Buffer.byteLength(ledger.lines.join('\n'));

    speaker.say(ledger.scope === PROMOTED_SCOPE ? 'status.ledger.unloaded' : 'status.ledger', { scope: ledger.scope, file: ledger.file, bytes, tokens: Math.round(bytes / 4) });
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
  const promoted = readFileOr(promotedFile(), '');
  const stubbed = new Set(readLedgers(LEDGERS).flatMap((ledger) => (ledger.lines ?? []).filter((line) => line.startsWith('- [promoted] ')).map((line) => readMarker(line)?.key)));
  const due = [...keys].filter(([key, count]) => count >= PROMOTION_THRESHOLD && !stubbed.has(key) && !promoted.includes(` — ${key} -> `));

  if (due.length > 0) {
    speaker.blank();
    speaker.say('status.due');
    for (const [key, count] of due) speaker.data(`  ${key} (${String(count)}x) -> ${promotionTarget(key)}`);
  }

  return 0;
}

/**
 * What routing moves LINES between two ledgers would do: a route object the command can show, or `{ problems }` when
 * the plan refuses, or `{ nothing: true }`. `commit` writes, re-reads and proves it (`ledger-route.mjs`).
 * @es Lo que haría un enrutamiento que mueve LÍNEAS entre dos ledgers: un objeto de ruta que el comando puede mostrar, `{ problems }` si el plan rechaza, o `{ nothing: true }`.
 */
function linesRoute({ source, destination, plan }) {
  if (!plan.ok) return { problems: plan.problems };
  if (plan.moved.length === 0) return { nothing: true };

  const before = { source: source.lines ?? [], destination: destination.lines };
  const io = {
    writeSource: (lines) => {
      source.lines = lines;
      writeLedger(source);
    },
    writeDestination: (lines) => {
      if (lines === undefined) {
        rmSync(destination.file, { force: true });

        return;
      }

      mkdirSync(path.dirname(destination.file), { recursive: true });
      destination.lines = lines;
      writeLedger(destination);
    },
    readBack: () => {
      const reread = readLedgers(LEDGERS);

      return { source: reread.find((ledger) => ledger.scope === source.scope).lines ?? [], destination: reread.find((ledger) => ledger.scope === destination.scope).lines };
    },
    // The bytes both files hold before the first write, and their restoration, byte for byte (`commitRoute`).
    // @es Los bytes de ambos ficheros antes de la primera escritura, y su restauración byte a byte.
    snapshot: () => ({ source: ledgerBytes(source.file), destination: ledgerBytes(destination.file), lines: { source: source.lines, destination: destination.lines } }),
    restore: (saved) => {
      restoreLedgerBytes(destination.file, saved.destination);
      restoreLedgerBytes(source.file, saved.source);
      source.lines = saved.lines.source;
      destination.lines = saved.lines.destination;
    }
  };

  return { count: plan.moved.length, file: destination.file, keys: plan.moved.map((one) => one.key), commit: () => commitRoute({ before, plan, io }) };
}

/**
 * What routing the TEXT of a promoted rule to an area's rules file would do (`rule-block.mjs`): the stub of a
 * promoted lesson stays where it is, and the block that says what the rule is moves out of the always-loaded file.
 * @es Lo que haría enrutar el TEXTO de una regla promovida al fichero de reglas de un área: el muñón de una lección promovida se queda donde está y el bloque que dice qué es la regla sale del fichero siempre cargado.
 */
function blockRoute(key, area) {
  const family = rulesFamily();
  const holding = family.filter((file) => findBlock(readFileOr(file, ''), key).start !== undefined);
  const target = areaRulesFile(homedir(), area);

  if (holding.length === 0) return { problems: [`the rule text of "${key}" is in no rules file of the family (${family.join(', ')}). @es el texto de la regla de "${key}" no está en ningún fichero de reglas de la familia (${family.join(', ')}).`] };
  if (holding.length > 1) return { problems: [`the rule text of "${key}" is in more than one rules file (${holding.join(', ')}). @es el texto de la regla de "${key}" está en más de un fichero de reglas (${holding.join(', ')}).`] };
  if (holding[0] === target) return { nothing: true };

  const [from] = holding;
  const before = { from: readFileOr(from, ''), to: existsSync(target) ? readFileOr(target, '') : undefined };
  const plan = planBlockRoute({ ...before, key, header: areaRulesHeader(area) });

  if (!plan.ok) return { problems: plan.problems };

  // Every write is a temporary file renamed over the target (`replaceFile`), and the bytes both files had are kept
  // and put back byte for byte when the transaction fails (`commitBlockRoute`).
  // @es Cada escritura es un fichero temporal renombrado encima del destino, y los bytes de ambos ficheros se guardan
  // y se reponen byte a byte cuando la transacción falla.
  const io = {
    writeFrom: (text) => replaceFile(from, text),
    writeTo: (text) => {
      if (text === undefined) {
        rmSync(target, { force: true });

        return;
      }

      mkdirSync(path.dirname(target), { recursive: true });
      replaceFile(target, text);
    },
    readBack: () => ({ from: readFileOr(from, ''), to: existsSync(target) ? readFileOr(target, '') : undefined }),
    snapshot: () => ({ from: ledgerBytes(from), to: ledgerBytes(target) }),
    restore: (saved) => {
      restoreLedgerBytes(target, saved.to);
      restoreLedgerBytes(from, saved.from);
    }
  };

  return { count: plan.block.length, file: target, keys: [key], commit: () => commitBlockRoute({ before, plan, io }) };
}

/**
 * What bringing the header of every home ledger, and of every area ledger the project declares, up to its declared
 * one would do (`planHeaderRoute`): the headers are tool-owned text, so when the declared text changes (a project
 * area's `paths` or `about` included, or a ledger predates the tool) one command refreshes them all, each proved on
 * its own: the lessons are untouched.
 * @es Lo que haría poner al día con el declarado el encabezado de cada ledger del home y de cada ledger de área que
 * declara el proyecto: los encabezados son texto de la herramienta, así que cuando el texto declarado cambia (también
 * los `paths` o el `about` de un área de proyecto, o un ledger es anterior a la herramienta) un comando los refresca
 * todos, cada uno probado por su cuenta: las lecciones no se tocan.
 */
function headersRoute(ledgers) {
  const scopes = [...Object.keys(homeLedgerFiles(homedir())), ...Object.keys(PROJECT?.areas ?? {})];
  const changing = ledgers
    .filter((ledger) => scopes.includes(ledger.scope) && ledger.lines !== undefined)
    .map((ledger) => ({ ledger, plan: planHeaderRoute({ lines: ledger.lines, header: ledger.header }) }))
    .filter(({ plan }) => plan.changed);

  if (changing.length === 0) return { nothing: true };

  // Each ledger is committed and reported on its own (`commitHeaderRoutes`): one that fails does not stop the others.
  // @es Cada ledger se escribe y se informa por su cuenta: uno que falla no detiene a los demás.
  const commit = () => commitHeaderRoutes(changing.map(({ ledger, plan }) => ({
    name: ledger.file,
    before: [...ledger.lines],
    plan,
    header: ledger.header,
    io: {
      write: (lines) => {
        ledger.lines = lines;
        writeLedger(ledger);
      },
      readBack: () => readLedgers(LEDGERS).find((one) => one.scope === ledger.scope).lines
    }
  })));

  return { count: changing.length, file: changing.map(({ ledger }) => ledger.file).join(', '), keys: changing.map(({ ledger }) => ledger.scope), commit };
}

/**
 * Moves what the router keeps apart (`ledger-routes.mjs`): `--stubs` moves every promoted stub of the loaded home
 * ledger to the file the harness does not load; `--key <key> --to <area>` moves a lesson to the path-scoped file of
 * an area, or, for a promoted lesson, the text of its rule to the area's rules file (its stub stays). An area is a
 * home area (for a `[global]` lesson) or one the project declares in `.claude/failure-capture.json` (for a lesson
 * of that SAME project, into `.claude/rules/lessons-<area>.md`); a lesson never crosses projects nor goes between a
 * project and the home. Before any write, of every kind of route, the plan is proved to lose, duplicate and reword
 * nothing. Every line moves byte for byte (a lesson only changes its scope tag). A dry run unless `--write` is given;
 * under `--write` it holds the ledger lock, writes, RE-READS both files from disk and proves nothing was lost or
 * invented (`ledger-route.mjs`, `rule-block.mjs`), restoring what it had when the proof fails or a write throws.
 * Exit 0 done or nothing to move, 1 refused or failed, 2 the ledger is locked. `--headers` brings the header of
 * every home ledger, and of every area ledger the project declares, up to the declared one.
 * @es Mueve lo que el enrutador mantiene aparte: `--stubs` mueve cada muñón promovido del ledger cargado del
 * home al fichero que el harness no carga; `--key <clave> --to <área>` mueve una lección al fichero con
 * alcance de ruta de un área o, si está promovida, el texto de su regla al fichero de reglas del área (su
 * muñón se queda). Un área es del home (para una lección `[global]`) o una que el proyecto declara en
 * `.claude/failure-capture.json` (para una lección de ESE mismo proyecto, a `.claude/rules/lessons-<área>.md`);
 * una lección nunca cruza proyectos ni va entre un proyecto y el home. Antes de escribir, en todo tipo de ruta, se
 * prueba que el plan no pierde, duplica ni reescribe nada. Toda línea se mueve byte a byte (una lección solo cambia su
 * etiqueta de alcance). Simulacro salvo con `--write`; con `--write` toma el lock del ledger, escribe, RELEE ambos
 * ficheros de disco y prueba que no se perdió ni se inventó nada, y restaura lo que tenía si la prueba falla o una
 * escritura lanza. Salida 0 hecho o nada que mover, 1 rechazado o fallido, 2 ledger bloqueado. `--headers` pone al
 * día el encabezado de cada ledger del home y de cada ledger de área que declara el proyecto.
 */
function commandRoute(args) {
  const stubs = args.stubs === true;
  const headers = args.headers === true;
  const lesson = typeof args.key === 'string' && typeof args.to === 'string';

  if ([stubs, headers, lesson].filter(Boolean).length !== 1) {
    speaker.complain('route.usage');

    return 1;
  }

  const planned = () => {
    const ledgers = readLedgers(LEDGERS);

    if (headers) return headersRoute(ledgers);

    if (stubs) {
      const source = ledgers.find((ledger) => ledger.scope === GLOBAL_SCOPE);
      const destination = ledgers.find((ledger) => ledger.scope === PROMOTED_SCOPE);

      return linesRoute({ source, destination, plan: planStubRoute({ source: source.lines ?? [], destination: destination.lines, header: destination.header }) });
    }

    const found = locateLesson(ledgers, args.key);

    if (found?.ledger.scope === PROMOTED_SCOPE && isAreaScope(args.to)) return blockRoute(args.key, args.to);

    const destination = ledgers.find((ledger) => ledger.scope === args.to);

    return linesRoute({ source: found?.ledger, destination, plan: planLessonRoute({ found, area: args.to, key: args.key, destination: destination?.lines, header: destination?.header, project: PROJECT === undefined ? undefined : { scope: PROJECT.scope, areas: PROJECT.areas } }) });
  };

  const route = () => {
    const wanted = planned();

    if (wanted.problems !== undefined) {
      speaker.complain('route.refused');
      for (const problem of wanted.problems) speaker.dataError(`  - ${problem}`);

      return 1;
    }

    if (wanted.nothing === true) {
      speaker.say('route.nothing');

      return 0;
    }

    if (args.write !== true) {
      speaker.say('route.dry', { count: wanted.count, file: wanted.file });
      for (const key of wanted.keys) speaker.data(`  ${key}`);

      return 0;
    }

    const proof = wanted.commit();
    const outcome = routeOutcome({ proof, count: wanted.count });

    if (outcome.status !== 0) {
      speaker.complain(outcome.complain);
      for (const deficit of outcome.deficits) speaker.dataError(`  - ${deficit}`);
      // A header route reports each ledger on its own: the ones refreshed before or after a failed one are named.
      // @es Una ruta de encabezados informa de cada ledger por su cuenta: se nombran los refrescados antes o después de uno fallido.
      for (const file of proof.refreshed ?? []) speaker.say('route.refreshed', { file });

      return outcome.status;
    }

    speaker.say(...outcome.say);

    return 0;
  };

  if (args.write !== true) return route();

  ensureDirs();

  const outcome = withLock(lockFile(), route);

  if (!outcome.held) {
    speaker.complain('route.locked');

    return 2;
  }

  return outcome.value;
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
/**
 * With a `scope`, only the ledger of that scope is condensed; without one, every ledger of the project is.
 * @es Con un `scope`, solo se condensa el ledger de ese alcance; sin él, todos los ledgers del proyecto.
 */
const condenseLedgers = ({ keyMap, write, scope }) => runCondense({ load: () => loadLedgers().filter((ledger) => scope === undefined || ledger.scope === scope), keyMap, write, date: today(), runId: newRunId(), lockFile: lockFile(), preImageRoot: path.join(stateDirectory(), 'condense') });

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

  const outcome = runSupersede({ load: loadLedgers, key: args.key, rule: args.rule, by: args.by, date: today(), lockFile: lockFile() });

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

/**
 * Where a command of this loop can write configuration: the rules and lessons folders of the home, every
 * ledger it sees and the worker contracts of its project. Read after `bindLoopContext`.
 * @es Dónde puede escribir configuración un comando de este bucle: las carpetas de reglas y lecciones del home, cada ledger que ve y los contratos de worker de su proyecto.
 */
const writableRoots = () => [path.join(homedir(), '.claude', 'rules'), path.join(homedir(), '.claude', 'lessons'), ...Object.values(LEDGERS).map(({ file }) => file), ...WORKER_CONTRACTS];

/**
 * Runs `command` and journals every file it changed under the session that ran it
 * (`config-sync-guard/authored-writes.mjs`), so the turn guard credits a write to its author and not to a
 * session whose shell call merely overlapped it (measured 2026-10-12). With no known session nothing is
 * recorded: an author nobody knows is not a fact.
 * @es Corre `command` y registra cada fichero que cambió bajo la sesión que lo corrió, para que la guardia de turno acredite la escritura a su autor y no a una sesión cuyo shell solo la solapó (medido el 2026-10-12). Sin sesión conocida no se registra nada.
 */
function runAuthored(session, command) {
  const roots = writableRoots();
  const before = snapshotMtimes(roots);
  const code = command();

  recordAuthoredWrites(changedBetween(before, snapshotMtimes(roots)), session);

  return code;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const parsed = parseArgs(rest);
  const args = { ...parsed, session: sessionOf(parsed) };

  if (!PROJECT_COMMANDS.has(command)) return dispatch(command, args);

  try {
    bindLoopContext();
  } catch (error) {
    const defect = error instanceof Error ? error.message : String(error);

    speaker.complain('project.configUnreadable', { command, defect });

    return 2;
  }

  return runAuthored(args.session, () => dispatch(command, args));
}

/** The command's own work. @es El trabajo propio del comando. */
function dispatch(command, args) {
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
    case 'route':
      return commandRoute(args);
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
