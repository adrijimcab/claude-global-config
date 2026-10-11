/**
 * ONE ENGINE, ONE OWNER. This file and `kill-kind.mjs` are owned HERE and vendored byte-identical into
 * `~/.claude/mutation-proof/` by `~/.claude/vendored/vendored.mjs sync`, pinned by sha256 in its
 * `PROVENANCE.json`, with the rest of the engine (`scope.mjs`, `deciding-modules.mjs`, `campaign-plan.mjs`)
 * and their selftests and campaigns. A change is made here and re-synced; an edit to a copy fails the check.
 * Only `declared-deciding.mjs` stays per repository.
 * @es UN MOTOR, UN DUEÑO. Este fichero y `kill-kind.mjs` se poseen AQUÍ y se vendorizan idénticos en
 * `~/.claude/mutation-proof/` con `vendored.mjs sync`, fijados por sha256. Se cambian aquí y se resincronizan;
 * editar una copia hace fallar la comprobación. Solo `declared-deciding.mjs` es propio de cada repositorio.
 */

/**
 * Proves a selftest DISCRIMINATES: each mutant breaks one decision of the mechanism under test, and the
 * selftest must go RED against it. A surviving mutant means the selftest would stay green over that
 * breakage — the `guard-that-cannot-go-red` defect — so any survivor fails the proof.
 *
 * Every figure this runner prints is only as good as the claim "a red selftest means the named decision
 * was caught". Four ways that claim goes false, each refused here:
 *
 * 1. THE TARGET IS NOT EXACTLY ONCE. A mutant is a literal replacement. Text that is absent mutates
 *    nothing; text that occurs twice mutates whichever copy comes first, which may be a different decision
 *    from the one the label names. Both are REFUSED before anything runs, and the label says which and how
 *    many. So is a file outside the copied paths, a replacement identical to the original, and a
 *    file with no parse check (below). A refused mutant counts as a survivor: it proved nothing.
 *
 * 2. THE BASELINE IS NOT GREEN. If the unmutated selftest already fails, every mutant "kills". So the
 *    selftest runs once, unmutated, before any mutant; anything but exit 0 stops the run with exit 2
 *    (`EXIT_NOT_MEASURED`), which is never a verdict about the mechanism. An EMPTY campaign stops the same
 *    way: "0/0 killed" would otherwise exit 0 having proved nothing.
 *
 * 3. THE MUTANT DOES NOT PARSE. A mutated file that is a syntax error fails every selftest that loads it,
 *    so its "kill" says nothing about the decision. After applying a mutation the file is parse-checked with
 *    `node --check`; a failure is BROKEN, counted as a survivor, and the selftest is not run. The check only
 *    counts as a verdict when it reports a `SyntaxError` — a checker that died for any other reason decides
 *    nothing and stops the run — and the UNMUTATED file must pass it first, or BROKEN could not be told apart
 *    from normal. `node --check` is a JavaScript parser: it rejects valid TypeScript (measured on Node 22),
 *    so a mutant in any extension but `.mjs`/`.cjs`/`.js` is REFUSED rather than run unchecked. No campaign
 *    mutates TypeScript today; one that needs to must bring that language's parser here first.
 *
 * 4. THE SNAPSHOT MOVES. Other workers edit `.claude/` while a campaign runs. The paths are copied
 *    ONCE into a snapshot; the plan, the baseline and every mutant are measured against that one copy, so a
 *    campaign describes a single tree rather than whatever each mutant happened to copy.
 *
 * WHAT IS COPIED IS DERIVED, NOT LISTED. The snapshot holds the folder of every file in the relative-import
 * closure of the selftest and of every mutated file (`import-closure.mjs`). A campaign used to list those
 * folders in `paths` by hand; the closure differs per install, so one vendored campaign could not be right in
 * both, and every install edited its copy. `paths` is still accepted and ADDED, for what a selftest reads
 * without importing (fixtures on disk, a script it spawns). An import that cannot be followed — a missing
 * file, a specifier that climbs out of the fleet — stops the run with `EXIT_NOT_MEASURED` and names it.
 *
 * A RUNTIME CRASH IS A KILL, BUT A WEAK ONE, AND IT IS REPORTED APART. A mutant that makes the mechanism
 * throw (a `ReferenceError`, a `TypeError` on a path the selftest drives) was loaded, run and reached, and the
 * selftest refused to pass. What separates it from a syntax error is that the mutated code EXECUTED, and
 * that is decidable statically. What it does NOT prove is that a check decides the named decision: the
 * selftest died before checking. `kill-kind.mjs` therefore classifies every kill as ASSERTION (the selftest
 * reported a failed check) or CRASH (uncaught throw, or no report at all; an uncaught
 * `AssertionError` is still an assertion), and a crash prints as `CRASHED` with the first line of its error.
 * DECISION: `crashKills` is 'report' by default (the verdict is unchanged, a WEAK PROOF notice is printed) and
 * 'fail' counts each crash as a survivor. The default stays 'report' only while campaigns still hold crash
 * kills to harden; a campaign that has none should pass 'fail' so a crash can never come back unnoticed.
 * Same class, same residual gap: an ESM LINK error (an import of a name no longer exported) passes
 * `node --check` and reads as a crash.
 *
 * A selftest killed by a timeout is a survivor too — a kill signal is not a verdict.
 *
 * @es Prueba que un selftest DISCRIMINA. Se rechaza lo que haría falsa la cifra: un texto a mutar que no
 * aparece EXACTAMENTE una vez (REFUSED), una línea base que no está en verde (sale con 2, nada medido), un
 * mutante que no parsea (BROKEN, superviviente) y una instantánea que se mueve (se copia una sola vez). Un
 * crash en ejecución es una muerte DÉBIL: se informa aparte (CRASHED) y `crashKills` decide si falla. Lo que
 * se copia se DERIVA del cierre de imports relativos del selftest y de cada fichero mutado; `paths` se SUMA
 * para lo que el selftest lee sin importar, y un import que no se puede seguir detiene la corrida nombrándolo.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { copiedPaths, importClosure } from './import-closure.mjs';
import { classifyKill } from './kill-kind.mjs';

/** What a kill by crash does to the verdict. @es Qué hace al veredicto una muerte por crash. */
const CRASH_POLICIES = new Set(['report', 'fail']);

