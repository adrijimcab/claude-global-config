#!/usr/bin/env node
/**
 * The discrimination proof for `brief-tenancy` — the guard that closes
 * `unmeasured-rationale-stated-as-fact-in-brief` in its tenancy face.
 *
 * WHAT A PROOF HAS TO DO HERE, and why passing is not it. This fleet has measured, six times over, that
 * watching a guard pass is not watching it decide: a `Stop` guard that filtered on a field name that did
 * not exist produced output byte-identical to a clean fleet, and `brief-provenance` passed 26 of 26
 * while the surface it claimed was unguarded, because its fixtures invented a payload the harness never
 * sends. So this file does four separate things, and each closes one of those measured faces:
 *
 *   1. THE DECISION, over its whole state space, on a CONSTRUCTED filesystem — every tenancy the probe
 *      can return crossed with every declaration state, with zero real junctions created or destroyed.
 *   2. THE NEAR MISSES, which is the state nobody tests: an author who tried to satisfy the control and
 *      got the FORM wrong. Buried marker, missing colon, and a marker that declares a DIFFERENT
 *      checkout — the last being the one that stops this line from becoming template boilerplate.
 *   3. THE SURFACE, by spawning the real hook with a RECORDED harness payload per tool. `SendMessage`
 *      carries its text in `message`; a fixture that used `prompt` would agree with the guard by
 *      construction and prove nothing.
 *   4. THE REAL FILESYSTEM, on a CONSTRUCTED machine (`constructed-machine.mjs`): real git checkouts
 *      with real junctions, so the spawned hook's real probe measures farms and a linked tree, and each
 *      verdict is asserted outright. This section used to read the live plugin checkouts and assert
 *      only that the hook AGREED with them. That never reddened — and never discriminated either once
 *      those checkouts held their own trees: measured 2026-09-22, 70/70 over a guard that never emits
 *      its refusal (`guard-that-cannot-go-red`, fourth face, from the side that cannot go red).
 *
 * @es La prueba de discriminación de `brief-tenancy`. QUE PASE NO ES LA PRUEBA: esta flota ha medido
 * seis veces que ver pasar un guard no es verlo decidir. Así que este fichero hace cuatro cosas
 * distintas: (1) la DECISIÓN sobre todo su espacio de estados con un sistema de ficheros CONSTRUIDO, sin
 * crear ni borrar un solo junction; (2) los CASI-ACIERTOS, el estado que nadie prueba: quien intentó
 * satisfacer el control y erró la FORMA; (3) el SURFACE, lanzando el hook real con un payload REGISTRADO
 * del harness por herramienta, porque `SendMessage` lleva su texto en `message`; (4) el sistema de
 * ficheros REAL sobre una máquina CONSTRUIDA, con junctions reales y veredictos afirmados sin condición:
 * leer los plugins vivos y exigir solo acuerdo nunca enrojecía, pero tampoco discriminaba.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildIncidentMachine } from './constructed-machine.mjs';
import { reason, refusalFor } from './decision.mjs';
import { mentionedMutations } from './mentioned-mutations.mjs';
import { namedCheckouts } from './named-checkouts.mjs';
import { declarationOf } from './tenancy-declaration.mjs';
import { CLAUDE_HOME_VARIABLE, isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('brief-tenancy');

/** The lesson this mechanism closes. Named literally, so `failure-capture/promote` can see the link. @es La lección que cierra. */
export const LESSON_KEY = 'unmeasured-rationale-stated-as-fact-in-brief';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const CARRIERS_PATH = join(HERE, '..', 'brief-provenance', 'provenance.mjs');
const PAYLOADS_PATH = join(HERE, '..', 'hook-payloads', 'payloads.mjs');
const CARRIERS = pathToFileURL(CARRIERS_PATH).href;
const PAYLOADS = pathToFileURL(PAYLOADS_PATH).href;

const PLUGIN_ESLINT = 'C:/Users/adrian.jimenez/Desktop/Projects/plugin-eslint';
const PLUGIN_STYLELINT = 'C:/Users/adrian.jimenez/Desktop/Projects/plugin-stylelint';
const MAIN = 'C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    return;
  }

  failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
}

