#!/usr/bin/env node
/**
 * Proof that `check.mjs` DISCRIMINATES (`contract-doc-names-a-mechanism-nobody-verifies`): every case builds
 * its own repository and home in a temporary directory, so a result never depends on a branch or on what the
 * live tree happens to hold. The last cases run the question over the real contract documents, and refuse
 * to pass over an empty scan, because a check that inspected nothing is silence, not evidence.
 *
 * The state space the decision ranges over: a claim that exists / is missing / exists only in the home;
 * a claim cut by each kind of placeholder; a bare prefix; a near-miss prefix; trailing punctuation; a claim
 * followed by arguments; a claim inside a fence; the home spelled out; a directory claim; a document that is
 * absent; a rules file that must be discovered; a non-markdown file that must not; and a scan that must
 * RESUME after a skipped claim on the same line.
 *
 * @es Prueba de que `check.mjs` DISCRIMINA: cada caso construye su propio repositorio y home en un
 * directorio temporal. Los últimos casos corren la pregunta sobre los contratos reales y se niegan a pasar
 * con un escaneo vacío, porque un check que no inspeccionó nada es silencio, no evidencia.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { claimsIn, contractDocs, inspectContracts } from './check.mjs';

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** Writes `files` (relative path -> text) under `directory`. @es Escribe `files` bajo `directory`. */
function populate(directory, files) {
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(directory, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** A fresh repository and home with `repo` and `home` files, plus all three root contracts unless given. @es Un repo y un home frescos. */
function scenario({ repo = {}, home = {} }) {
  const base = mkdtempSync(path.join(tmpdir(), 'contract-path-check-'));
  const rootFiles = { 'CLAUDE.md': '', 'sdd-mandate.md': '', 'verification-contract.md': '', ...repo };
  populate(path.join(base, 'repo'), rootFiles);
  populate(path.join(base, 'home', '.claude'), home);
  mkdirSync(path.join(base, 'home', '.claude'), { recursive: true });

  return { root: path.join(base, 'repo'), home: path.join(base, 'home'), base };
}

/** The unresolved claims of a scenario. @es Las afirmaciones sin confirmar de un escenario. */
function unresolvedOf(options) {
  const world = scenario(options);
  try {
    return inspectContracts({ root: world.root, home: world.home }).unresolved;
  } finally {
    rmSync(world.base, { recursive: true, force: true });
  }
}

const HOME = '/home/someone';

// --- a claim the filesystem confirms is silent; one it does not is named with its document.
check('an existing claim is confirmed', unresolvedOf({ repo: { 'rules/a.md': 'run `~/.claude/tool/run.mjs`', 'tool/run.mjs': '' } }).length === 0);
const missing = unresolvedOf({ repo: { 'rules/a.md': 'run `~/.claude/tool/gone.mjs`' } });
check('a missing claim is reported once', missing.length === 1);
check('the report names the document', missing[0]?.doc === 'rules/a.md');
check('the report names the claim', missing[0]?.claim === '~/.claude/tool/gone.mjs');
check('a claim in a root contract is reported', unresolvedOf({ repo: { 'CLAUDE.md': 'see ~/.claude/nowhere.md' } })[0]?.doc === 'CLAUDE.md');
check('a claim only the live home holds is confirmed', unresolvedOf({ repo: { 'rules/a.md': '`~/.claude/live/only.mjs`' }, home: { 'live/only.mjs': '' } }).length === 0);
check('a claim neither side holds is reported although the home exists', unresolvedOf({ repo: { 'rules/a.md': '`~/.claude/live/none.mjs`' }, home: { 'live/only.mjs': '' } }).length === 1);

// --- placeholders and bare prefixes claim nothing.
for (const [label, spelling] of [
  ['an angle placeholder', '`~/.claude/lessons/evidence/<key>.md`'],
  ['a glob', '`~/.claude/**`'],
  ['a glob after a directory', '`~/.claude/tool/*.mjs`'],
  ['an ellipsis', '`~/.claude/tool/…`'],
  ['a brace set', '`~/.claude/tool/{a,b}.mjs`'],
  ['a variable', '`~/.claude/tool/$NAME.mjs`'],
  ['a bracket set', '`~/.claude/tool/[ab].mjs`'],
  ['a bare prefix', 'the tree under `~/.claude/` holds it'],
]) check(`${label} is not a claim`, unresolvedOf({ repo: { 'rules/a.md': spelling } }).length === 0);
check('the scan resumes after a skipped pattern on the same line', unresolvedOf({ repo: { 'rules/a.md': '`~/.claude/x/<k>.md` and `~/.claude/x/absent.mjs`' } }).length === 1);

// --- the shape of the run.
check('a near-miss prefix is not a claim', unresolvedOf({ repo: { 'rules/a.md': '`~/.claude-backups/x.git` and `~/.claudeX/y`' } }).length === 0);
check('a sentence period is not part of the path', unresolvedOf({ repo: { 'rules/a.md': 'Run ~/.claude/tool/run.mjs.', 'tool/run.mjs': '' } }).length === 0);
check('closing punctuation is not part of the path', unresolvedOf({ repo: { 'rules/a.md': '(see `~/.claude/tool/run.mjs`), then', 'tool/run.mjs': '' } }).length === 0);
check('arguments after the path are not part of it', unresolvedOf({ repo: { 'rules/a.md': '`~/.claude/tool/run.mjs --flag value`', 'tool/run.mjs': '' } }).length === 0);
check('a fenced claim is read', unresolvedOf({ repo: { 'rules/a.md': 'text\n```\nnode ~/.claude/tool/gone.mjs\n```\n' } }).length === 1);
check('a directory claim that exists is confirmed', unresolvedOf({ repo: { 'rules/a.md': '`~/.claude/tool/`', 'tool/run.mjs': '' } }).length === 0);
check('a directory claim that is missing is reported', unresolvedOf({ repo: { 'rules/a.md': '`~/.claude/gone-dir/`' } }).length === 1);

// --- the home spelled out is a claim as well.
const home = scenario({ repo: { 'rules/a.md': `mechanism ${HOME}/.claude/tool/gone.mjs` } });
check('the home spelled out is read', inspectContracts({ root: home.root, home: HOME }).unresolved.length === 1);
rmSync(home.base, { recursive: true, force: true });
const windowsHome = scenario({ repo: { 'rules/a.md': 'mechanism C:/Users/someone/.claude/tool/gone.mjs' } });
check('a Windows home with backslashes is read as forward slashes', inspectContracts({ root: windowsHome.root, home: 'C:\\Users\\someone' }).unresolved.length === 1);
rmSync(windowsHome.base, { recursive: true, force: true });

// --- which documents are scanned.
const listed = scenario({ repo: { 'rules/z.md': '', 'rules/a.md': '', 'rules/notes.txt': '', 'other/b.md': '' } });
check('every rules markdown file is discovered, sorted', contractDocs(listed.root).filter((doc) => doc.startsWith('rules/')).join(',') === 'rules/a.md,rules/z.md');
check('a non-markdown rules file is not scanned', !contractDocs(listed.root).includes('rules/notes.txt'));
check('a markdown file outside rules is not scanned', !contractDocs(listed.root).includes('other/b.md'));
rmSync(listed.base, { recursive: true, force: true });
const noRules = scenario({});
check('a repository with no rules directory still lists the root contracts', contractDocs(noRules.root).length === 3);
rmSync(noRules.base, { recursive: true, force: true });
const absent = scenario({});
rmSync(path.join(absent.root, 'sdd-mandate.md'));
const absentResult = inspectContracts({ root: absent.root, home: absent.home });
check('an absent contract document is itself a finding', absentResult.unresolved.length === 1 && absentResult.unresolved[0].doc === 'sdd-mandate.md');
rmSync(absent.base, { recursive: true, force: true });

// --- the count is real, so an empty scan cannot read as clean.
const counted = scenario({ repo: { 'rules/a.md': '`~/.claude/x.md` `~/.claude/y.md`', 'x.md': '', 'y.md': '' } });
check('the inspected count equals the claims read', inspectContracts({ root: counted.root, home: counted.home }).inspected === 2);
rmSync(counted.base, { recursive: true, force: true });
check('a bare prefix is not even counted as inspected', claimsIn('under ~/.claude/ and ~/.claude/** and ~/.claude/<x>', HOME).length === 0);
check('claimsIn lists claims in order', claimsIn('a ~/.claude/one.md b ~/.claude/two.md', HOME).join(',') === 'one.md,two.md');

// --- the real contract documents of this repository.
const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const real = inspectContracts({ root: realRoot });
check('the real contract documents were actually scanned (a non-empty scan)', real.inspected >= 10);
for (const finding of real.unresolved) failures.push(`REAL CONTRACT NAMES AN UNCONFIRMED PATH @es UN CONTRATO REAL NOMBRA UNA RUTA SIN CONFIRMAR: ${finding.doc} -> ${finding.claim}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`${passed} passed, ${failures.length} failed @es ${passed} correctos, ${failures.length} fallidos`);
  process.exit(1);
}

console.log(`${passed}/${passed} passed (${real.inspected} real claims confirmed) @es ${passed}/${passed} correctos (${real.inspected} afirmaciones reales confirmadas)`);