/** Directories that hold a run's output rather than the mechanism, never copied into a sandbox. @es Directorios de salida de corridas, nunca copiados. */
export const RUN_OUTPUT = new Set(['state', 'scratch']);

/** Exit code of a run that measured nothing: a precondition failed, so there is no verdict. @es Salida de una corrida que no midió nada. */
export const EXIT_NOT_MEASURED = 2;

/** Extensions `node --check` parses with the same rules Node uses to run them. @es Extensiones que `node --check` sabe parsear. */
const PARSE_CHECKED = new Set(['.mjs', '.cjs', '.js']);

/** A precondition failed: the run must stop without a verdict. @es Falló una precondición: no hay veredicto. */
class NotMeasured extends Error {}

/**
 * Counts every position where `needle` starts in `text`, overlapping ones included: any second start
 * position makes a replacement ambiguous. @es Cuenta cada posición donde empieza `needle`, solapadas incluidas.
 */
export function occurrencesOf(text, needle) {
  let count = 0;

  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) count += 1;

  return count;
}

/**
 * @param options.fleetRoot The `.claude/` directory holding the mechanism.
 * @param options.paths Optional. What the selftest needs WITHOUT importing it, relative to `fleetRoot` —
 *   directories or single files — added to the derived import closure. What it imports is never listed here.
 *   A missing need reddens the baseline, so the run stops rather than measure a selftest that cannot pass.
 * @param options.selftest The selftest path, relative to `fleetRoot`.
 * @param options.mutants `[label, file relative to fleetRoot, original text, replacement]`.
 * @param options.timeoutMs Per-run selftest timeout.
 * @returns the number of survivors; each result is printed as it lands. A run that cannot measure exits
 *   the process with `EXIT_NOT_MEASURED` instead of returning.
 * @es Corre cada mutante y devuelve cuántos sobrevivieron; si no puede medir, sale con `EXIT_NOT_MEASURED`.
 */
