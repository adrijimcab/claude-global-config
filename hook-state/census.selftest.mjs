#!/usr/bin/env node
/**
 * The census of `census.mjs`, run on THIS tree, plus the discrimination proof of each rule on constructed trees.
 *
 * ON THIS TREE: no non-test module joins a `state` segment, names a state variable or builds the Claude home by
 * hand outside `locations.mjs` (beyond the listed excuses, each still in use); every selftest that exercises a
 * module resolving its state through the module redirects the state; and every mechanism a module names in a
 * literal `stateDir('<mechanism>')` has its files classified in `rotate.mjs` `KINDS`, whose every mechanism is
 * a directory of this tree, so a new mechanism cannot leave its journals for `rotate.mjs` to report as unknown.
 *
 * THE STATE SPACE OF EACH RULE, on constructed trees: the defect in a module, in a comment, in a selftest, in a
 * campaign, in a vendored copy, in a directory never walked and in the module itself; each quote; `join(` and
 * `resolve(`; an excuse in use and an excuse no longer used; imports written on one line, over several, bare
 * and with double quotes, `node:` ones ignored; a module on the module directly, transitively, and a selftest
 * that is not one; a selftest beside the module or naming its path, isolating by `isolateState(`, by its own
 * `HOOK_STATE_DIR`, or not at all, and one that names nothing.
 *
 * @es El censo de `census.mjs` sobre ESTE árbol, más la prueba de discriminación de cada regla sobre árboles
 * construidos. Sobre este árbol: ningún módulo no-test une `state`, nombra una variable de estado ni construye el
 * home a mano fuera de `locations.mjs` (salvo las excusas listadas y en uso); todo selftest que ejercita un
 * módulo que resuelve por el módulo redirige el estado; y cada mecanismo nombrado en un `stateDir('<mecanismo>')`
 * literal tiene sus ficheros clasificados en `KINDS` de `rotate.mjs`, cuyos mecanismos son directorios del árbol.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { claudeHomeJoinsOutsideTheModule, importsOf, literalMechanisms, modulesOnTheModule, selftestsNotIsolating, stateJoinsOutsideTheModule, stateVariablesOutsideTheModule } from './census.mjs';
import { isolateState } from './locations.mjs';
import { KINDS } from './rotate.mjs';

isolateState('census');

const TREE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'census-selftest-'));

/** A constructed tree of `files` (relative path -> text). @es Un árbol construido. */
function tree(name, files) {
  const root = path.join(scratch, name);

  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }

  return root;
}

const LOCATIONS = "export const stateDir = (m) => m;\n";
const Q = "'";

