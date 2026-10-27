#!/usr/bin/env node
/**
 * The decisions of brief-feasibility's two worker faces (`worker-git.mjs`, `shell-less-role.mjs`, their wiring in
 * `feasibility.mjs` and their titles in `guard.mjs`), each broken once, that `worker-git.selftest.mjs` must catch. A
 * separate campaign from `mutants.mjs` because that one's selftest reads the owner's Windows settings file; this
 * selftest reads no real settings and runs on every platform.
 *
 * @es Las decisiones de las dos caras de worker de brief-feasibility, rotas una a una, que `worker-git.selftest.mjs`
 * debe cazar. Campaña aparte de `mutants.mjs` porque el selftest de aquella lee el fichero de ajustes de Windows del
 * dueño; este no lee ajustes reales y corre en toda plataforma.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const W = 'brief-feasibility/worker-git.mjs';
const R = 'brief-feasibility/shell-less-role.mjs';
const F = 'brief-feasibility/feasibility.mjs';
const I = 'brief-feasibility/instructions.mjs';
const G = 'brief-feasibility/guard.mjs';

const MUTANTS = [
  // --- worker-git: the guard's own decision, asked at delegation time
  ['only bash is asked', W, "const DIALECTS = ['bash', 'powershell'];", "const DIALECTS = ['bash'];"],
  ['only powershell is asked', W, "const DIALECTS = ['bash', 'powershell'];", "const DIALECTS = ['powershell'];"],
  ['a refusal of the guard is ignored', W, '    if (refused.length > 0) return refused[0];', '    if (false) return refused[0];'],
  ['a decision that throws blocks the delegation', W, '    } catch {\n      refused = [];\n    }', '    } catch (error) {\n      throw error;\n    }'],
  ['the decision is asked from another directory', W, 'refused = decide(script, dialect, cwd);', 'refused = decide(script, dialect, process.cwd());'],
  ['the route is the whole refusal, not its USE INSTEAD paragraph', W, 'lines.slice(lines.findIndex((line) => line.startsWith(ROUTE_LEADS[language]))).join', 'lines.slice(0).join'],
  ['the Spanish route is not found', W, "es: 'USAR EN SU LUGAR'", "es: 'USE INSTEAD'"],
  ['the route loses its Spanish half', W, "return `${half('en')} @es ${half('es')}`;", "return half('en');"],
  ['every family gets the reset route', W, 'alternative: routeOf(refused.family)', "alternative: routeOf('reset')"],
  ['the finding does not name the family', W, 'by worker-git-guard (family ${refused.family}) @es', 'by worker-git-guard @es'],
  ['the finding loses its Spanish half', W, ' @es worker-git-guard rechaza \\`${refused.text.trim()}\\` a todo worker delegado (familia ${refused.family})`', '`'],
  ['the finding names the wrong line', W, 'return [{ lineNumber, line, detail:', 'return [{ lineNumber: lineNumber + 1, line, detail:'],

  // --- shell-less role
  ['git is no shell program', R, "const SHELL_PROGRAMS = new Set(['git', 'npm']);", "const SHELL_PROGRAMS = new Set(['npm']);"],
  ['npm is no shell program', R, "const SHELL_PROGRAMS = new Set(['git', 'npm']);", "const SHELL_PROGRAMS = new Set(['git']);"],
  ['Agent names no role', R, "const DELEGATION_TOOLS = new Set(['Agent', 'Task']);", "const DELEGATION_TOOLS = new Set(['Task']);"],
  ['Task names no role', R, "const DELEGATION_TOOLS = new Set(['Agent', 'Task']);", "const DELEGATION_TOOLS = new Set(['Agent']);"],
  ['a resume is read as a delegation', R, 'if (!DELEGATION_TOOLS.has(payload?.tool_name) || !isRoleName(role)) return [];', 'if (!isRoleName(role)) return [];'],
  ['a role name that leaves the agents folder is read', R, "[...name].every((character) => ROLE_CHARACTERS.includes(character))", 'true'],
  ['the user definition wins over the project one', R, "for (const file of [join(mainCheckout, '.claude', 'agents', `${role}.md`), join(home, 'agents', `${role}.md`)]) {", "for (const file of [join(home, 'agents', `${role}.md`), join(mainCheckout, '.claude', 'agents', `${role}.md`)]) {"],
  ['the project definition is never read', R, "for (const file of [join(mainCheckout, '.claude', 'agents', `${role}.md`), join(home, 'agents', `${role}.md`)]) {", "for (const file of [join(home, 'agents', `${role}.md`)]) {"],
  ['an unreadable declaration is judged as if it were read', R, 'declaration === undefined || declaration.problem !== undefined || EXECUTION_TOOLS', 'declaration === undefined || EXECUTION_TOOLS'],
  ['a role with a shell tool is refused all the same', R, '|| EXECUTION_TOOLS.some((tool) => reaches(declaration, tool))) return [];', ') return [];'],
  ['a role with no definition is refused', R, 'if (declaration === undefined || declaration.problem', 'if (declaration?.problem'],
  ['the program is the first word, not the one past its launcher', R, 'const at = resolveCommand(words).index;', 'const at = 0;'],
  ['the finding does not name the definition file', R, 'the role ${role} (${definition.file}) reaches no', 'the role ${role} reaches no'],
  ['the finding loses its Spanish half', R, ' @es \\`${text.trim()}\\` ejecuta ${program}, y el rol ${role} (${definition.file}) no alcanza ninguna herramienta ${EXECUTION_TOOLS.join(\' / \')}`', '`'],
  ['the alternative loses its Spanish half', R, " @es ejecuta el comando tú mismo y pon su salida en el brief, o delega en un rol que declare ${EXECUTION_TOOLS.join(' o ')}`", '`'],

  // --- order or mention
  ['every reference is an order', I, '    readings.set(start, order);', '    readings.set(start, true);'],
  ['no reference is an order', I, '    readings.set(start, order);', '    readings.set(start, false);'],
  ['a list does not carry its order', I, 'const order = continuesAnOrder || ', 'const order = '],
  ['a mention carries along a list', I, 'previous.from === from && previous.order;', 'previous.from === from;'],
  ['a list runs past its clause', I, 'previous !== undefined && previous.from === from && previous.order', 'previous !== undefined && previous.order'],
  ['no cue orders anything', I, '[...own, ...lead].some((word) => ORDER_CUES.has(word))', 'false'],
  ['the clause a colon opens a list with is not read', I, "const lead = from > 0 && prose.charAt(from - 1) === ':' ?", "const lead = false ?"],
  ['a span that heads its clause is no order', I, "|| (own.length === 0 && prose.charAt(from - 1) !== '(')", ''],
  ['a parenthesis opens no aside', I, " && prose.charAt(from - 1) !== '(')", ')'],
  ['run is no order cue', I, "'run', 'rerun',", "'rerun',"],
  ...['rerun', 'verify', 'then', 'finally', 'usa', 'luego'].map((cue) => [`${cue} is no order cue`, I, `'${cue}',`, '']),
  ['instructedCommands returns mentions too', I, 'referencedCommands(text).filter((reference) => reference.order)', 'referencedCommands(text)'],
  ['a span reference is never kept as a mention', I, "via: 'code span', order: orders.get(span.start),", "via: 'code span', order: true,"],
  ['the path face reads only orders', F, 'relativeToolingPaths(referencedCommands(brief.text), location)', 'relativeToolingPaths(instructions, location)'],

  // --- the wiring and the refusal text
  ['the worker-git face is never asked', F, '    ...workerGitRefusals(instructions, location.mainCheckout).map((finding) => ({ face: FACES.WORKER_GIT_REFUSED, ...finding })),\n', ''],
  ['the shell-less face is never asked', F, "    ...shellLessRoleRefusals(instructions, payload, location.mainCheckout, home === undefined ? undefined : join(home, '.claude')).map((finding) => ({ face: FACES.SHELL_LESS_ROLE, ...finding })),\n", ''],
  ['the shell-less face reads the user home instead of its Claude home', F, "home === undefined ? undefined : join(home, '.claude')", 'home'],
  ['the worker-git face is labelled as a denied command', F, '({ face: FACES.WORKER_GIT_REFUSED, ...finding })', '({ face: FACES.DENIED_COMMAND, ...finding })'],
  ['the worker-git face is not named', G, "'WORKER GIT REFUSED — ", "'GIT — "],
  ['the worker-git face loses its Spanish half', G, '@es GIT RECHAZADO AL WORKER — ', '@es GIT — '],
  ['the shell-less face is not named', G, "'SHELL-LESS ROLE — ", "'ROLE — "],
  ['the shell-less face loses its Spanish half', G, '@es ROL SIN SHELL — ', '@es ROL — '],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['brief-feasibility', 'brief-provenance', 'hook-io', 'hook-payloads', 'shell-command', 'hook-state', 'bilingual-output', 'mutation-proof', 'worker-git-guard', 'agent-toolset-check', 'agents', 'cherry-pick-guard', 'company-remote', 'hook-caller', 'write-targets'],
  selftest: 'brief-feasibility/worker-git.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
