#!/usr/bin/env node
/**
 * Self-test for the two worker faces of brief-feasibility: `worker-git-refused` (`worker-git.mjs`) and
 * `shell-less-role` (`shell-less-role.mjs`). It runs on any platform: no real settings file is read.
 *
 * PARITY, the claim the first face rests on: every command worker-git-guard's own selftest REFUSES, written into a
 * brief, is refused here. The commands are not copied: the guard's selftest is RUN with `parity-recorder.mjs`
 * loaded, which records every call to the guard's decision with its answer, and each refused one is replayed as a
 * brief. A recorder run that fails, or records nothing, is a failed measurement and fails this proof, never a pass.
 *
 * Then each face's state space: the incident shapes (`git switch`, `git checkout -- <path>`), a command refused in one
 * dialect only, the fail-open of the decision, the refusal text; and for the shell-less role, the real `jd-judge-a`
 * definition, a project definition that overrides the user one, and every near miss that must pass.
 *
 * @es Auto-test de las dos caras de worker de brief-feasibility. PARIDAD: cada comando que RECHAZA el selftest del
 * propio worker-git-guard, escrito en un brief, se rechaza aquí; los comandos no se copian, se graban corriendo ese
 * selftest con `parity-recorder.mjs`. Una grabación que falla o no graba nada es una medición fallida y hace fallar
 * esta prueba. Después, el espacio de estados de cada cara, sus casos reales y sus casi-aciertos.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { briefOf } from '../brief-provenance/provenance.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { CLAUDE_HOME_VARIABLE, isolateState } from '../hook-state/locations.mjs';
import { forbiddenInvocations } from '../worker-git-guard/forbidden-invocations.mjs';
import { DECISION_LOG_VARIABLE } from './parity-recorder.mjs';
import { FACES, inspectFeasibility } from './feasibility.mjs';
import { evaluate } from './guard.mjs';
import { instructedCommands } from './instructions.mjs';
import { shellLessRoleRefusals } from './shell-less-role.mjs';
import { routeOf, workerGitRefusals } from './worker-git.mjs';

isolateState('brief-feasibility');

const HERE = dirname(fileURLToPath(import.meta.url));
const FLEET = join(HERE, '..');
const world = mkdtempSync(join(tmpdir(), 'brief-feasibility-worker-'));

process.once('exit', () => rmSync(world, { recursive: true, force: true }));

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failed += 1;

  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition || detail === '' ? '' : `\n      ${String(detail).slice(0, 400)}`}`);
}

// A user home with no settings and a Claude home with the fixture roles, so no real file decides anything here.
// @es Un home sin ajustes y un home de Claude con los roles de prueba: ningún fichero real decide nada aquí.
const home = join(world, 'home');
const checkout = join(world, 'checkout');
const role = (folder, name, tools) => {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${name}.md`), `---\nname: ${name}\ndescription: fixture role\ntools: ${tools}\n---\n\nFixture.\n`);
};

role(join(home, '.claude', 'agents'), 'reader', 'Read, Glob, Grep');
role(join(home, '.claude', 'agents'), 'runner', 'Read, Bash');
role(join(home, '.claude', 'agents'), 'runner-ps', 'Read, PowerShell');
role(join(home, '.claude', 'agents'), 'every-tool', '[]');
role(join(home, '.claude', 'agents'), 'unreadable', '[Read, Grep]');
role(join(home, '.claude', 'agents'), 'overridden', 'Read, Bash');
role(join(checkout, '.claude', 'agents'), 'overridden', 'Read, Grep');
role(join(checkout, '.claude', 'agents'), 'project-runner', 'Read, Bash');
role(join(home, '.claude', 'agents'), 'project-runner', 'Read');

/** A delegation carrying `text`, from `cwd`, to `subagentType`. @es Una delegación con `text`, desde `cwd`, a `subagentType`. */
const delegation = (text, { cwd = checkout, subagentType = 'general-purpose', tool = 'Agent' } = {}) => ({ ...payloadFor(tool === 'Task' ? 'Agent' : tool, text, { sessionId: 'selftest', toolName: tool, input: tool === 'SendMessage' ? {} : { subagent_type: subagentType } }), cwd });

/** The findings of `face` for a payload. @es Los hallazgos de `face` para un payload. */
function findingsOf(payload, face, options = {}) {
  try {
    const refusal = inspectFeasibility(briefOf(payload), payload, { processCwd: payload.cwd, home: options.home ?? home });

    return (refusal?.findings ?? []).filter((finding) => finding.face === face);
  } catch (error) {
    // A throw is a wrong answer, read as one: never a crash that would hide which check it broke.
    // @es Una excepción es una respuesta equivocada y se lee como tal, nunca un fallo que oculte qué comprobación rompió.
    return [{ face, threw: String(error) }];
  }
}

const fenced = (script) => `Do this step:\n\`\`\`\n${script}\n\`\`\``;

