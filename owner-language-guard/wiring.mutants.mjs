#!/usr/bin/env node
/**
 * Mutant campaign of the language-check wiring: each mutant breaks ONE registration (a settings group, a
 * manifest) or one guard decision and `wiring.selftest.mjs` must go red by assertion. Own loop instead of the
 * shared runner, which refuses JSON targets (no parse check for them); this one parses what it mutates.
 * Exit 2 = NOT MEASURED.
 * @es Campaña de mutantes del cableado del chequeo de idioma: cada mutante rompe UN registro o una decisión
 * del dispatcher y el selftest debe ponerse en rojo por aserción. Salida 2 = NO MEDIDO.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXIT_NOT_MEASURED = 2;
const M = 'hook-dispatch/manifests';
const LANGUAGE_GROUP = '"command": "node \\"$HOME/.claude/hook-dispatch/dispatch.mjs\\" \\"$HOME/.claude/hook-dispatch/manifests/pretooluse-language.json\\""';

const MUTANTS = [
  ['the catch-all group is not registered', 'settings.json', LANGUAGE_GROUP, '"command": "node \\"$HOME/.claude/hook-dispatch/dispatch.mjs\\" \\"$HOME/.claude/hook-dispatch/manifests/pretooluse-nowhere.json\\""'],
  ['the language manifest is empty', `${M}/pretooluse-language.json`, '"../../owner-language-guard/pretool.mjs"', ''],
  ['the language manifest names another guard', `${M}/pretooluse-language.json`, '../../owner-language-guard/pretool.mjs', '../../owner-language-guard/guard.mjs'],
  ['the shell manifest carries the guard again', `${M}/pretooluse-shell.json`, '"../../vendored-edit-guard/guard.mjs"', '"../../vendored-edit-guard/guard.mjs",\n    "../../owner-language-guard/pretool.mjs"'],
  ['the authoring manifest carries the guard again', `${M}/pretooluse-authoring.json`, '"../../vendored-edit-guard/guard.mjs"', '"../../vendored-edit-guard/guard.mjs",\n    "../../owner-language-guard/pretool.mjs"'],
  ['the delegation manifest carries the guard again', `${M}/pretooluse-delegation.json`, '"../../brief-tenancy/guard.mjs"', '"../../brief-tenancy/guard.mjs",\n    "../../owner-language-guard/pretool.mjs"'],
  ['the guard sidecar is pinned to one tool', 'owner-language-guard/pretool.mjs.hook-registration.json', '"event": "PreToolUse"', '"event": "PreToolUse", "matcher": "Bash"'],
  ['the guard stops skipping subagents', 'owner-language-guard/pretool.mjs', 'isSubagentCaller(payload) || ', '']
];

const COPIED = ['owner-language-guard', 'hook-dispatch', 'hook-state', 'hook-caller', 'bilingual-output', 'settings.json'];
const ROOT = path.resolve(import.meta.dirname, '..');

/** Whether the mutated file still parses: JSON.parse for .json, `node --check` for .mjs. @es Si el fichero mutado aún parsea. */
function parses(file, text) {
  if (file.endsWith('.json')) {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }

  return spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }).status === 0;
}

function runSelftest(tree) {
  return spawnSync(process.execPath, [path.join(tree, 'owner-language-guard', 'wiring.selftest.mjs')], { encoding: 'utf8' });
}

let survivors = 0;
const base = mkdtempSync(path.join(os.tmpdir(), 'wiring-mutants-'));

try {
  const baseline = path.join(base, 'baseline');

  for (const entry of COPIED) cpSync(path.join(ROOT, entry), path.join(baseline, entry), { recursive: true });

  const green = runSelftest(baseline);

  if (green.status !== 0) {
    console.error(`NOT MEASURED — the baseline selftest is red. @es NO MEDIDO — el selftest base está en rojo.
${green.stdout}`);
    process.exit(EXIT_NOT_MEASURED);
  }

  console.log('BASELINE wiring.selftest.mjs is green');

  MUTANTS.forEach(([name, file, from, to], index) => {
    const tree = path.join(base, `m${index}`);

    for (const entry of COPIED) cpSync(path.join(baseline, entry), path.join(tree, entry), { recursive: true });

    const target = path.join(tree, file);
    const original = readFileSync(target, 'utf8');

    if (original.split(from).length !== 2) {
      console.log(`REFUSED  ${name} — the target text is not present exactly once`);
      survivors += 1;
      return;
    }

    const mutated = original.replace(from, () => to);

    writeFileSync(target, mutated);

    if (!parses(target, mutated)) {
      console.log(`BROKEN   ${name} — the mutant does not parse`);
      survivors += 1;
      return;
    }

    const run = runSelftest(tree);
    const byAssertion = run.status === 1 && run.stdout.includes('FAIL');

    console.log(`${byAssertion ? 'KILLED  ' : run.status === 0 ? 'SURVIVED' : 'CRASHED '} ${name}`);
    if (!byAssertion) survivors += 1;
  });
} finally {
  rmSync(base, { recursive: true, force: true });
}

console.log(`
${MUTANTS.length - survivors}/${MUTANTS.length} mutants killed by assertion`);
process.exit(survivors === 0 ? 0 : 1);