// ── THE CONSTRUCTED FILESYSTEM ──────────────────────────────────────────────────────────────────────
// Every tenancy topology, described rather than created. `tree-tenancy.mjs` takes its filesystem view as
// a parameter precisely so a proof never has to make a junction on a machine whose shared tree has
// already been destroyed twice.
// @es Cada topología de tenencia, descrita y no creada.

const FOREIGN_TREE = 'C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/node_modules';
const BACK = String.fromCharCode(92);
// NO REGEX (M5), here as much as in the decision: a pattern that fails to match would silently
// mis-key a fixture and the proof would agree with the guard for the wrong reason.
const key = (target) => {
  let path = target.split(BACK).join('/').toLowerCase();

  while (path.endsWith('/')) path = path.slice(0, -1);

  return path;
};

/**
 * A filesystem view in which each named checkout has the tenancy asked for.
 * @es Una vista del sistema de ficheros donde cada checkout tiene la tenencia pedida.
 */
function constructedProbe(layout) {
  const stateOf = (target) => layout[Object.keys(layout).find((path) => key(path) === key(target)) ?? ''];

  return {
    kindOf(target) {
      const lowered = key(target);

      if (!lowered.endsWith('/node_modules')) return 'directory';

      const state = stateOf(lowered.slice(0, -'/node_modules'.length));

      if (state === undefined || state === 'absent') return 'absent';

      return state === 'linked' ? 'link' : 'directory';
    },

    childrenOf(target) {
      const state = stateOf(key(target).slice(0, -'/node_modules'.length));

      if (state === 'farm') return [{ name: 'typescript', link: true }, { name: 'jiti', link: true }];

      return [{ name: 'typescript', link: false }];
    },

    resolve(target) {
      const lowered = key(target);
      const state = stateOf(lowered);

      if (state === 'unknown') throw new Error('probe refuses to resolve');
      if (state !== undefined) return target;

      const owner = lowered.slice(0, lowered.indexOf('/node_modules'));

      if (lowered.includes('/node_modules') && (stateOf(owner) === 'farm' || stateOf(owner) === 'linked')) {
        return lowered.endsWith('/node_modules') ? FOREIGN_TREE : `${FOREIGN_TREE}/typescript`;
      }

      return target;
    }
  };
}

const deniedBy = (text, layout) => refusalFor(text, constructedProbe(layout)) !== undefined;

// ── 1. THE STATE SPACE OF THE DECISION ──────────────────────────────────────────────────────────────

const NEVER = 'NEVER run `npm ci` on this machine: it destroys the junction-shared tree.';
const INCIDENT_SENTENCE =
  'Inside the two PLUGIN repositories, which have their own independent trees, `npm ci` is exactly the command you are trying to make work, so run it there freely.';

const FARM_LAYOUT = { [PLUGIN_ESLINT]: 'farm', [PLUGIN_STYLELINT]: 'farm', [MAIN]: 'own' };
const LINKED_LAYOUT = { [PLUGIN_ESLINT]: 'linked', [MAIN]: 'own' };

check('no mutation, no path -> allow', !deniedBy('Fix the failing a11y suites and commit each slice.', FARM_LAYOUT));

check(
  'no mutation, foreign path named -> allow',
  !deniedBy(`Read the pipeline in ${PLUGIN_ESLINT} and report what it does.`, FARM_LAYOUT),
  'the 2 real corpus texts that name the plugin repos carry no mutation and must pass'
);

check('mutation, no path at all -> allow', !deniedBy(NEVER, FARM_LAYOUT));

check(
  'MANDATED: prohibition sentence with only an own-tree path -> allow',
  !deniedBy(`${NEVER} Junction node_modules to ${MAIN}/node_modules instead.`, FARM_LAYOUT),
  'this is the standard preamble, 11 of the 24 real mutation mentions'
);

check('mutation, path whose tree is absent -> allow', !deniedBy(`${NEVER} See C:/Users/adrian.jimenez/Desktop/Projects/gone-repo.`, { ...FARM_LAYOUT, 'C:/Users/adrian.jimenez/Desktop/Projects/gone-repo': 'absent' }));

check('mutation, tenancy unknowable -> allow (fails open)', !deniedBy(`${NEVER} See C:/Users/adrian.jimenez/Desktop/Projects/opaque.`, { ...FARM_LAYOUT, 'C:/Users/adrian.jimenez/Desktop/Projects/opaque': 'unknown' }));