// ---------------------------------------------------------------------------------------------------
// PARITY: the guard's own refused fixtures, recorded from its own selftest.
// @es PARIDAD: los fixtures rechazados del propio guard, grabados de su propio selftest.
// ---------------------------------------------------------------------------------------------------
{
  const log = join(world, 'decisions.jsonl');

  writeFileSync(log, '');

  const run = spawnSync(process.execPath, [join(FLEET, 'worker-git-guard', 'selftest.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, [DECISION_LOG_VARIABLE]: log, NODE_OPTIONS: `--import=${pathToFileURL(join(HERE, 'parity-recorder.mjs')).href}` },
    maxBuffer: 64 * 1024 * 1024
  });
  const recorded = readFileSync(log, 'utf8').split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line));
  const refused = [...new Map(recorded.filter(({ families }) => families.length > 0).map((call) => [`${call.dialect}\u0000${call.cwd}\u0000${call.script}`, call])).values()];

  check('the guard selftest ran green under the recorder (a red or killed run is no measurement)', run.status === 0, `${run.status} ${run.stdout.slice(-300)} ${run.stderr.slice(-300)}`);
  check('the recorder recorded the guard selftest\'s decisions, some of them refusals', recorded.length > 0 && refused.length > 0, `${recorded.length} calls, ${refused.length} refused`);
  const unreplayed = refused.filter(({ brief }) => brief === undefined || typeof brief.fenced !== 'boolean');

  check('every recorded refusal was replayed as a brief while its sandbox existed', unreplayed.length === 0, unreplayed.slice(0, 3).map(({ script }) => script).join(' | '));

  const misses = refused.filter(({ brief }) => brief?.fenced !== true);

  check(`PARITY: every one of the ${refused.length} distinct commands the guard's selftest refuses is refused in a brief`, misses.length === 0, misses.slice(0, 5).map(({ script }) => script).join(' | '));

  const inSpans = refused.filter(({ script }) => !script.includes('`'));
  const spanMisses = inSpans.filter(({ brief }) => brief?.span !== true);

  check(`PARITY: the ${inSpans.length} with no backtick are refused in an inline code span too`, inSpans.length > 0 && spanMisses.length === 0, spanMisses.slice(0, 5).map(({ script }) => script).join(' | '));

  // Both dialects are asked: a command the guard refuses in only one of them is still refused in a brief.
  // @es Se preguntan los dos dialectos: un comando que el guard rechaza solo en uno se rechaza igual en un brief.
  for (const [only, other] of [['powershell', 'bash'], ['bash', 'powershell']]) {
    const single = refused.find(({ script, dialect, cwd }) => dialect === only && forbiddenInvocations(script, other, cwd).length === 0);

    check(`a command the guard refuses in ${only} only exists among its fixtures, and a brief refuses it`, single !== undefined && findingsOf(delegation(fenced(single.script), { cwd: single.cwd }), FACES.WORKER_GIT_REFUSED).length === 1, single?.script);
  }
}

// ---------------------------------------------------------------------------------------------------
// The incident shapes, near misses and the refusal text.
// @es Las formas del incidente, los casi-aciertos y el texto del rechazo.
// ---------------------------------------------------------------------------------------------------
const gitFindings = (text) => findingsOf(delegation(text), FACES.WORKER_GIT_REFUSED);

check('INCIDENT: a brief that asks for `git switch -c` is refused', gitFindings('Start with `git switch -c feature/x develop`.').length === 1);
check('INCIDENT: a brief that asks for `git checkout -- <path>` is refused', gitFindings('Undo it: `git checkout -- src/a.ts`.').length === 1);
check('an imperative line with no span is read too', gitFindings('Run git switch main before you start.').length === 1);
check('the finding names the line it is on', gitFindings('Context.\nStart with `git switch main`.')[0]?.lineNumber === 2);
check('the finding names the guard and the family', gitFindings('Start with `git switch main`.')[0]?.detail.includes('worker-git-guard (family checkout)'));
check('the finding carries its Spanish half', gitFindings('Start with `git switch main`.')[0]?.detail.includes('@es worker-git-guard rechaza `git switch main`'));
check('the alternative is the route the guard itself gives, in both halves', gitFindings('Start with `git reset --soft HEAD~1`.')[0]?.alternative === routeOf('reset'));
check('the alternative of each family is that family\'s route', gitFindings('Start with `git switch main`.')[0]?.alternative === routeOf('checkout'));
check('the route of a family is its USE INSTEAD paragraph and its Spanish mirror', routeOf('reset').startsWith('USE INSTEAD: to unstage') && routeOf('reset').includes(' @es USAR EN SU LUGAR: para quitar del índice'));
check('NEAR MISS: `git switch` stated as denied in its own clause passes', gitFindings('`git switch main` is denied to you; stay on your branch.').length === 0);
check('NEAR MISS: a quoted order is data', gitFindings('The old brief said "Run `git switch main`." and it was wrong.').length === 0);
check('NEAR MISS: allowed git commands pass', gitFindings('Run `git status` and `git restore --staged -- a.txt`, then `git commit -m x -- a.txt`.').length === 0);
check('one finding per instruction, not one per dialect', gitFindings('Start with `git reset --hard`.').length === 1);
check('a decision that throws is read as no refusal (fail open)', workerGitRefusals([{ lineNumber: 1, line: 'x', script: 'git reset' }], checkout, () => { throw new Error('boom'); }).length === 0);
check('the decision is asked with the main checkout the brief comes from', (() => {
  const asked = [];

  workerGitRefusals([{ lineNumber: 1, line: 'x', script: 'git status' }], '/repo', (script, dialect, cwd) => (asked.push(cwd), []));

  return asked.length === 2 && asked.every((cwd) => cwd === '/repo');
})());