try {
  // --- this tree ---
  check('this tree: no module outside locations.mjs joins a state segment', stateJoinsOutsideTheModule(TREE), []);
  check('this tree: no module outside locations.mjs names a state variable', stateVariablesOutsideTheModule(TREE), []);
  check('this tree: no module builds the Claude home by hand, and every excuse is in use', claudeHomeJoinsOutsideTheModule(TREE), []);
  check('this tree: every selftest that exercises a module on locations.mjs redirects the state', selftestsNotIsolating(TREE), []);
  const classified = new Set(KINDS.map(([mechanism]) => mechanism));
  check('this tree: every mechanism named in a literal stateDir has its files classified by rotate.mjs', literalMechanisms(TREE).filter((mechanism) => !classified.has(mechanism)), []);
  check('this tree: the literal mechanisms are found at all', literalMechanisms(TREE).length > 10, true);
  check('this tree: every mechanism rotate.mjs classifies is one a module names, so none is stale', [...classified].filter((mechanism) => mechanism !== '*' && !literalMechanisms(TREE).includes(mechanism)), []);

  // --- (a) a state segment joined by hand ---
  const joins = tree('joins', {
    'hook-state/locations.mjs': `${LOCATIONS}const own = path.join(root, 'state');\n`,
    'guard-a/guard.mjs': "const STATE = path.join(HERE, 'state');\n",
    'guard-b/guard.mjs': 'const STATE = path.resolve(HERE, "state", "x.jsonl");\n',
    'guard-c/guard.mjs': 'const STATE = join(HERE, `state`);\n',
    'guard-d/guard.mjs': "// path.join(HERE, 'state') is how it used to be done\n * path.join(HERE, 'state')\nconst named = 'state';\n",
    'guard-e/selftest.mjs': "const s = path.join(HERE, 'state');\n",
    'guard-e/x.selftest.mjs': "const s = path.join(HERE, 'state');\n",
    'guard-e/mutants.mjs': "const s = path.join(HERE, 'state');\n",
    'guard-e/x.mutants.mjs': "const s = path.join(HERE, 'state');\n",
    'fleet-kit/vendor/copy/guard.mjs': "const s = path.join(HERE, 'state');\n",
    'node_modules/pkg/index.mjs': "const s = path.join(HERE, 'state');\n",
    'guard-f/state/old.mjs': "const s = path.join(HERE, 'state');\n",
    'worktrees/w/guard.mjs': "const s = path.join(HERE, 'state');\n",
    'guard-g/guard.txt': "const s = path.join(HERE, 'state');\n"
  });
  check('a join of state in a module is found in every quote and with resolve, with its line', stateJoinsOutsideTheModule(joins), [{ file: 'guard-a/guard.mjs', line: 1 }, { file: 'guard-b/guard.mjs', line: 1 }, { file: 'guard-c/guard.mjs', line: 1 }]);
  check('an excuse silences its file', stateJoinsOutsideTheModule(joins, new Map([['guard-a/guard.mjs', 'why']])).map((finding) => finding.file), ['guard-b/guard.mjs', 'guard-c/guard.mjs']);
  check('an excuse whose file joins nothing is a finding', stateJoinsOutsideTheModule(joins, new Map([['guard-d/guard.mjs', 'stale']])).at(-1), { file: 'guard-d/guard.mjs', line: 0, unused: true });

  // --- (b) a state variable named in code ---
  const variables = tree('variables', {
    'hook-state/locations.mjs': `${LOCATIONS}const r = process.env.HOOK_STATE_DIR;\n`,
    'hook-state/census.mjs': "const VARIABLES = ['HOOK_STATE_DIR', 'HOOK_CLAUDE_HOME'];\n",
    'guard-a/guard.mjs': "\n\nconst root = process.env.HOOK_STATE_DIR ?? '';\n",
    'guard-b/guard.mjs': 'const env = { HOOK_CLAUDE_HOME: home };\n',
    'guard-c/guard.mjs': '// HOOK_STATE_DIR relocates it\n',
    'guard-c/selftest.mjs': 'process.env.HOOK_STATE_DIR = x;\n'
  });
  check('a state variable named in a module is found, with its line', stateVariablesOutsideTheModule(variables), [{ file: 'guard-a/guard.mjs', line: 3 }, { file: 'guard-b/guard.mjs', line: 1 }]);

  // --- (c) the Claude home built by hand ---
  const homes = tree('homes', {
    'hook-state/locations.mjs': `${LOCATIONS}const h = path.join(homedir(), '.claude');\n`,
    'guard-a/guard.mjs': "const h = path.join(homedir(), '.claude', 'guard-a');\n",
    'guard-b/guard.mjs': 'const h = join(homedir(), ".claude");\n',
    'guard-c/guard.mjs': "const h = homedir();\nconst c = '.claude';\n",
    'guard-d/guard.mjs': "const t = path.join(homedir(), '.claude', 'projects');\n"
  });
  check('a Claude home built on one line is found', claudeHomeJoinsOutsideTheModule(homes, new Map()).map((finding) => finding.file), ['guard-a/guard.mjs', 'guard-b/guard.mjs', 'guard-d/guard.mjs']);
  check('an excused home is silent, an unused excuse is a finding', claudeHomeJoinsOutsideTheModule(homes, new Map([['guard-d/guard.mjs', 'transcripts'], ['guard-c/guard.mjs', 'stale']])), [{ file: 'guard-a/guard.mjs', line: 1 }, { file: 'guard-b/guard.mjs', line: 1 }, { file: 'guard-c/guard.mjs', line: 0, unused: true }]);

  // --- imports ---
  check('imports: one line, several lines, bare, double quotes; node: ignored', importsOf('dir/file.mjs', `import { a } from './a.mjs';\nimport {\n  b,\n} from '../hook-state/locations.mjs';\nimport './side.mjs';\nimport x from "../y/z.mjs";\nimport path from 'node:path';\nconst s = "from './no.mjs'";\n`), ['dir/a.mjs', 'hook-state/locations.mjs', 'dir/side.mjs', 'y/z.mjs']);

  // --- (d) selftests that exercise a module on the module ---
  const isolation = tree('isolation', {
    'hook-state/locations.mjs': LOCATIONS,
    'hook-state/locations.selftest.mjs': "import { stateDir } from './locations.mjs';\n",
    'guard-a/guard.mjs': "import { stateDir } from '../hook-state/locations.mjs';\n",
    'guard-a/selftest.mjs': "const GUARD = path.join(HERE, 'guard.mjs');\n",
    'guard-a/isolated.selftest.mjs': "const GUARD = path.join(HERE, 'guard.mjs');\nisolateState('a');\n",
    'guard-a/own.selftest.mjs': "const GUARD = path.join(HERE, 'guard.mjs');\nprocess.env.HOOK_STATE_DIR = path.join(root, 'state');\n",
    'guard-a/unrelated.selftest.mjs': 'process.exit(0);\n',
    'guard-b/helper.mjs': "import { stateDir } from '../hook-state/locations.mjs';\n",
    'guard-b/guard.mjs': "import { x } from './helper.mjs';\n",
    'guard-b/selftest.mjs': "import { evaluate } from './guard.mjs';\n",
    'guard-c/selftest.mjs': "const other = path.join(ROOT, 'guard-a/guard.mjs');\n",
    'guard-d/guard.mjs': 'export const plain = 1;\n',
    'guard-d/selftest.mjs': "import { plain } from './guard.mjs';\n",
    'guard-e/fixture.selftest.mjs': "import { stateDir } from '../hook-state/locations.mjs';\n",
    'guard-e/selftest.mjs': "import { x } from './fixture.selftest.mjs';\n"
  });
  check('the modules on the module: direct and transitive, never a selftest or the module itself', modulesOnTheModule(isolation), ['guard-a/guard.mjs', 'guard-b/guard.mjs', 'guard-b/helper.mjs']);
  check('a selftest beside a module on the module, or naming its path, that does not isolate is a finding', selftestsNotIsolating(isolation), [{ file: 'guard-a/selftest.mjs', exercises: ['guard-a/guard.mjs'] }, { file: 'guard-b/selftest.mjs', exercises: ['guard-b/guard.mjs'] }, { file: 'guard-c/selftest.mjs', exercises: ['guard-a/guard.mjs'] }]);

  // --- literal mechanisms ---
  const literal = tree('literal', {
    'hook-state/locations.mjs': `${LOCATIONS}const x = stateDir('inside-the-module');\n`,
    'guard-a/guard.mjs': `const a = [stateDir(${Q}guard-z${Q}), stateDir(${Q}guard-y${Q}), stateDirOf(${Q}guard-b${Q})];\nconst b = stateDir(${Q}guard-a${Q});\n`,
    'guard-c/guard.mjs': '// stateDir(\'in-a-comment\')\nconst c = stateDir(name);\n',
    'guard-d/selftest.mjs': "const d = stateDir('from-a-selftest');\n"
  });
  check('the literal mechanisms of the non-test modules, sorted, never a comment, a variable or a selftest', literalMechanisms(literal), ['guard-a', 'guard-b', 'guard-y', 'guard-z']);
} catch (error) {
  failures.push(`unexpected throw — ${error.stack}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
