#!/usr/bin/env node
/**
 * Proof that `check.mjs` DISCRIMINATES (`delegated-role-toolset-narrower-than-its-contract`). Each case
 * builds its own `agents/` directory in a temporary folder, so the verdict never depends on what the live
 * tree holds; the last cases run over the real `agents/` and refuse to pass over an empty directory.
 *
 * The state space the decision ranges over: a role with Bash / with PowerShell / with neither; `tools: []`;
 * a near-miss token (`BashOutput`); no `tools:` line; no frontmatter; a `tools:` line in the body that must
 * not count; a `disallowedTools:` that blocks execution; CRLF line endings; an exempt role without Bash;
 * a role nobody classified; a classified role whose file is gone; a non-markdown file; a missing directory.
 *
 * @es Prueba de que `check.mjs` DISCRIMINA. Cada caso construye su propio `agents/` temporal; los últimos
 * casos corren sobre el `agents/` real y se niegan a pasar con un directorio vacío. Espacio de estados: un
 * rol con Bash / con PowerShell / con ninguno; `tools: []`; un casi-acierto (`BashOutput`); sin línea
 * `tools:`; sin frontmatter; una línea `tools:` en el cuerpo que no debe contar; `disallowedTools:` que
 * bloquea la ejecución; finales de línea CRLF; un rol exento sin Bash; un rol sin clasificar; un rol
 * clasificado sin fichero; un fichero no markdown; un directorio ausente.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NEEDS_EXECUTION, ROLE_POLICY, executionOf, rolesIn, toolsetGaps } from './check.mjs';

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

const NEEDS = Object.keys(ROLE_POLICY).filter((name) => ROLE_POLICY[name] === NEEDS_EXECUTION);
const EXEMPT = Object.keys(ROLE_POLICY).filter((name) => ROLE_POLICY[name] !== NEEDS_EXECUTION);
const COMPLIANT = role(['tools: Read, Bash, Grep']);

/** Runs the check over a fresh agents directory holding `overrides` on top of a fully compliant set. @es Corre el check sobre un `agents/` fresco. */
function gapsOf(overrides = {}, { without = [], extra = {} } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'agent-toolset-check-'));
  const directory = path.join(base, 'agents');
  mkdirSync(directory);
  try {
    const files = { ...Object.fromEntries(NEEDS.map((name) => [name, COMPLIANT])), ...Object.fromEntries(EXEMPT.map((name) => [name, role(['tools: Read'])])), ...overrides };
    for (const name of without) delete files[name];
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(directory, `${name}.md`), text);
    for (const [name, text] of Object.entries(extra)) writeFileSync(path.join(directory, name), text);

    return toolsetGaps(directory);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

check('a fully compliant set has no gaps', gapsOf().length === 0);

// --- the capability itself.
const withoutBash = gapsOf({ 'sdd-explore': role(['tools: Read, Grep, Glob, WebFetch']) });
check('a role that needs execution and declares none is a gap', withoutBash.length === 1 && withoutBash[0].role === 'sdd-explore');
check('the gap says why', withoutBash[0]?.problem.includes('Bash'));
check('PowerShell satisfies the need', gapsOf({ 'sdd-verify': role(['tools: Read, PowerShell']) }).length === 0);
check('Bash satisfies the need', gapsOf({ 'sdd-apply': role(['tools: Bash']) }).length === 0);
check('tools: [] means every tool and satisfies the need', gapsOf({ 'review-risk': role(['tools: []']) }).length === 0);
check('BashOutput is not Bash', gapsOf({ 'sdd-tasks': role(['tools: Read, BashOutput, KillShell']) }).length === 1);
check('a token that merely contains Bash is not Bash', gapsOf({ 'sdd-spec': role(['tools: Read, NotBash']) }).length === 1);

// --- what is read.
check('no tools line is a gap, not a pass', gapsOf({ 'sdd-design': role(['model: sonnet']) }).length === 1);
check('no frontmatter is a gap, not a pass', gapsOf({ 'sdd-init': 'tools: Bash\n\nbody only\n' }).length === 1);
check('a tools line in the body does not count', gapsOf({ 'sdd-onboard': role(['model: sonnet'], 'tools: Bash') }).length === 1);
check('an unterminated frontmatter is a gap', gapsOf({ 'sdd-propose': '---\ntools: Bash\n' }).length === 1);
check('CRLF line endings are read', gapsOf({ 'sdd-archive': role(['tools: Read, Bash']).split('\n').join('\r\n') }).length === 0);
check('disallowedTools blocking Bash is a gap even with tools: []', gapsOf({ 'review-refuter': role(['tools: []', 'disallowedTools: Bash']) }).length === 1);
check('disallowedTools naming another tool is not a gap', gapsOf({ 'review-refuter': role(['tools: []', 'disallowedTools: WebFetch']) }).length === 0);

// --- who is judged.
check('an exempt role without Bash is not a gap', gapsOf({ 'jd-judge-a': role(['tools: Read, Glob']) }).length === 0);
const unclassified = gapsOf({}, { extra: { 'brand-new-role.md': COMPLIANT } });
check('a role nobody classified is a gap', unclassified.length === 1 && unclassified[0].role === 'brand-new-role');
check('a non-markdown file is not a role', gapsOf({}, { extra: { 'sdd-explore.md.bak': 'x', 'notes.txt': 'y' } }).length === 0);
const vanished = gapsOf({}, { without: ['sdd-verify'] });
check('a classified role whose file is gone is a gap', vanished.length === 1 && vanished[0].role === 'sdd-verify');
check('a missing agents directory is a gap', toolsetGaps(path.join(tmpdir(), 'agent-toolset-check-no-such-directory')).length === 1);
check('executionOf separates all / declared / problem', executionOf(role(['tools: []'])).kind === 'all' && executionOf(role(['tools: Bash'])).kind === 'declared' && executionOf('x').problem !== undefined);
check('every policy entry is either the execution marker or a reason', Object.values(ROLE_POLICY).every((value) => value === NEEDS_EXECUTION || value.length > 20));

// --- the real agents directory of this repository.
const realAgents = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'agents');
check('the real agents directory was actually scanned (a non-empty scan)', rolesIn(realAgents).length >= NEEDS.length);
for (const gap of toolsetGaps(realAgents)) failures.push(`REAL ROLE HAS A TOOLSET GAP @es UN ROL REAL TIENE UN HUECO DE HERRAMIENTAS: ${gap.role} ${gap.problem}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`${passed} passed, ${failures.length} failed @es ${passed} correctos, ${failures.length} fallidos`);
  process.exit(1);
}

console.log(`${passed}/${passed} passed (${rolesIn(realAgents).length} real roles checked) @es ${passed}/${passed} correctos (${rolesIn(realAgents).length} roles reales comprobados)`);
