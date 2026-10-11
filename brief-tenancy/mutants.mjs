#!/usr/bin/env node
/**
 * The decisions of `brief-tenancy`, each broken once, that `selftest.mjs` must catch. The runner lives in
 * `../mutation-proof/run-mutants.mjs` and mutates a COPY — no original is touched.
 *
 * BOTH FAILURE DIRECTIONS, because they are not symmetric and both are fatal. A guard that stops seeing
 * the hazard lets a false tenancy claim ship for an eighteenth time; a guard that starts refusing the
 * standard preamble's `NEVER run \`npm install\`` is switched off within the hour, which stops nothing.
 *
 * A KILL MUST BE ON THE DECISION, never on a syntax error or a red baseline. This campaign first enforced
 * both itself — measured on its own first run, which reported 22 of 22 killed over a selftest already
 * failing one check. Both rules now live in the runner, for every campaign: a green unmutated baseline
 * before any mutant, a target that occurs exactly once, and a mutated file that still parses, or the
 * mutant is BROKEN and counts as a survivor.
 *
 * @es Las decisiones de `brief-tenancy`, rotas una a una. Se mutan LAS DOS direcciones de fallo. UNA
 * MUERTE DEBE SER POR LA DECISIÓN: la base verde, el objetivo exactamente una vez y el parseo del mutante
 * los impone ahora el runner, para toda campaña.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FLEET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MUTANTS = [
  // --- FAILING TOWARDS "SAFE": the hazard stops being seen.
  ['a foreign-tenanted checkout is never counted', 'brief-tenancy/decision.mjs', 'if (!FOREIGN.has(tenancy.state)) continue;', 'continue;'],
  ['a LINKED checkout (node_modules itself a junction) is not foreign', 'brief-tenancy/decision.mjs', 'const FOREIGN = new Set([TENANCY.FARM, TENANCY.LINKED]);', 'const FOREIGN = new Set([TENANCY.FARM]);'],
  ['any TENANCY line with a colon counts, whatever checkout it names', 'brief-tenancy/tenancy-declaration.mjs', 'if (said.includes(wanted) || said.includes(name)) return \'present\';', "return 'present';"],
  ['a marker buried in a sentence counts as a declaration', 'brief-tenancy/tenancy-declaration.mjs', 'if (!line.startsWith(TENANCY_WORD)) continue;', 'if (!line.includes(TENANCY_WORD)) continue;'],
  ['the prefix-word test is dropped, so TENANCYWISE: declares', 'brief-tenancy/tenancy-declaration.mjs', 'if (rest.length > 0 && LETTERS.includes(rest.charAt(0))) continue;', ''],
  ['whole lines are no longer offered, only suffixes', 'brief-tenancy/mentioned-mutations.mjs', '    candidates.add(line);\n', '\n'],
  ['a fence line is read as a command', 'brief-tenancy/mentioned-mutations.mjs', "if (line.length === 0 || line.startsWith(FENCE)) continue;", 'if (line.length === 0) continue;'],
  ['mid-sentence suffixes are no longer offered', 'brief-tenancy/mentioned-mutations.mjs', 'for (let start = 1; start < words.length; start += 1) candidates.add(words.slice(start, start + SUFFIX_WORDS).join(\' \'));', ''],
  ['a path ending in a colon keeps the colon', 'brief-tenancy/named-checkouts.mjs', 'const TERMINATORS = ` \\t\\r\\n\\`"\'()[]{}<>|*,;:`;', 'const TERMINATORS = ` \\t\\r\\n\\`"\'()[]{}<>|*,;`;'],
  ['a tree path is not folded onto its checkout', 'brief-tenancy/named-checkouts.mjs', 'return tree > 0 ? path.slice(0, tree) : path;', 'return path;'],
  ['backslash-spelled paths are not found', 'brief-tenancy/named-checkouts.mjs', "(text.charAt(index + 2) === '/' || text.charAt(index + 2) === BACKSLASH) &&", "text.charAt(index + 2) === '/' &&"],
  ['the guard reads `prompt` for every tool, so SendMessage is blind', 'brief-tenancy/guard.mjs', 'const brief = briefOf(payload);', "const brief = typeof payload?.tool_input?.prompt === 'string' ? { toolName: payload.tool_name, surface: 'delegation', text: payload.tool_input.prompt } : undefined;"],
  ['the guard imports its carrier map through the home again, so a home without the install fails open', 'brief-tenancy/guard.mjs', "const CARRIERS = new URL('../brief-provenance/provenance.mjs', import.meta.url).href;", "const CARRIERS = new URL(`file:///${process.env.USERPROFILE ?? process.env.HOME}/.claude/brief-provenance/provenance.mjs`).href;"],
  ['the guard never emits its refusal','brief-tenancy/guard.mjs', "permissionDecision: 'deny',", "permissionDecision: 'allow',"],

  // --- FAILING TOWARDS "DANGEROUS": correct briefs start being refused.
  ['every named checkout counts as foreign, so the preamble\'s own-tree path refuses', 'brief-tenancy/decision.mjs', 'if (!FOREIGN.has(tenancy.state)) continue;', "if (tenancy.state === 'unknown') continue;"],
  ['an unknowable tenancy refuses instead of failing open', 'brief-tenancy/decision.mjs', 'if (!FOREIGN.has(tenancy.state)) continue;', "if (!FOREIGN.has(tenancy.state) && tenancy.state !== 'unknown') continue;"],
  ['a declaration never clears the refusal', 'brief-tenancy/decision.mjs', "if (declaration === 'present') continue;", ''],
  ['a mutation alone is enough to refuse (candidate 1)', 'brief-tenancy/decision.mjs', 'if (checkouts.length === 0) return undefined;', 'if (checkouts.length === 0) return { mutations, checkouts: [{ checkout: \'C:/x\', tenancy: { state: \'farm\' }, declaration: \'absent\' }] };'],
  ['a foreign path alone is enough to refuse', 'brief-tenancy/decision.mjs', 'if (mutations.length === 0) return undefined;', ''],
  ['quoted spans are parsed as commands, so the container form counts', 'brief-tenancy/mentioned-mutations.mjs', 'for (const mutation of packageManagerMutations(candidate, dialect, NOWHERE)) found.add(`${mutation.manager} ${mutation.verb}`);', "for (const mutation of packageManagerMutations(candidate.split('\"').join(' '), dialect, NOWHERE)) found.add(`${mutation.manager} ${mutation.verb}`);"],
  ['a mention anywhere of the word npm counts as a mutation', 'brief-tenancy/mentioned-mutations.mjs', 'return [...found].sort();', "return text.includes('npm') ? ['npm install'] : [...found].sort();"],

  // --- THE CONSTRUCTED MACHINE the surface cases run on: a fixture that silently stops being a farm
  //     would turn every DENY assertion into a test of nothing, exactly what the live read did.
  ['the constructed plugins are built with their own trees, so the replay no longer reaches a farm', 'brief-tenancy/constructed-machine.mjs', "for (const name of PACKAGES) junction(path.join(at('main'), 'node_modules', name), path.join(at(plugin), 'node_modules', name));", "for (const name of PACKAGES) mkdirSync(path.join(at(plugin), 'node_modules', name));"],
  ['the linked checkout is built as a real directory, so the LINKED surface case reaches nothing foreign', 'brief-tenancy/constructed-machine.mjs', "junction(path.join(at('main'), 'node_modules'), path.join(at('linked-checkout'), 'node_modules'));", "mkdirSync(path.join(at('linked-checkout'), 'node_modules'));"],

  // --- THE REFUSAL'S CONTENT: correct but unexplained gets routed around.
  ['the refusal stops naming the near-miss state', 'brief-tenancy/decision.mjs', "if (declaration === 'unnamed')", "if (declaration === 'never')"],
  ['the refusal stops printing where the tree lands', 'brief-tenancy/decision.mjs', '`    lands in  : ${tenancy.target}`,', ''],
  ['the suggested declaration names a hard-coded repository instead of the measured owner', 'brief-tenancy/decision.mjs', "${checkoutName(checkouts[0].tenancy.owner.split('\\\\').join('/'))}", 'somewhere-else'],
];

const survivors = runMutants({
  fleetRoot: FLEET,
  paths: ['brief-tenancy', 'toolchain-guard', 'shell-command', 'cherry-pick-guard', 'hook-payloads', 'brief-provenance', 'hook-state', 'bilingual-output'],
  selftest: 'brief-tenancy/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
