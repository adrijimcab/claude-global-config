#!/usr/bin/env node
/**
 * Proof that `check.mjs` DISCRIMINATES (`delegated-role-toolset-narrower-than-its-contract`). Each case
 * builds its own `agents/` directory in a temporary folder, so the verdict never depends on what the live
 * tree holds; the last cases run over the real `agents/` and refuse to pass over an empty directory.
 *
 * The state space the decision ranges over, in both directions of every profile. MUST: an executor with Bash
 * / with PowerShell / with neither; a blind reviewer that loses Read; `tools: []`. MUST NOT: a blind reviewer
 * that gains Bash, Write, Edit or a web tool; `tools: []` where the profile forbids tools, with and without the
 * `disallowedTools:` that closes it. Reading: a near-miss token (`BashOutput`); no `tools:` line; no
 * frontmatter; a `tools:` line in the body that must not count; a `disallowedTools:` that blocks a tool the
 * profile needs; CRLF line endings. Who is judged: a role nobody classified; a role naming no known profile;
 * a classified role whose file is gone; a non-markdown file; a missing directory. And the profiles
 * themselves: each constrains something (none is an exemption in disguise) and none contradicts itself.
 *
 * @es Prueba de que `check.mjs` DISCRIMINA. Cada caso construye su propio `agents/` temporal; los últimos
 * casos corren sobre el `agents/` real y se niegan a pasar con un directorio vacío. Espacio de estados, en
 * ambos sentidos de cada perfil. DEBE: un ejecutor con Bash / con PowerShell / con ninguno; un revisor
 * ciego que pierde Read; `tools: []`. NO DEBE: un revisor ciego que gana Bash, Write, Edit o una
 * herramienta web; `tools: []`
 * donde el perfil prohíbe herramientas, con y sin el `disallowedTools:` que lo cierra. Lectura: un
 * casi-acierto (`BashOutput`); sin línea `tools:`; sin frontmatter; una línea `tools:` en el cuerpo que no
 * debe contar; un `disallowedTools:` que bloquea una herramienta que el perfil necesita; finales CRLF.
 * Quién se juzga: un rol sin clasificar; un rol con un perfil desconocido; un rol clasificado sin fichero;
 * un fichero no markdown; un directorio ausente. Y los perfiles: cada uno restringe algo (ninguno es una
 * exención disfrazada) y ninguno se contradice.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROFILES, ROLE_POLICY, declarationOf, rolesIn, toolsetGaps } from './check.mjs';

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** A role file with the given frontmatter lines and body. @es Un fichero de rol con líneas de frontmatter y cuerpo. */
function role(frontmatter, body = 'Do the work.') {
  return `---\nname: x\n${frontmatter.join('\n')}\n---\n\n${body}\n`;
}

/** The role names that carry `profile`. @es Los nombres de rol que llevan `profile`. */
const rolesWith = (profile) => Object.keys(ROLE_POLICY).filter((name) => ROLE_POLICY[name] === profile);

/** One file that satisfies each profile. @es Un fichero que cumple cada perfil. */
const COMPLIANT = {
  executor: role(['tools: Read, Bash, Grep']),
  'blind-reviewer': role(['tools: Read, Glob, Grep']),
};
const FORBIDDEN_TO_BLIND = ['Bash', 'PowerShell', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch'];

/** Runs the check over a fresh agents directory holding `overrides` on top of a fully compliant set. @es Corre el check sobre un `agents/` fresco. */
function gapsOf(overrides = {}, { without = [], extra = {}, policy = ROLE_POLICY } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'agent-toolset-check-'));
  const directory = path.join(base, 'agents');
  mkdirSync(directory);
  try {
    const files = { ...Object.fromEntries(Object.keys(ROLE_POLICY).map((name) => [name, COMPLIANT[ROLE_POLICY[name]]])), ...overrides };
    for (const name of without) delete files[name];
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(directory, `${name}.md`), text);
    for (const [name, text] of Object.entries(extra)) writeFileSync(path.join(directory, name), text);

    return toolsetGaps(directory, policy);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

check('a fully compliant set has no gaps', gapsOf().length === 0);