{
  const reason = evaluate(JSON.stringify(delegation('Start with `git switch main`.')))?.hookSpecificOutput?.permissionDecisionReason ?? '';

  check('the guard names the face', reason.includes('WORKER GIT REFUSED — worker-git-guard refuses this git command'));
  check('the guard names the face in Spanish too', reason.includes('@es GIT RECHAZADO AL WORKER'));
}

// ---------------------------------------------------------------------------------------------------
// SHELL-LESS ROLE.
// @es ROL SIN SHELL.
// ---------------------------------------------------------------------------------------------------
const roleFindings = (text, subagentType, options = {}) => findingsOf(delegation(text, { subagentType, tool: options.tool }), FACES.SHELL_LESS_ROLE, options);

check('a read-only role told to run git is refused', roleFindings('Run `git diff develop` and judge it.', 'reader').length === 1);
check('a read-only role told to run npm is refused', roleFindings('Run `npm test` first.', 'reader').length === 1);
check('a git behind a launcher still counts', roleFindings('Run `timeout 60 git log -5`.', 'reader').length === 1);
check('the older tool name Task is a delegation too', roleFindings('Run `git diff`.', 'reader', { tool: 'Task' }).length === 1);
check('the finding names the role and its definition file', roleFindings('Run `git diff`.', 'reader')[0]?.detail.includes(`the role reader (${join(home, '.claude', 'agents', 'reader.md')}) reaches no Bash / PowerShell tool`));
check('the finding carries its Spanish half', roleFindings('Run `git diff`.', 'reader')[0]?.detail.includes('@es `git diff` ejecuta git, y el rol reader'));
check('the alternative names a route in both halves', roleFindings('Run `git diff`.', 'reader')[0]?.alternative.includes('run the command yourself and put its output in the brief') && roleFindings('Run `git diff`.', 'reader')[0]?.alternative.includes('@es ejecuta el comando tú mismo'));
check('a project definition overrides the user one (project reaches no shell)', roleFindings('Run `git diff`.', 'overridden').length === 1);
check('a project definition overrides the user one (project reaches Bash)', roleFindings('Run `git diff`.', 'project-runner').length === 0);
// The fleet tree is the Claude home of the real definitions: `jd-judge-a` declares Read, Glob, Grep and two memory reads.
// @es El árbol de la flota es el home de Claude de las definiciones reales.
{
  const real = shellLessRoleRefusals(instructedCommands('Run `git diff develop`.'), delegation('x', { subagentType: 'jd-judge-a' }), checkout, FLEET);

  check('REAL: jd-judge-a, as this fleet defines it, is refused git', real.length === 1 && real[0].detail.includes(join(FLEET, 'agents', 'jd-judge-a.md')), JSON.stringify(real));
}

{
  const previous = process.env[CLAUDE_HOME_VARIABLE];

  process.env[CLAUDE_HOME_VARIABLE] = join(home, '.claude');

  const reason = evaluate(JSON.stringify(delegation('Run `git diff`.', { subagentType: 'reader' })))?.hookSpecificOutput?.permissionDecisionReason ?? '';

  if (previous === undefined) delete process.env[CLAUDE_HOME_VARIABLE];
  else process.env[CLAUDE_HOME_VARIABLE] = previous;

  check('the guard names the shell-less face', reason.includes('SHELL-LESS ROLE — the delegated role declares no tool that runs a command'));
  check('the guard names the shell-less face in Spanish too', reason.includes('@es ROL SIN SHELL'));
}

check('NEAR MISS: a role with Bash passes', roleFindings('Run `git diff`.', 'runner').length === 0);
check('NEAR MISS: a role with PowerShell passes', roleFindings('Run `git diff`.', 'runner-ps').length === 0);
check('NEAR MISS: a role with every tool passes', roleFindings('Run `git diff`.', 'every-tool').length === 0);
check('NEAR MISS: an unreadable declaration is left alone (fail open)', roleFindings('Run `git diff`.', 'unreadable').length === 0);
check('NEAR MISS: a role with no definition file (a built-in type) is left alone', roleFindings('Run `git diff`.', 'general-purpose').length === 0);
check('NEAR MISS: a role name that could leave the agents folder is not read', roleFindings('Run `git diff`.', '../agents/reader').length === 0);
check('NEAR MISS: a prohibition passes', roleFindings('Do not run `git diff`; read the files.', 'reader').length === 0);
check('NEAR MISS: a command that is neither git nor npm passes', roleFindings('Read `src/a.ts` and `node x.mjs` output.', 'reader').length === 0);
check('NEAR MISS: a resume names no role', findingsOf(delegation('Run `git diff`.', { tool: 'SendMessage' }), FACES.SHELL_LESS_ROLE).length === 0);

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