check('mutation + FARM checkout, undeclared -> DENY', deniedBy(`${INCIDENT_SENTENCE} Work in ${PLUGIN_ESLINT}.`, FARM_LAYOUT));

check('mutation + LINKED checkout, undeclared -> DENY', deniedBy(`${INCIDENT_SENTENCE} Work in ${PLUGIN_ESLINT}.`, LINKED_LAYOUT));

check(
  'mutation + foreign checkout, declared by full path -> allow',
  !deniedBy(`TENANCY: ${PLUGIN_ESLINT} — node_modules is a junction into b100-am-ui.\n${NEVER} Work in ${PLUGIN_ESLINT}.`, FARM_LAYOUT)
);

check(
  'mutation + foreign checkout, declared by last segment -> allow',
  !deniedBy(`TENANCY: plugin-eslint — junction into b100-am-ui, measured with Get-Item -Force.\n${NEVER} Work in ${PLUGIN_ESLINT}.`, FARM_LAYOUT)
);

check(
  'two foreign checkouts, only one declared -> DENY, naming only the undeclared one',
  (() => {
    const refusal = refusalFor(
      `TENANCY: plugin-eslint — junction into b100-am-ui.\n${INCIDENT_SENTENCE} Work in ${PLUGIN_ESLINT} and ${PLUGIN_STYLELINT}.`,
      constructedProbe(FARM_LAYOUT)
    );

    return refusal !== undefined && refusal.checkouts.length === 1 && refusal.checkouts[0].checkout === PLUGIN_STYLELINT;
  })(),
  'a declaration is per checkout, so declaring one may never clear the other'
);

// ── 2. THE NEAR MISSES — an author who tried and got the FORM wrong ─────────────────────────────────

const nearMiss = (text) => {
  const refusal = refusalFor(`${text}\n${INCIDENT_SENTENCE} Work in ${PLUGIN_ESLINT}.`, constructedProbe(FARM_LAYOUT));

  return refusal === undefined ? 'allowed' : refusal.checkouts[0].declaration;
};

check('NEAR MISS: marker buried mid-sentence -> DENY, state `buried`', nearMiss('As the TENANCY: line below shows, this is a junction.') === 'buried');
check(
  'NEAR MISS: marker buried mid-sentence EVEN WHEN it names the checkout -> still `buried`',
  nearMiss('per the TENANCY: plugin-eslint note, it is shared.') === 'buried',
  'the realistic near miss: the author said the right thing, in a sentence rather than a heading'
);
check('NEAR MISS: marker heads a line but carries no colon -> DENY, state `no-colon`', nearMiss('TENANCY plugin-eslint is junctioned') === 'no-colon');
check('NEAR MISS: marker declares a DIFFERENT checkout -> DENY, state `unnamed`', nearMiss('TENANCY: b100-am-ui — its own tree.') === 'unnamed');
check(
  'NEAR MISS: `TENANCYWISE:` cannot satisfy `TENANCY`',
  nearMiss('TENANCYWISE: plugin-eslint is fine') === 'buried',
  'the letter test refuses it as a declaration; the word IS in the text, so the state is `buried`'
);
check('marker as a markdown bullet is a declaration', nearMiss(`- TENANCY: plugin-eslint — junction into b100-am-ui.`) === 'allowed');
check('no declaration at all -> state `absent`', nearMiss('Nothing relevant here.') === 'absent');

// ── 3. THE TOKEN SIDE: what counts as mentioning a mutation ─────────────────────────────────────────

check('`npm run ci:lint` is NOT a mutation', mentionedMutations('Run `npm run ci:lint` first.').length === 0, 'the daily command; refusing it is how a guard gets switched off');
check('`npm ci` in prose IS a mutation', mentionedMutations('so `npm ci` exits EUSAGE there').includes('npm ci'));
check('bare unbackticked prose mention IS found', mentionedMutations('their pipelines now use npm install instead').includes('npm install'));
check('a fenced block IS read', mentionedMutations('```\ncd /x && npm prune\n```').includes('npm prune'));
check('npm alias `isntall` IS found (the table is the toolchain guard\'s, not ours)', mentionedMutations('`npm isntall`').length === 1);
check('a brief with no command mentions nothing', mentionedMutations('Fix the accessibility suites and report.').length === 0);
check('a backticked command before an apostrophe IS found', mentionedMutations("Run `npm ci` in the author's repo").includes('npm ci'));
check('a backticked command after an apostrophe IS found', mentionedMutations("don't run `npm ci` here").includes('npm ci'));
check('a backticked command inside a quoted question IS found', mentionedMutations('Ask: "why `npm ci`?" — it\'s the wipe').includes('npm ci'));
check('a fence line itself is not a command', mentionedMutations('```npm install\n```').length === 0);

