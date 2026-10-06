#!/usr/bin/env node
/**
 * Proof that `check.mjs` DISCRIMINATES (`delegated-role-toolset-narrower-than-its-contract`). Each case
 * builds its own `agents/` directory in a temporary folder, so the verdict never depends on what the live
 * tree holds; the last cases run over the real `agents/` and refuse to pass over an empty directory.
 *
 * The state space the decision ranges over, in both directions of every profile. MUST: an executor with Bash
 * / with PowerShell / with neither; a web researcher that loses WebFetch or WebSearch; a blind reviewer that
 * loses Read; `tools: []`. MUST NOT: a blind reviewer that gains Bash, Write, Edit or a web tool; a web
 * researcher that gains Bash; `tools: []` where the profile forbids tools, with and without the
 * `disallowedTools:` that closes it. Reading: a near-miss token (`BashOutput`); no `tools:` line; no
 * frontmatter; a `tools:` line in the body that must not count; a `disallowedTools:` that blocks a tool the
 * profile needs; CRLF line endings. Who is judged: a role nobody classified; a role naming no known profile;
 * a classified role whose file is gone; a non-markdown file; a missing directory. And the profiles
 * themselves: each constrains something (none is an exemption in disguise) and none contradicts itself.
 *
 * @es Prueba de que `check.mjs` DISCRIMINA. Cada caso construye su propio `agents/` temporal; los últimos
 * casos corren sobre el `agents/` real y se niegan a pasar con un directorio vacío. Espacio de estados, en
 * ambos sentidos de cada perfil. DEBE: un ejecutor con Bash / con PowerShell / con ninguno; un investigador
 * web que pierde WebFetch o WebSearch; un revisor ciego que pierde Read; `tools: []`. NO DEBE: un revisor
 * ciego que gana Bash, Write, Edit o una herramienta web; un investigador web que gana Bash; `tools: []`
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
  'web-researcher': role(['tools: WebFetch, WebSearch']),
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
const withoutBash = gapsOf({ 'sdd-explore': role(['tools: Read, Grep, Glob, WebFetch']) });
check('an executor that declares no command runner is a gap', withoutBash.length === 1 && withoutBash[0].role === 'sdd-explore');
check('the gap says why', withoutBash[0]?.problem.includes('Bash'));
check('PowerShell satisfies the need', gapsOf({ 'sdd-verify': role(['tools: Read, PowerShell']) }).length === 0);
check('Bash satisfies the need', gapsOf({ 'sdd-apply': role(['tools: Bash']) }).length === 0);
check('tools: [] means every tool and satisfies the need', gapsOf({ 'review-risk': role(['tools: []']) }).length === 0);
check('BashOutput is not Bash', gapsOf({ 'sdd-tasks': role(['tools: Read, BashOutput, KillShell']) }).length === 1);
check('a token that merely contains Bash is not Bash', gapsOf({ 'sdd-spec': role(['tools: Read, NotBash']) }).length === 1);
check('an executor may carry web tools: its profile does not forbid them', gapsOf({ 'sdd-explore': role(['tools: Read, Bash, WebFetch, WebSearch']) }).length === 0);

// --- MUST and MUST NOT: the web researcher reaches the web and runs nothing.
check('a web researcher with exactly the web tools is not a gap', gapsOf({ 'sdd-research': role(['tools: WebFetch, WebSearch']) }).length === 0);
const lostFetch = gapsOf({ 'sdd-research': role(['tools: WebSearch']) });
check('a web researcher that loses WebFetch is a gap that names it', lostFetch.length === 1 && lostFetch[0].role === 'sdd-research' && lostFetch[0].problem.includes('WebFetch'));
const lostSearch = gapsOf({ 'sdd-research': role(['tools: WebFetch']) });
check('a web researcher that loses WebSearch is a gap that names it', lostSearch.length === 1 && lostSearch[0].problem.includes('WebSearch'));
check('a web researcher that loses both web tools is two gaps', gapsOf({ 'sdd-research': role(['tools: Read']) }).length === 2);
const researcherBash = gapsOf({ 'sdd-research': role(['tools: WebFetch, WebSearch, Bash']) });
check('a web researcher that gains Bash is a gap that names it', researcherBash.length === 1 && researcherBash[0].problem.includes('Bash'));
check('a web researcher that gains PowerShell is a gap', gapsOf({ 'sdd-research': role(['tools: WebFetch, WebSearch, PowerShell']) }).length === 1);
check('a web researcher with tools: [] reaches Bash and is a gap', gapsOf({ 'sdd-research': role(['tools: []']) }).length === 1);
check('a web researcher may read the repository: reading is not execution', gapsOf({ 'sdd-research': role(['tools: Read, WebFetch, WebSearch']) }).length === 0);
check('a web researcher whose disallowedTools blocks a web tool is a gap', gapsOf({ 'sdd-research': role(['tools: []', 'disallowedTools: Bash, PowerShell, WebFetch']) }).length === 1);

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
check('no tools line is a gap, not a pass', gapsOf({ 'sdd-design': role(['model: sonnet']) }).length === 1);
check('no tools line is a gap for a blind reviewer too', gapsOf({ 'jd-judge-b': role(['model: opus']) }).length === 1);
check('no frontmatter is a gap, not a pass', gapsOf({ 'sdd-init': 'tools: Bash\n\nbody only\n' }).length === 1);
check('no frontmatter is a gap for a blind reviewer too', gapsOf({ 'jd-judge-b': 'tools: Read\n\nbody only\n' }).length === 1);
check('a tools line in the body does not count', gapsOf({ 'sdd-onboard': role(['model: sonnet'], 'tools: Bash') }).length === 1);
check('an unterminated frontmatter is a gap', gapsOf({ 'sdd-propose': '---\ntools: Bash\n' }).length === 1);
check('CRLF line endings are read', gapsOf({ 'sdd-archive': role(['tools: Read, Bash']).split('\n').join('\r\n') }).length === 0);
check('disallowedTools blocking Bash is a gap even with tools: []', gapsOf({ 'review-refuter': role(['tools: []', 'disallowedTools: Bash']) }).length === 1);
check('disallowedTools naming another tool is not a gap', gapsOf({ 'review-refuter': role(['tools: []', 'disallowedTools: WebFetch']) }).length === 0);

// --- who is judged.
const unclassified = gapsOf({}, { extra: { 'brand-new-role.md': COMPLIANT.executor } });
check('a role nobody classified is a gap', unclassified.length === 1 && unclassified[0].role === 'brand-new-role' && unclassified[0].problem.includes('not classified'));
const unknownProfile = gapsOf({}, { policy: { ...ROLE_POLICY, 'sdd-verify': 'no-such-profile' } });
check('a role naming no known profile is a gap', unknownProfile.length === 1 && unknownProfile[0].role === 'sdd-verify' && unknownProfile[0].problem.includes('no-such-profile'));
check('a non-markdown file is not a role', gapsOf({}, { extra: { 'sdd-explore.md.bak': 'x', 'notes.txt': 'y' } }).length === 0);
const vanished = gapsOf({}, { without: ['sdd-verify'] });
check('a classified role whose file is gone is a gap', vanished.length === 1 && vanished[0].role === 'sdd-verify');
check('a missing agents directory is a gap', toolsetGaps(path.join(tmpdir(), 'agent-toolset-check-no-such-directory')).length === 1);
check('declarationOf separates all / declared / problem', declarationOf(role(['tools: []'])).all === true && declarationOf(role(['tools: Bash'])).all === false && declarationOf(role(['tools: Bash'])).declared?.includes('Bash') && declarationOf('x').problem !== undefined);
check('declarationOf reads disallowedTools', declarationOf(role(['tools: []', 'disallowedTools: Bash, Write'])).disallowed?.join() === 'Bash,Write');

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