// --- MUST: the executor reaches a command runner.
const withoutBash = gapsOf({ 'jd-fix-agent': role(['tools: Read, Grep, Glob, WebFetch']) });
check('an executor that declares no command runner is a gap', withoutBash.length === 1 && withoutBash[0].role === 'jd-fix-agent');
check('the gap says why', withoutBash[0]?.problem.includes('Bash'));
check('PowerShell satisfies the need', gapsOf({ 'review-risk': role(['tools: Read, PowerShell']) }).length === 0);
check('Bash satisfies the need', gapsOf({ 'review-resilience': role(['tools: Bash']) }).length === 0);
check('tools: [] means every tool and satisfies the need', gapsOf({ 'review-risk': role(['tools: []']) }).length === 0);
check('BashOutput is not Bash', gapsOf({ 'review-readability': role(['tools: Read, BashOutput, KillShell']) }).length === 1);
check('a token that merely contains Bash is not Bash', gapsOf({ 'review-reliability': role(['tools: Read, NotBash']) }).length === 1);
check('an executor may carry web tools: its profile does not forbid them', gapsOf({ 'jd-fix-agent': role(['tools: Read, Bash, WebFetch, WebSearch']) }).length === 0);

check('an executor whose disallowedTools blocks its command runners is a gap', gapsOf({ 'jd-fix-agent': role(['tools: []', 'disallowedTools: Bash, PowerShell']) }).length === 1);

// --- MUST and MUST NOT: the blind reviewer reads, changes nothing and runs nothing.
check('a blind reviewer with read tools only is not a gap', gapsOf({ 'jd-judge-a': role(['tools: Read, Glob']) }).length === 0);
for (const forbidden of FORBIDDEN_TO_BLIND) {
  const gained = gapsOf({ 'jd-judge-b': role([`tools: Read, Glob, Grep, ${forbidden}`]) });
  check(`a blind reviewer that gains ${forbidden} is a gap that names it`, gained.length === 1 && gained[0].role === 'jd-judge-b' && gained[0].problem.includes(forbidden));
}
check('a blind reviewer that gains several forbidden tools is still one gap', gapsOf({ 'jd-judge-a': role(['tools: Read, Bash, Write']) }).length === 1);
check('a blind reviewer with tools: [] reaches everything and is a gap', gapsOf({ 'jd-judge-a': role(['tools: []']) }).length === 1);
check('tools: [] closed by a disallowedTools naming every forbidden tool is not a gap', gapsOf({ 'jd-judge-a': role(['tools: []', `disallowedTools: ${FORBIDDEN_TO_BLIND.join(', ')}`]) }).length === 0);
check('tools: [] closed by a disallowedTools that leaves one forbidden tool open is a gap', gapsOf({ 'jd-judge-a': role(['tools: []', `disallowedTools: ${FORBIDDEN_TO_BLIND.slice(0, -1).join(', ')}`]) }).length === 1);
check('a forbidden tool that is also disallowed is not reached', gapsOf({ 'jd-judge-a': role(['tools: Read, Bash', 'disallowedTools: Bash']) }).length === 0);
const blindNoRead = gapsOf({ 'jd-judge-a': role(['tools: Glob, Grep']) });
check('a blind reviewer that loses Read is a gap that names it', blindNoRead.length === 1 && blindNoRead[0].problem.includes('Read'));
check('a blind reviewer with a near-miss Write token is not a gap', gapsOf({ 'jd-judge-a': role(['tools: Read, WriteLog']) }).length === 0);