check(
  'MANDATED: the in-container form is NOT a mutation mention',
  mentionedMutations('Fix both repos with `wsl -e docker run --rm -v ".:/w" -w /w node:22-alpine sh -c "npm ci"`.').length === 0,
  'a worker really fixed both plugin repos this way; blocking it would have blocked the correct fix'
);

check(
  'MANDATED: in-container form + foreign checkout -> allow',
  !deniedBy(`Fix ${PLUGIN_ESLINT} with \`docker run --rm node:22-alpine sh -c "npm ci"\`.`, FARM_LAYOUT)
);

// ── 4. DOCUMENTATION — the guard that forbids writing about itself (seventh face) ───────────────────

const REFUSAL_QUOTE = [
  'TOOLCHAIN-GUARD REFUSED `npm ci`: it would WIPE the shared node_modules before rebuilding it.',
  'USE INSTEAD: npm install — reconciles.',
  'NEVER run `npm ci` on this machine.'
].join('\n');

check(
  'MANDATED: a brief documenting the prohibition, naming no foreign checkout -> allow',
  !deniedBy(`Write this into the contract file verbatim:\n${REFUSAL_QUOTE}\nIt lives at ${MAIN}/.claude/AGENT-LEDGER.md.`, FARM_LAYOUT)
);

check(
  'documenting the prohibition AND naming a foreign checkout, with the declaration -> allow',
  !deniedBy(`TENANCY: plugin-eslint — junction into b100-am-ui; this brief documents, it does not instruct.\nQuote this refusal about ${PLUGIN_ESLINT}:\n${REFUSAL_QUOTE}`, FARM_LAYOUT),
  'a guard whose own documentation it refuses is switched off the day it ships'
);

check(
  'DOCUMENTED COST: documenting it while naming a foreign checkout and NOT declaring -> DENY',
  deniedBy(`Quote this refusal about ${PLUGIN_ESLINT}:\n${REFUSAL_QUOTE}`, FARM_LAYOUT),
  'known false positive, cleared by one line; measured 0 of 334 real texts reach this state'
);

const WORKTREE = `${MAIN}/.claude/worktrees/agent-example`;

check(
  'DOCUMENTED COST: a correct brief forbidding `npm install` in a named agent worktree -> DENY',
  deniedBy(`NEVER run \`npm install\` in ${WORKTREE}.`, { ...FARM_LAYOUT, [WORKTREE]: 'farm' }),
  'a worktree is a junction farm owned by the main checkout — the 2026-09-17 hazard — but this brief was right'
);
check(
  'DOCUMENTED COST: the same worktree brief passes with one TENANCY line',
  !deniedBy(`TENANCY: agent-example — junction farm into b100-am-ui.\nNEVER run \`npm install\` in ${WORKTREE}.`, { ...FARM_LAYOUT, [WORKTREE]: 'farm' })
);

// ── 5. THE VERBATIM INCIDENT REPLAY ─────────────────────────────────────────────────────────────────

/** The incident brief, verbatim, naming whichever two repositories it is replayed against. @es El brief del incidente. */
const incidentBrief = (eslint, stylelint) => [
  'Fix the two lint plugin repositories so their pipelines install cleanly.',
  '',
  'MEASURED (by me, this session): both repos are on develop with no lockfile tracked.',
  'HYPOTHESIS: the install step has never worked in CI.',
  '',
  '## Constraints',
  '',
  `- ${NEVER}`,
  `- ${INCIDENT_SENTENCE}`,
  `- The repositories are ${eslint} and ${stylelint}.`
].join('\n');

const INCIDENT_BRIEF = incidentBrief(PLUGIN_ESLINT, PLUGIN_STYLELINT);

check(
  'REPLAY: the real incident brief is REFUSED',
  deniedBy(INCIDENT_BRIEF, FARM_LAYOUT),
  'the sentence that lifted this machine\'s hardest prohibition on a false premise'
);

