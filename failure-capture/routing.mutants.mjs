#!/usr/bin/env node
/**
 * The decisions of the LEDGER ROUTER (`ledger-routes.mjs`, `ledger-route.mjs`, their wiring in `ledgers.mjs` and
 * `capture.mjs`), each broken once, that `routing.selftest.mjs` must catch. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del ENRUTADOR de ledgers, rotas una a una; las debe cazar `routing.selftest.mjs`. El
 * runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const COMMAND = 'failure-capture/capture.mjs';
const PLAN = 'failure-capture/ledger-route.mjs';
const ROUTES = 'failure-capture/ledger-routes.mjs';
const LEDGERS = 'failure-capture/ledgers.mjs';
const TARGET = 'failure-capture/promotion-target.mjs';
const BLOCK = 'failure-capture/rule-block.mjs';

const MUTANTS = [
  // --- where a stub lands
  ['a global lesson\'s stub stays in the loaded ledger', COMMAND, 'const home = ledgerForScope(ledgers, stubScopeOf(ledger.scope));', 'const home = ledger;'],
  ['a project lesson\'s stub is written to the home stubs file', COMMAND, 'const home = ledgerForScope(ledgers, stubScopeOf(ledger.scope));', "const home = ledgerForScope(ledgers, 'promoted');"],
  ['the promoted line is left in the loaded ledger beside its stub', COMMAND, '      ledger.lines.splice(index, 1);\n', ''],
  ['the stubs file is never written', COMMAND, '      placeStub(home, key, stub.line, readMarker);\n      writeLedger(home);\n', '      placeStub(home, key, stub.line, readMarker);\n'],
  ['every stub goes to the stubs file, even a project\'s', ROUTES, 'export const stubScopeOf = (scope) => (isGlobalFamily(scope) ? PROMOTED_SCOPE : scope);', 'export const stubScopeOf = () => PROMOTED_SCOPE;'],
  ['no stub goes to the stubs file', ROUTES, 'export const stubScopeOf = (scope) => (isGlobalFamily(scope) ? PROMOTED_SCOPE : scope);', 'export const stubScopeOf = (scope) => scope;'],
  ['the stubs file is somewhere the harness loads', ROUTES, "path.join(home, '.claude', 'lessons-promoted.md')", "path.join(home, '.claude', 'rules', 'lessons-promoted.md')"],
  ['the home ledgers leave out the stubs file, so a recurrence cannot find its stub', LEDGERS, '  [PROMOTED_SCOPE]: { file: stubsLedgerFile(home), header: STUBS_HEADER },\n', ''],
  ['a recurrence is folded where it cannot see the stubs file', COMMAND, 'return [...home, load(project.scope', 'return [home[0], load(project.scope'],
  ['a stub of the promoted scope is promoted into a project contract', TARGET, 'return isGlobalFamily(scope) ? GLOBAL_TARGET : PROJECT_TARGET;', 'return scope === \'global\' ? GLOBAL_TARGET : PROJECT_TARGET;'],
  ['status says the unloaded file is loaded', COMMAND, "ledger.scope === PROMOTED_SCOPE ? 'status.ledger.unloaded' : 'status.ledger'", "'status.ledger'"],

  // --- route --stubs: the command
  ['route writes without --write', COMMAND, "if (args.write !== true) {\n      speaker.say('route.dry'", "if (false) {\n      speaker.say('route.dry'"],
  ['route --write takes no lock', COMMAND, 'const outcome = withLock(lockFile(), route);', 'const outcome = { held: true, value: route() };'],
  ['a locked ledger is not reported', COMMAND, "if (!outcome.held) {\n    speaker.complain('route.locked');", "if (false) {\n    speaker.complain('route.locked');"],
  ['route with several things to route does them all', COMMAND, 'if ([stubs, headers, lesson].filter(Boolean).length !== 1) {', 'if ([stubs, headers, lesson].filter(Boolean).length === 0) {'],
  ['a project ledger is given the home header', COMMAND, 'scopes.includes(ledger.scope) && ledger.lines !== undefined', 'ledger.lines !== undefined'],
  ['the text of a promoted rule is never looked for in the on-demand files', COMMAND, 'const rulesFamily = () => [ORCHESTRATOR_RULES, ...areaScopes().map((area) => areaRulesFile(homedir(), area)), ...onDemandRulesFiles(homedir())];', 'const rulesFamily = () => [ORCHESTRATOR_RULES, ...areaScopes().map((area) => areaRulesFile(homedir(), area))];'],
  ['the on-demand files are read from the evidence directory', ROUTES, "path.join(home, '.claude', 'lessons', 'on-demand')", "path.join(home, '.claude', 'lessons', 'evidence')"],
  ['route is not a command that reads the project', COMMAND, "'status', 'route']);", "'status']);"],
];

// The areas, proved by `areas.selftest.mjs`.
// @es Las áreas, que prueba `areas.selftest.mjs`.
const AREA_MUTANTS = [
  // --- areas
  ['no scope is accepted but global and the project\'s', 'failure-capture/loop-context.mjs', '...areaScopes(), ', ''],
  ['the home ledgers leave out the areas', LEDGERS, '...Object.fromEntries(areaScopes().map(', '...Object.fromEntries([].map('],
  ['an area ledger is written with no frontmatter', ROUTES, '`${frontmatterOf(definition.paths)}\\n# Lessons Ledger — ${area} (path-scoped)', '`# Lessons Ledger — ${area} (path-scoped)'],
  ['the frontmatter names no paths', ROUTES, "['---', 'paths:', ...paths.map((glob) => `  - ${quotedGlob(glob)}`), '---']", "['---', 'paths:', '---']"],
  ['the evidence of an area lesson goes under rules/, where the harness loads it', 'failure-capture/evidence.mjs', "return path.basename(directory) === 'rules' ? path.dirname(directory) : directory;", 'return directory;'],
  ['an area lesson is promoted into a project contract', ROUTES, 'scope === PROMOTED_SCOPE || isAreaScope(scope);', 'scope === PROMOTED_SCOPE;'],
  ['a project may take the name of an area', 'failure-capture/loop-context.mjs', 'if (project !== undefined && isReservedScope(project.scope))', 'if (false)'],
  ['only the global scope is reserved', ROUTES, 'export const isReservedScope = (scope) => isGlobalFamily(scope);', "export const isReservedScope = (scope) => scope === 'global';"],
  ['a recurrence cannot see the area ledgers', COMMAND, 'Object.hasOwn(homeLedgerFiles(homedir()), entry.scope) ? home : undefined', 'entry.scope === GLOBAL_SCOPE ? home : undefined'],
  ['the rules file of an area lesson is the global one', COMMAND, 'if (isAreaScope(found?.ledger.scope)) return [areaRulesFile(homedir(), found.ledger.scope)];\n', ''],
  ['the text of a promoted area lesson is looked for only in the global file', COMMAND, 'const rulesFamily = () => [ORCHESTRATOR_RULES, ...areaScopes().map((area) => areaRulesFile(homedir(), area)), ...onDemandRulesFiles(homedir())];', 'const rulesFamily = () => [ORCHESTRATOR_RULES, ...onDemandRulesFiles(homedir())];'],
  ['the instructions never name the area file', COMMAND, "speaker.line('instructions.global', { file: globalRulesOf(key)[0], key })", "speaker.line('instructions.global', { file: ORCHESTRATOR_RULES, key })"],
  ['a promoted lesson is routed as a ledger line', COMMAND, 'if (found?.ledger.scope === PROMOTED_SCOPE && isAreaScope(args.to)) return blockRoute(args.key, args.to);', ''],
  ['the rule text is looked for only in the global rules file', COMMAND, 'const family = rulesFamily();', 'const family = [ORCHESTRATOR_RULES];'],
  ['a rule text held by two files is moved from the first', COMMAND, 'if (holding.length > 1)', 'if (false)'],
  ['a rule text already in the area is moved again', COMMAND, 'if (holding[0] === target) return { nothing: true };', ''],
];

// The pure side of moving a rule's text, proved by `rule-block.selftest.mjs`.
// @es El lado puro de mover el texto de una regla, que prueba `rule-block.selftest.mjs`.
const BLOCK_MUTANTS = [
  ['a key quoted mid-line opens a block', BLOCK, 'content(line).startsWith(opens(key))', 'content(line).includes(opens(key))'],
  ['a key opens the block of every key it prefixes', BLOCK, 'const opens = (key) => `- **\\`${key}\\`**`;', 'const opens = (key) => `- **\\`${key}`;'],
  ['the block runs on past its blank line', BLOCK, "while (end < lines.length && content(lines[end]) !== '') end += 1;", 'while (end < lines.length) end += 1;'],
  ['a carriage return hides the blank line that ends a block', BLOCK, "content(lines[end]) !== '') end += 1;", "lines[end] !== '') end += 1;"],
  ['a key that opens two blocks is taken for one', BLOCK, 'if (starts.length !== 1) return { count: starts.length };', 'if (starts.length === 0) return { count: 0 };'],
  ['the blank line stays behind in the source', BLOCK, "(content(after[0] ?? '') === '' ? after.slice(1) : after)", 'after'],
  ['two blank lines leave the source', BLOCK, "(content(after[0] ?? '') === '' ? after.slice(1) : after)", "(content(after[0] ?? '') === '' ? after.slice(2) : after)"],
  ['a key both files hold is moved again', BLOCK, 'if (held.count !== 0)', 'if (false)'],
  ['a block already moved is refused instead of being nothing to do', BLOCK, 'if (source.count === 0 && held.start !== undefined) return', 'if (false) return'],
  ['the block lands with no blank line before it', BLOCK, "...(body.length > 0 && content(body.at(-1)) !== '' ? [''] : []), ", ''],
  ['a CRLF source gives an LF destination', BLOCK, "ending === '\\r\\n' && ", 'false && '],
  ['the block lands with its last line lost', BLOCK, '...source.lines, \'\']', '...source.lines.slice(0, -1), \'\']'],
  ['the proof does not notice a block that arrived altered', BLOCK, "landed.lines.join('\\n') === block.join('\\n') ? [] :", 'true ? [] :'],
  ['the proof does not notice the destination changing besides the block', BLOCK, "flat(removed(after.to ?? '')) === flat((before.to ?? header).split('\\n')) ? [] :", 'true ? [] :'],
  ['the proof does not notice the block left in the source', BLOCK, 'findBlock(after.from, key).count === 0 ? [] :', 'true ? [] :'],
  ['the proof does not notice the source changing besides the block', BLOCK, "flat(after.from.split('\\n')) === flat(removed(before.from)) ? [] :", 'true ? [] :'],
  ['the commit never proves what it wrote', BLOCK, 'const proof = provesBlockRoute({ before, after: io.readBack(), block: plan.block, key: plan.key, header: plan.header });', 'const proof = { ok: true };'],
  ['the commit proves the plan, not the re-read files', BLOCK, 'after: io.readBack(), block: plan.block', 'after: { from: plan.from, to: plan.to }, block: plan.block'],
  ['a failed proof leaves the source rewritten', BLOCK, '    io.writeFrom(before.from);\n', ''],
  ['a failed proof leaves the destination rewritten', BLOCK, '    io.writeTo(before.to);\n', ''],
  ['the source is written before the destination, so a crash between loses the rule', BLOCK, '  io.writeTo(plan.to);\n  io.writeFrom(plan.from);\n', '  io.writeFrom(plan.from);\n  io.writeTo(plan.to);\n'],
  ['a block plan is written without being proved first', BLOCK, '  if (!planned.ok) return { ...planned, written: false };\n\n  io.writeTo(plan.to);', '  io.writeTo(plan.to);'],
  ['a refused block plan is not marked as never written', BLOCK, 'return { ...planned, written: false };', 'return planned;'],
  ['the block plan is proved against the files as they were, not the plan', BLOCK, 'after: { from: plan.from, to: plan.to }, block: plan.block, key: plan.key, header: plan.header });\n\n  if (!planned.ok)', 'after: before, block: plan.block, key: plan.key, header: plan.header });\n\n  if (!planned.ok)'],
];

// The pure side, proved by `ledger-route.selftest.mjs`.
// @es El lado puro, que prueba `ledger-route.selftest.mjs`.
const PURE_MUTANTS = [
  // --- the plan
  ['a lesson that is not a stub is moved too', PLAN, 'if (!isPromotedStub(line)) continue;', 'if (false) continue;'],
  ['the plan keeps the stubs in the loaded ledger', PLAN, 'source: source.filter((line) => !isPromotedStub(line)), destination', 'source, destination'],
  ['a key already in the destination is moved again', PLAN, 'else if (held.has(key) || moved.some((one) => one.key === key))', 'else if (moved.some((one) => one.key === key))'],
  ['a key twice in the source is moved twice', PLAN, 'else if (held.has(key) || moved.some((one) => one.key === key))', 'else if (held.has(key))'],
  ['a stub without a marker is moved', PLAN, 'if (key === undefined) problems.push(', 'if (false) problems.push('],
  ['a refusal is not whole: the plan moves what it can', PLAN, 'if (problems.length > 0) return { ok: false, problems };', ''],
  ['the moved stubs come out in reverse order', PLAN, 'appendedTo(destination, header, moved.map((one) => one.line))', 'appendedTo(destination, header, moved.map((one) => one.line).reverse())'],
  ['the destination loses what it already held', PLAN, "const base = withoutTrailingBlanks(destination ?? header.split('\\n'));", "const base = header.split('\\n');"],
  ['the header separator is not followed by a blank line', PLAN, "...(base.at(-1) === SEPARATOR ? [''] : []), ", ''],

  // --- a lesson to an area
  ['a lesson is moved without being retagged', PLAN, '`${ENTRY_PREFIX}${area}] ${found.line.slice(prefix.length)}`', 'found.line'],
  ['a lesson of another scope is moved to an area', PLAN, 'found.ledger.scope !== sourceScope || !found.line.startsWith(prefix)', '!found.line.startsWith(prefix)'],
  ['a stub is moved as if it were a lesson line', PLAN, 'found.ledger.scope !== sourceScope || !found.line.startsWith(prefix)', 'false'],
  ['an unknown area is accepted', PLAN, 'if (!isAreaScope(area) && !ofProject)', 'if (false)'],
  ['a key the destination already holds is moved again', PLAN, "if ((destination ?? []).some((line) => isEntry(line) && keyOfLine(line) === key))", 'if (false)'],
  ['a lesson already in the area is moved again', PLAN, 'if (found.ledger.scope === area) return', 'if (false) return'],
  ['a line with no marker is never found', PLAN, 'return split?.ok ? evidenceKeyOf(split.rule) : undefined;', 'return undefined;'],
  ['the first line of any key is found', PLAN, 'isEntry(line) && keyOfLine(line) === key);\n\n    if (index !== -1) return { ledger', 'isEntry(line));\n\n    if (index !== -1) return { ledger'],
  ['the proof forgets which lines were renamed', PLAN, 'entries(before).map((line) => renamed.get(line) ?? line)', 'entries(before)'],
  ['the commit forgets which lines were renamed', PLAN, 'after: io.readBack(), renamed: plan.renamed', 'after: io.readBack(), renamed: undefined'],
  ['the proof before the write forgets which lines were renamed', PLAN, 'after: { source: plan.source, destination: plan.destination }, renamed: plan.renamed', 'after: { source: plan.source, destination: plan.destination }, renamed: undefined'],

  // --- the proof
  ['the proof does not notice a lost line', PLAN, '...lost.map((line) =>', '...[].map((line) =>'],
  ['the proof does not notice an invented line', PLAN, '...invented.map((line) =>', '...[].map((line) =>'],
  ['the proof does not notice the kept lines changing order', PLAN, "...(sourceEntriesBefore.join('\\n') === sourceEntriesAfter.join('\\n') ? [] :", '...(true ? [] :'],
  ['the proof does not notice the source text changing', PLAN, "...(before.source.filter((line) => !isEntry(line)).join('\\n') === after.source.filter((line) => !isEntry(line)).join('\\n') ? [] :", '...(true ? [] :'],
  ['the proof does not notice the destination text lost', PLAN, "...((before.destination ?? []).filter((line) => !isEntry(line) && line !== '').every((line) => (after.destination ?? []).includes(line)) ? [] :", '...(true ? [] :'],

  // --- the header of a ledger
  ['the header is replaced with no blank line after it', PLAN, "...withoutTrailingBlanks(header.split('\\n')), '', ...lines.slice(first)]", "...withoutTrailingBlanks(header.split('\\n')), ...lines.slice(first)]"],
  ['the first lesson is lost with the old header', PLAN, '...lines.slice(first)];\n\n  return { ok: true, changed', '...lines.slice(first + 1)];\n\n  return { ok: true, changed'],
  ['a ledger with the declared header is always rewritten', PLAN, "changed: next.join('\\n') !== lines.join('\\n')", 'changed: true'],
  ['the header proof does not notice a lesson lost or changed', PLAN, "...(before.filter(isEntry).join('\\n') === after.filter(isEntry).join('\\n') ? [] :", '...(true ? [] :'],
  ['the header proof does not notice a header that is not the declared one', PLAN, "...(after.slice(0, declared.length).join('\\n') === declared.join('\\n') ? [] :", '...(true ? [] :'],
  ['the header proof does not notice the text between lessons changing', PLAN, "...(before.slice(Math.max(before.findIndex(isEntry), 0)).filter((line) => !isEntry(line)).join('\\n') === after.slice(Math.max(after.findIndex(isEntry), 0)).filter((line) => !isEntry(line)).join('\\n') ? [] :", '...(true ? [] :'],
  ['the header commit never proves what it wrote', PLAN, 'const proof = provesHeaderRoute({ before, after: io.readBack(), header });', 'const proof = { ok: true };'],
  ['a failed header proof leaves the ledger rewritten', PLAN, 'if (!proof.ok) io.write(before);', ''],
  ['a header plan is written without being proved first', PLAN, '  if (!planned.ok) return { ...planned, written: false };\n\n  io.write(plan.lines);', '  io.write(plan.lines);'],
  ['a refused header plan is not marked as never written', PLAN, 'return { ...planned, written: false };\n\n  io.write(plan.lines);', 'return planned;\n\n  io.write(plan.lines);'],
  ['the header plan is proved against the ledger as it was, not the plan', PLAN, 'provesHeaderRoute({ before, after: plan.lines, header })', 'provesHeaderRoute({ before, after: before, header })'],

  // --- the commit
  ['the commit never proves what it wrote', PLAN, 'const proof = provesRoute({ before, after: io.readBack(), renamed: plan.renamed });', 'const proof = { ok: true };'],
  ['the commit proves the plan, not the re-read files', PLAN, 'after: io.readBack(), renamed: plan.renamed', 'after: { source: plan.source, destination: plan.destination }, renamed: plan.renamed'],
  ['a failed proof leaves both files rewritten', PLAN, '  if (!proof.ok) io.restore(saved);\n', ''],
  ['an unproved route is reported done', PLAN, 'if (proof.ok) return { status: 0,', 'if (true) return { status: 0,'],
  ['the source is written before the destination, so a crash between loses stubs', PLAN, '    io.writeDestination(plan.destination);\n    io.writeSource(plan.source);\n', '    io.writeSource(plan.source);\n    io.writeDestination(plan.destination);\n'],

  // --- the commit is one transaction: a write that throws restores both files
  ['a write that throws leaves the first write in place', PLAN, '      io.restore(saved);\n', ''],
  ['a write that throws is swallowed', PLAN, '    throw writeFailure(cause);\n', ''],
  ['a restore that fails hides the write that failed', PLAN, 'throw writeFailure(cause, restoreFailure);', 'throw restoreFailure;'],
  ['the bytes are kept only after the first write', PLAN, '  const saved = io.snapshot();\n\n  try {\n    io.writeDestination(plan.destination);\n', '  let saved;\n\n  try {\n    io.writeDestination(plan.destination);\n    saved = io.snapshot();\n'],
  ['the error of a failed write loses its Spanish half', PLAN, 'return new Error(`${english} @es ${spanish}`, { cause });', 'return new Error(english, { cause });'],
  ['the error of a failed write does not name the restore that failed too', PLAN, ', and restoring the files failed too (${messageOf(restoreFailure)}); check both files by hand.`', '.`'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaign = (selftest, mutants) => runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'], selftest, mutants, crashKills: 'fail' });
const survivors = campaign('failure-capture/routing.selftest.mjs', MUTANTS) + campaign('failure-capture/areas.selftest.mjs', AREA_MUTANTS) + campaign('failure-capture/rule-block.selftest.mjs', BLOCK_MUTANTS) + campaign('failure-capture/ledger-route.selftest.mjs', PURE_MUTANTS);

process.exit(survivors === 0 ? 0 : 1);