// --- what is read.
check('no tools line is a gap, not a pass', gapsOf({ 'jd-fix-agent': role(['model: sonnet']) }).length === 1);
check('no tools line is a gap for a blind reviewer too', gapsOf({ 'jd-judge-b': role(['model: opus']) }).length === 1);
check('no frontmatter is a gap, not a pass', gapsOf({ 'review-risk': 'tools: Bash\n\nbody only\n' }).length === 1);
check('no frontmatter is a gap for a blind reviewer too', gapsOf({ 'jd-judge-b': 'tools: Read\n\nbody only\n' }).length === 1);
check('a tools line in the body does not count', gapsOf({ 'review-resilience': role(['model: sonnet'], 'tools: Bash') }).length === 1);
check('an unterminated frontmatter is a gap', gapsOf({ 'review-readability': '---\ntools: Bash\n' }).length === 1);
check('CRLF line endings are read', gapsOf({ 'review-reliability': role(['tools: Read, Bash']).split('\n').join('\r\n') }).length === 0);
check('disallowedTools blocking Bash is a gap even with tools: []', gapsOf({ 'review-refuter': role(['tools: []', 'disallowedTools: Bash']) }).length === 1);
check('disallowedTools naming another tool is not a gap', gapsOf({ 'review-refuter': role(['tools: []', 'disallowedTools: WebFetch']) }).length === 0);

// --- who is judged.
const unclassified = gapsOf({}, { extra: { 'brand-new-role.md': COMPLIANT.executor } });
check('a role nobody classified is a gap', unclassified.length === 1 && unclassified[0].role === 'brand-new-role' && unclassified[0].problem.includes('not classified'));
const unknownProfile = gapsOf({}, { policy: { ...ROLE_POLICY, 'review-risk': 'no-such-profile' } });
check('a role naming no known profile is a gap', unknownProfile.length === 1 && unknownProfile[0].role === 'review-risk' && unknownProfile[0].problem.includes('no-such-profile'));
check('a non-markdown file is not a role', gapsOf({}, { extra: { 'jd-fix-agent.md.bak': 'x', 'notes.txt': 'y' } }).length === 0);
const vanished = gapsOf({}, { without: ['review-risk'] });
check('a classified role whose file is gone is a gap', vanished.length === 1 && vanished[0].role === 'review-risk');
check('a missing agents directory is a gap', toolsetGaps(path.join(tmpdir(), 'agent-toolset-check-no-such-directory')).length === 1);
check('declarationOf separates all / declared / problem', declarationOf(role(['tools: []'])).all === true && declarationOf(role(['tools: Bash'])).all === false && declarationOf(role(['tools: Bash'])).declared?.includes('Bash') && declarationOf('x').problem !== undefined);
check('declarationOf reads disallowedTools', declarationOf(role(['tools: []', 'disallowedTools: Bash, Write'])).disallowed?.join() === 'Bash,Write');