check(
  'REPLAY: the refusal cites BOTH plugin repositories, measured',
  (() => {
    const refusal = refusalFor(INCIDENT_BRIEF, constructedProbe(FARM_LAYOUT));

    return refusal !== undefined && refusal.checkouts.length === 2 && refusal.mutations.includes('npm ci');
  })()
);

check(
  'REPLAY: one TENANCY line per repository clears it',
  !deniedBy(
    `TENANCY: plugin-eslint — node_modules is a junction into b100-am-ui/node_modules (Get-Item -Force).\nTENANCY: plugin-stylelint — the same junction.\n${INCIDENT_BRIEF}`,
    FARM_LAYOUT
  ),
  'and an author writing those lines has just read the measurement that refutes the sentence above them'
);

check(
  'DOCUMENTED LIMITATION: the brief WITHOUT the incident sentence is also refused',
  deniedBy(INCIDENT_BRIEF.split(`- ${INCIDENT_SENTENCE}\n`).join(''), FARM_LAYOUT),
  'this guard decides about the BRIEF, never about which sentence wrote the claim — see decision.mjs'
);

check(
  'the incident sentence ALONE, with no path named, is allowed',
  !deniedBy(INCIDENT_SENTENCE, FARM_LAYOUT),
  'the residual gap, stated: a repository named only in words is invisible to named-checkouts.mjs'
);

// ── 5b. THE REFUSAL'S OWN WORDS — correct but unexplained gets routed around ────────────────────────

// An allowed brief has no refusal text. Returning '' rather than calling `reason(undefined)` keeps every
// mutant that turns a refusal into an allow dying on an ASSERTION — a crash would read as a kill while
// proving nothing about the decision, exactly like a syntax error.
const refusalText = (prefix) => {
  const refusal = refusalFor(`${prefix}\n${INCIDENT_BRIEF}`, constructedProbe(FARM_LAYOUT));

  return refusal === undefined ? '' : reason(refusal, 'delegation', 'Agent');
};

// `tree-tenancy.mjs` rejoins a farm's common target with the PLATFORM separator, so the printed line is
// compared in one spelling rather than pinned to the separator this machine happens to use.
check(
  'REFUSAL prints where the foreign tree lands',
  key(refusalText('')).includes(`lands in  : ${key(FOREIGN_TREE)}`),
  'the measurement is the part that does the work'
);
check('REFUSAL prints who owns that tree', refusalText('').includes('owned by  :'));
check('REFUSAL names the `unnamed` near miss', refusalText('TENANCY: b100-am-ui — its own tree.').includes('does not name plugin-eslint'));
check('REFUSAL names the `buried` near miss', refusalText('per the TENANCY: note it is shared.').includes('not at the START of a line'));
check('REFUSAL names the `no-colon` near miss', refusalText('TENANCY plugin-eslint is junctioned').includes('carries no colon'));
check('REFUSAL names every mutation it saw', refusalText('').includes('`npm ci`'));
// Global since 2026-09-30: the line to add names the MEASURED owner, never a hard-coded repository.
// @es Global desde 2026-09-30: la línea a añadir nombra al dueño MEDIDO, nunca un repositorio fijo.
check(
  'REFUSAL suggests a declaration naming the measured owner',
  (() => {
    const refusal = refusalFor(`\n${INCIDENT_BRIEF}`, constructedProbe(FARM_LAYOUT));
    if (refusal === undefined) return false;
    const owner = refusal.checkouts[0].tenancy.owner.split('\\').join('/').split('/').filter((part) => part.length > 0).at(-1);

    return reason(refusal, 'delegation', 'Agent').includes(`node_modules is a junction into ${owner}; nothing is installed there.`);
  })()
);

// ── 6. THE SURFACE — the real hook, on RECORDED harness payloads ────────────────────────────────────

function guardVerdict(payload) {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });

    return { denied: stdout.includes('"permissionDecision":"deny"'), reason: stdout, ran: true };
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';

    return { denied: stdout.includes('"permissionDecision":"deny"'), reason: stdout, ran: false };
  }
}

const { payloadFor, textBearingFields } = await import(PAYLOADS);
const { BRIEF_CARRIERS } = await import(CARRIERS);