export function runMutants(options) {
  try {
    return measure(options);
  } catch (error) {
    if (!(error instanceof NotMeasured)) throw error;

    console.error(`NOT MEASURED — ${error.message}`);
    process.exit(EXIT_NOT_MEASURED);
  }
}

function measure({ fleetRoot, paths = [], selftest, mutants, timeoutMs = 900_000, crashKills = 'report' }) {
  if (!CRASH_POLICIES.has(crashKills)) throw new NotMeasured(`crashKills must be 'report' or 'fail', got ${JSON.stringify(crashKills)}; no policy is picked on the caller's behalf`);
  if (mutants.length === 0) throw new NotMeasured('the campaign holds no mutant, and 0/0 killed is not a proof');

  const copied = copiedPathsOf(fleetRoot, paths, selftest, mutants);
  const sandboxRoot = sandboxRootOf(fleetRoot, copied);
  const snapshot = mkdtempSync(path.join(sandboxRoot, 'snapshot-'));
  const sandboxes = { root: sandboxRoot, snapshot, copied };

  try {
    for (const needed of copied) cpSync(path.join(fleetRoot, needed), path.join(snapshot, needed), { recursive: true, filter: (source) => !RUN_OUTPUT.has(path.basename(source)) });

    const plans = mutants.map((mutant) => planOf(mutant, snapshot, copied));

    for (const { label, refusal } of plans) if (refusal !== undefined) console.log(`REFUSED  ${label} — ${refusal}`);

    requireParseableOriginals(plans, snapshot);
    requireGreenBaseline(sandboxes, selftest, timeoutMs);

    const tally = { assertion: 0, crash: 0 };

    for (const plan of plans) {
      const kind = plan.refusal === undefined ? runMutant(plan, sandboxes, selftest, timeoutMs) : undefined;

      if (kind === 'assertion' || kind === 'crash') tally[kind] += 1;
    }

    const killed = tally.assertion + tally.crash;

    console.log(`\n${killed}/${mutants.length} mutants killed (${tally.assertion} by assertion, ${tally.crash} by crash)`);
    if (tally.crash > 0) console.log(weakProofNotice(tally.crash, crashKills));

    return mutants.length - killed + (crashKills === 'fail' ? tally.crash : 0);
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

/**
 * The paths a campaign copies: the folders of the import closure of the selftest and of every mutated file
 * inside the fleet that exists, plus the explicit `paths`. A mutated file outside the fleet, or missing, is
 * not walked: its own mutant is refused, and the rest of the campaign still measures.
 * @es Lo que copia una campaña: las carpetas del cierre de imports del selftest y de cada fichero mutado que
 * existe dentro de la flota, más `paths`. Un fichero mutado ausente o de fuera no se recorre: se rechaza su mutante.
 */
function copiedPathsOf(fleetRoot, paths, selftest, mutants) {
  const mutated = mutants.map(([, file]) => file).filter((file) => isInside(fleetRoot, path.join(fleetRoot, file)) && existsSync(path.join(fleetRoot, file)));
  const closure = importClosure({ root: fleetRoot, entries: [selftest, ...mutated] });

  if (closure.problems.length > 0) {
    throw new NotMeasured(`the imports of the selftest and its mutated files cannot all be copied, so a sandbox would not hold them @es los imports del selftest y de sus ficheros mutados no se pueden copiar todos, así que un sandbox no los tendría:\n${closure.problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }

  return [...new Set([...copiedPaths(closure.files), ...paths])];
}

/**
 * Sandboxes live INSIDE the fleet directory, not in the system temp dir: a mechanism that locates its
 * repository from its own path (the integrate selftest finds the installed node_modules that way) must
 * still be inside that repository when it runs as a copy. `.claude/` is ignored, so nothing is tracked.
 * The directory is named `scratch` because the hook-registration self-check never descends into one: a
 * sandbox holds COPIES of guard declarations, and enrolling them would redden a correct fleet mid-run.
 * And it sits OUTSIDE every copied path. MEASURED: under `mutation-proof/scratch`, copying
 * `mutation-proof` into the sandbox is a copy into its own subdirectory, which Node refuses
 * (ERR_FS_CP_EINVAL), and every runner that needed that directory died in 0 s with no verdict.
 * @es Los sandboxes viven dentro de `.claude/scratch`, fuera de toda ruta copiada.
 */
function sandboxRootOf(fleetRoot, copied) {
  const sandboxRoot = path.join(fleetRoot, 'scratch', 'mutation-proof');
  const enclosing = copied.find((needed) => isInside(path.join(fleetRoot, needed), sandboxRoot));

  if (enclosing !== undefined) throw new NotMeasured(`the sandbox root ${sandboxRoot} lies inside the copied path ${enclosing}; no mutant can run`);

  mkdirSync(sandboxRoot, { recursive: true });

  return sandboxRoot;
}

function isInside(container, candidate) {
  const relative = path.relative(container, candidate);

  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Decides, before anything runs, whether a mutant can mean what its label says. @es Decide si un mutante puede significar lo que dice su etiqueta. */
function planOf([label, file, original, replacement], snapshot, copied) {
  const plan = { label, file, original, replacement };
  const refusal = refusalOf(plan, snapshot, copied);

  return refusal === undefined ? plan : { ...plan, refusal };
}

function refusalOf({ file, original, replacement }, snapshot, copied) {
  if (!copied.some((needed) => isInside(needed, file))) return `${file} is outside the copied paths (${copied.join(', ')})`;
  if (!PARSE_CHECKED.has(path.extname(file))) return `${file} has no parse check, so a syntax-broken mutant could not be told from a kill`;
  if (original.length === 0) return 'the text to mutate is empty';
  if (original === replacement) return 'the replacement is identical to the original, so nothing would change';

  const source = sourceOf(path.join(snapshot, file));

  if (source === undefined) return `${file} does not exist`;

  const count = occurrencesOf(source, original);

  if (count === 0) return `ABSENT — the text to mutate occurs 0 times in ${file}`;
  if (count > 1) return `AMBIGUOUS — the text to mutate occurs ${count} times in ${file}, so the mutation could land on a different decision`;

  return undefined;
}

function sourceOf(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;

    throw error;
  }
}

/** A BROKEN verdict only means something when the unmutated file parses. @es BROKEN solo significa algo si el original parsea. */
function requireParseableOriginals(plans, snapshot) {
  const files = new Set(plans.filter(({ refusal }) => refusal === undefined).map(({ file }) => file));

  for (const file of files) {
    const failure = syntaxErrorOf(path.join(snapshot, file));

    if (failure !== undefined) throw new NotMeasured(`the UNMUTATED ${file} does not parse (${failure}), so a syntax-broken mutant could not be told apart`);
  }
}

function requireGreenBaseline(sandboxes, selftest, timeoutMs) {
  const run = inSandbox(sandboxes, () => undefined, (sandbox) => selftestIn(sandbox, selftest, timeoutMs));

  if (run.status !== 0 || run.signal !== null) throw new NotMeasured(`the UNMUTATED selftest is not green (${outcomeOf(run)}), so every mutant would read as killed`);

  console.log(`BASELINE ${selftest} is green (${tallyOf(run)})`);
}

/** Where the crash was thrown, as the first frames of its trace. @es Dónde se lanzó el crash. */
function framesNote(frames) {
  return frames === undefined || frames.length === 0 ? '' : ` [at ${frames.join(' < ')}]`;
}

/**
 * Said once per campaign that holds a crash kill: the decision of whether it fails the run lives in
 * `crashKills`, and the notice states which one applied.
 * @es Se dice una vez por campaña con un crash: la decisión de si falla la corrida vive en `crashKills`.
 */
function weakProofNotice(crashes, crashKills) {
  const outcome = crashKills === 'fail' ? 'counted as survivors, so the campaign FAILS' : 'only reported, the campaign verdict is unchanged';

  return `WEAK PROOF — ${crashes} mutant(s) died by crash: the code ran, no check decided it (${outcome}). @es PRUEBA DÉBIL — ${crashes} mutante(s) murieron por crash: el código corrió, ningún check lo decidió.`;
}

/**
 * @returns `'assertion'` or `'crash'` for a kill, `'survived'` or `'broken'` otherwise, after printing the
 * verdict. @es `'assertion'` o `'crash'` si murió; `'survived'` o `'broken'` si no.
 */
function runMutant({ label, file, original, replacement }, sandboxes, selftest, timeoutMs) {
  const verdict = inSandbox(
    sandboxes,
    (sandbox) => {
      const target = path.join(sandbox, file);

      writeFileSync(target, spliced(readFileSync(target, 'utf8'), original, replacement));
    },
    (sandbox) => {
      const syntaxError = syntaxErrorOf(path.join(sandbox, file));

      return syntaxError === undefined ? { run: selftestIn(sandbox, selftest, timeoutMs) } : { syntaxError };
    }
  );

  if (verdict.syntaxError !== undefined) {
    console.log(`BROKEN   ${label} — the mutated ${file} does not parse (${verdict.syntaxError}); a red from it proves nothing`);

    return 'broken';
  }

  const killed = verdict.run.status !== 0 && verdict.run.signal === null;
  const kill = killed ? classifyKill(verdict.run) : { kind: 'none' };

  if (kill.kind === 'crash') {
    console.log(`CRASHED  ${label} — ${kill.firstLine}${framesNote(kill.frames)} (${outcomeOf(verdict.run)})`);

    return 'crash';
  }

  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${label} (${outcomeOf(verdict.run)})`);

  return killed ? 'assertion' : 'survived';
}

/**
 * Replaces the one occurrence the plan proved exists. Never `String.prototype.replace`: it reads `$&`, `$'`,
 * `` $` `` and `$$` in the replacement as patterns, so a replacement carrying them would be written altered.
 * @es Sustituye la única aparición; nunca `replace`, que interpreta `$&`, `$'`, `` $` `` y `$$`.
 */
function spliced(source, original, replacement) {
  const at = source.indexOf(original);

  return source.slice(0, at) + replacement + source.slice(at + original.length);
}

/** Copies the snapshot into a fresh sandbox, prepares it, measures it, and always removes it. @es Copia, prepara, mide y borra un sandbox. */
function inSandbox({ root, snapshot, copied }, prepare, measureIn) {
  const sandbox = mkdtempSync(path.join(root, 'mutant-'));

  try {
    for (const needed of copied) cpSync(path.join(snapshot, needed), path.join(sandbox, needed), { recursive: true });

    prepare(sandbox);

    return measureIn(sandbox);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function selftestIn(sandbox, selftest, timeoutMs) {
  return spawnSync(process.execPath, [path.join(sandbox, selftest)], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
}

/**
 * @returns the `SyntaxError` line when `node --check` rejects the file, `undefined` when it parses. A checker
 * that fails WITHOUT reporting a SyntaxError has decided nothing, so the run stops rather than guess.
 * @es La línea `SyntaxError` si no parsea; si el comprobador falla sin SyntaxError, no hay veredicto.
 */
function syntaxErrorOf(file) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });

  if (check.status === 0) return undefined;

  const syntaxError = linesOf(check.stderr ?? '').find((line) => line.startsWith('SyntaxError'));

  if (check.status === 1 && syntaxError !== undefined) return syntaxError;

  throw new NotMeasured(`the parse check of ${file} failed without a SyntaxError (${outcomeOf(check)}); it decided nothing`);
}

function outcomeOf(run) {
  if (run.error !== undefined && run.signal === null) return `could not run: ${run.error.message}`;
  if (run.signal !== null) return `killed by ${run.signal}, not a verdict`;

  return `exit ${run.status}: ${tallyOf(run)}`;
}

function tallyOf(run) {
  return linesOf(run.stdout ?? '').at(-1) ?? '';
}

function linesOf(text) {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}