// --- only a plain comma list is read: every other YAML shape is a problem, never a narrow toolset.
// @es Solo se lee una lista simple separada por comas: cualquier otra forma YAML es un problema, nunca un conjunto estrecho.
const UNREAD_SHAPES = {
  'a multi-line plain scalar (YAML continues the value)': ['tools: Read,', '  Bash'],
  'a multi-line plain scalar indented with a tab': ['tools: Read,', '\tBash'],
  'a continuation after a blank line (YAML carries the value over it)': ['tools: Read,', '', '  Bash'],
  'a continuation after two blank lines, tab-indented': ['tools: Read,', '', '', '\tBash'],
  'a disallowedTools continued after a blank line': ['tools: Read, Write', 'disallowedTools: Write', '', '  , Edit'],
  'every tool continued on the next line': ['tools: []', '  Bash'],
  'a tools key with a space before its colon': ['tools: Read', 'tools : Bash'],
  'a tools key with a tab before its colon': ['tools: Read', 'tools\t: Bash'],
  'a continued disallowedTools': ['tools: Read', 'disallowedTools: Bash,', '  Write'],
  'a disallowedTools key with a space before its colon': ['tools: Read', 'disallowedTools : Bash'],
  'a flow list': ['tools: [Read, Bash]'],
  'a flow list with spaces inside': ['tools: [ Read ]'],
  'a quoted tool': ['tools: Read, "Bash"'],
  'a single-quoted value': ["tools: 'Read, Bash'"],
  'a bare tools key (YAML null inherits every tool)': ['tools:'],
  'a block list': ['tools:', '  - Read', '  - Bash'],
  'a repeated key (YAML keeps the last)': ['tools: Read', 'tools: Read, Bash'],
  'a repeated key whose first value is every tool': ['tools: []', 'tools: Read'],
  'a scope with no tool name': ['tools: Read, (git:*)'],
  'a comment after the list': ['tools: Read # and Bash'],
  'two tools without a comma': ['tools: Read Bash'],
  'an unclosed scope': ['tools: Read, Bash(git'],
  'a quote inside a scope': ['tools: Read, Bash("rm")'],
  'a flow disallowedTools': ['tools: []', 'disallowedTools: [Write, Edit]'],
  'an empty disallowedTools': ['tools: Read', 'disallowedTools:'],
  'a repeated disallowedTools': ['tools: Read', 'disallowedTools: Bash', 'disallowedTools: Write'],
};
for (const [shape, lines] of Object.entries(UNREAD_SHAPES)) {
  check(`${shape} is a problem, never a declaration`, declarationOf(role(lines)).problem !== undefined);
  const judged = gapsOf({ 'jd-judge-a': role(lines) });
  check(`${shape} makes a blind reviewer a gap that says the shape is unread`, judged.length === 1 && judged[0].role === 'jd-judge-a' && (judged[0].problem.includes('does not read') || judged[0].problem.includes('times')));
}
check('a blank line before the next unindented key continues nothing', declarationOf(role(['tools: Read', '', 'model: haiku'])).problem === undefined && declarationOf(role(['tools: Read', '', ''])).problem === undefined);
check('the repeated-key problem names the count', declarationOf(role(['tools: Read', 'tools: Bash'])).problem?.includes('2 times'));
check('the unread token is named', declarationOf(role(['tools: Read, "Bash"'])).problem?.includes('"Bash"'));
check('a scoped tool reaches its tool: a blind reviewer with Bash(git:*) is a gap', gapsOf({ 'jd-judge-b': role(['tools: Read, Bash(git:*)']) }).length === 1);
check('a scoped command runner satisfies an executor', gapsOf({ 'review-risk': role(['tools: Read, Bash(npm:*)']) }).length === 0);
check('a scoped disallowedTools closes only part of the tool, never the whole', gapsOf({ 'jd-judge-a': role(['tools: Read, Bash', 'disallowedTools: Bash(rm:*)']) }).length === 1);
check('a scope token yields its plain name', declarationOf(role(['tools: Read, Bash(npm run *)'])).declared?.join() === 'Read,Bash');
check('an MCP tool name is a plain token', declarationOf(role(['tools: Read, mcp__plugin_engram_engram__mem_search'])).declared?.includes('mcp__plugin_engram_engram__mem_search'));

// --- the policy and its profiles: positive rules only, no exemption left.
check('every role is classified by a known profile, never by free text', Object.values(ROLE_POLICY).every((value) => Object.hasOwn(PROFILES, value)));
check('every profile constrains something: none is an exemption in disguise', Object.values(PROFILES).every((profile) => profile.requires.length > 0 || profile.forbids.length > 0));
check('no profile requires a tool it forbids', Object.values(PROFILES).every((profile) => profile.requires.every((group) => group.every((tool) => !profile.forbids.includes(tool)))));
check('every profile is carried by at least one role', Object.keys(PROFILES).every((name) => rolesWith(name).length > 0));
check('every profile has a compliant sample in this selftest', Object.keys(PROFILES).every((name) => COMPLIANT[name] !== undefined));

// --- the real agents directory of this repository.
const realAgents = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'agents');
check('the real agents directory was actually scanned (a non-empty scan)', rolesIn(realAgents).length >= Object.keys(ROLE_POLICY).length);
for (const gap of toolsetGaps(realAgents)) failures.push(`REAL ROLE HAS A TOOLSET GAP @es UN ROL REAL TIENE UN HUECO DE HERRAMIENTAS: ${gap.role} ${gap.problem}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`${passed} passed, ${failures.length} failed @es ${passed} correctos, ${failures.length} fallidos`);
  process.exit(1);
}

console.log(`${passed}/${passed} passed (${rolesIn(realAgents).length} real roles checked) @es ${passed}/${passed} correctos (${rolesIn(realAgents).length} roles reales comprobados)`);