// The real hook reads the REAL filesystem, so the machine it reads is BUILT here, with real junctions,
// and every verdict below is asserted outright. It used to read the live plugin checkouts and assert
// only agreement, which could never go red — and could never kill a mutant once those checkouts held
// their own trees (measured; `constructed-machine.mjs` has the numbers).
// @es El hook real lee el sistema de ficheros REAL, así que la máquina que lee se CONSTRUYE aquí y cada
// veredicto se afirma sin condiciones.
const machine = buildIncidentMachine();

process.once('exit', () => {
  try {
    machine.dispose();
  } catch (error) {
    process.stderr.write(`brief-tenancy selftest: the constructed machine was NOT removed (${error.message}); remove ${dirname(machine.main)} by hand\n`);
  }
});

const miswired = machine.verify();

check('MACHINE: every constructed checkout measures, through the REAL probe, as the tenancy it was built with', miswired.length === 0, miswired.join('; '));

const replayed = incidentBrief(machine.pluginEslint, machine.pluginStylelint);
const SURFACE_CASES = [
  ['REPLAY: the incident brief, host `npm ci` into two junction farms, is DENIED', replayed, true],
  ['the prohibition phrasing, naming only the own tree, is ALLOWED', `${NEVER} Junction node_modules to ${machine.main}/node_modules instead.`, false],
  ['the incident brief with one TENANCY line per repository is ALLOWED', `TENANCY: plugin-eslint — junction farm into main/node_modules.\nTENANCY: plugin-stylelint — the same farm.\n${replayed}`, false],
  ['a mutation into a checkout whose node_modules IS a junction is DENIED', `${INCIDENT_SENTENCE} Work in ${machine.linkedCheckout}.`, true]
];

for (const [tool, recording] of [['Agent', 'Agent'], ['Task', 'Agent'], ['SendMessage', 'SendMessage']]) {
  for (const [name, brief, denies] of SURFACE_CASES) {
    const verdict = guardVerdict(payloadFor(recording, brief, { toolName: tool, sessionId: 'brief-tenancy-selftest' }));

    check(`SURFACE ${tool}: ${name}`, verdict.ran && verdict.denied === denies, `ran = ${verdict.ran}, denied = ${verdict.denied}`);
  }

  const replay = guardVerdict(payloadFor(recording, replayed, { toolName: tool, sessionId: 'brief-tenancy-selftest' }));

  check(`SURFACE ${tool}: the refusal names BOTH constructed repositories`, replay.reason.includes('plugin-eslint') && replay.reason.includes('plugin-stylelint'), replay.reason);
  check(
    `SURFACE ${tool}: the payload carries the brief in a field the harness really uses`,
    textBearingFields(recording).length > 0 && JSON.stringify(payloadFor(recording, replayed, { toolName: tool, sessionId: 'brief-tenancy-selftest' }).tool_input).includes('independent trees')
  );
}

check(
  'SURFACE SendMessage: its text is NOT in `prompt` (the measured 2026-09-14 trap)',
  !textBearingFields('SendMessage').includes('prompt'),
  'a fixture using `prompt` would agree with the guard by construction and prove nothing'
);

/**
 * Whether the real hook DENIES `payload` when the user's home holds no install at all. The guard is part of
 * this repository, so it must find its sibling modules beside itself: a guard that located them through the
 * home failed OPEN in every home without the install, which is exactly how the incident replay passed
 * unguarded inside the selftest sandbox. The scratch home is removed on every path.
 * @es Si el hook real DENIEGA `payload` cuando el home del usuario no tiene ninguna instalación. La guardia es
 * parte de este repositorio, así que debe hallar sus módulos hermanos junto a sí misma: una guardia que los
 * buscaba por el home fallaba ABIERTO en todo home sin la instalación, y así pasaba sin guardia la repetición
 * del incidente dentro del sandbox de los selftests. El home de prueba se elimina en todos los caminos.
 */
function deniedUnderAnEmptyHome(payload) {
  const home = mkdtempSync(join(tmpdir(), 'brief-tenancy-empty-home-'));

  try {
    const env = { ...process.env, HOME: home, USERPROFILE: home, [CLAUDE_HOME_VARIABLE]: join(home, '.claude') };
    const stdout = execFileSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000, env });

    return stdout.includes('"permissionDecision":"deny"');
  } catch {
    return false;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

check(
  'HOME-INDEPENDENT: the incident replay is DENIED when the home holds no install',
  deniedUnderAnEmptyHome(payloadFor('Agent', replayed, { toolName: 'Agent', sessionId: 'brief-tenancy-selftest' })),
  'a guard that imported its carrier map through the home failed OPEN here, silently'
);

check('SURFACE: a non-carrier tool (Bash) is untouched',!guardVerdict(payloadFor('Bash', 'npm ci', { toolName: 'Bash', sessionId: 'brief-tenancy-selftest' })).denied);

// ── 7. FAILS OPEN ───────────────────────────────────────────────────────────────────────────────────

const runsWithInput = (input) => {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });

    return !stdout.includes('"permissionDecision":"deny"');
  } catch {
    return false;
  }
};

check('FAIL OPEN: unparseable stdin', runsWithInput('not json at all'));
check('FAIL OPEN: empty stdin', runsWithInput(''));
check('FAIL OPEN: payload with no tool_input', runsWithInput(JSON.stringify({ tool_name: 'Agent' })));
check('FAIL OPEN: brief that is not a string', runsWithInput(JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: 42 } })));
check('FAIL OPEN: empty brief', runsWithInput(JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: '   ' } })));
check(
  'a UTF-8 BOM does not stop the decision',
  (() => {
    const payload = `﻿${JSON.stringify(payloadFor('Agent', replayed, { toolName: 'Agent', sessionId: 'brief-tenancy-selftest' }))}`;

    try {
      const stdout = execFileSync(process.execPath, [GUARD], { input: payload, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });

      return stdout.includes('"permissionDecision":"deny"');
    } catch {
      return false;
    }
  })(),
  'a PowerShell-written payload carries one, and a swallowed throw once stopped a sibling guard guarding'
);

// ── 8. REGISTRATION AND ITS DEPENDENCIES ────────────────────────────────────────────────────────────

const declared = JSON.parse(readFileSync(`${GUARD}.hook-registration.json`, 'utf8'));
const matcher = declared.registrations[0].matcher.split('|').sort().join('|');

check('REGISTRATION: declared for PreToolUse', declared.registrations.every((registration) => registration.event === 'PreToolUse'));
check(
  'REGISTRATION: the declared matcher is exactly the set of claim-bearing tools',
  matcher === Object.keys(BRIEF_CARRIERS).sort().join('|'),
  `declared ${matcher}, carriers ${Object.keys(BRIEF_CARRIERS).sort().join('|')}`
);
check('DEPENDENCY: the carrier map resolves beside this checkout', existsSync(CARRIERS_PATH));
check('DEPENDENCY: the recorded payload store resolves beside this checkout', existsSync(PAYLOADS_PATH));

// ── 9. THE PARTS, DIRECTLY ──────────────────────────────────────────────────────────────────────────

check('named-checkouts: a tree path folds onto its checkout', namedCheckouts(`see ${MAIN}/node_modules/typescript`)[0] === MAIN);
check('named-checkouts: a quoted path stops at the quote', namedCheckouts(`"${PLUGIN_ESLINT}", then run`)[0] === PLUGIN_ESLINT);
check('named-checkouts: a bare drive is not a checkout', namedCheckouts('on C:/ there is space').length === 0);
check('named-checkouts: a word ending in a letter before `:/` is not a path', namedCheckouts('see https://example.com/x').length === 0);
check('named-checkouts: backslash spelling is found', namedCheckouts(`see ${PLUGIN_ESLINT.split('/').join(BACK)}`)[0] === PLUGIN_ESLINT);
check('tenancy-declaration: CRLF lines are read', declarationOf(`TENANCY: plugin-eslint — junction.\r\nmore`, PLUGIN_ESLINT) === 'present');

// ── VERDICT ─────────────────────────────────────────────────────────────────────────────────────────

const total = passed + failures.length;

console.log(`lesson: ${LESSON_KEY}`);
console.log('surface machine: constructed (plugin-eslint and plugin-stylelint as junction farms, one linked checkout)');

if (failures.length > 0) {
  console.log('\nFAILED:');
  for (const failure of failures) console.log(`  - ${failure}`);
}

// The tally is the LAST line on every path: the mutation runner reports a run by its final line.
console.log(`brief-tenancy selftest: ${passed}/${total}`);
process.exit(failures.length === 0 ? 0 : 1);
