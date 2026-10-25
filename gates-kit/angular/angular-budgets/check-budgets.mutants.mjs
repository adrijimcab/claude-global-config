#!/usr/bin/env node
/**
 * The decisions of `check-budgets.mjs`, each broken once, that `check-budgets.selftest.mjs` must catch. The
 * runner and its rules (green baseline, exactly-once target, parse check) live in
 * `../../../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors (`crashKills: 'fail'`).
 * Each row names the decision it removes, not the line it edits.
 *
 * Known residual: `.projects ?? {}` is equivalent to the surrounding `try` (an undefined `projects` throws
 * into the same empty list), so it has no mutant.
 *
 * @es Las decisiones de `check-budgets.mjs`, rotas una a una, que `check-budgets.selftest.mjs` debe cazar.
 * Una muerte solo por crash cuenta como superviviente. Residual conocido: `.projects ?? {}` equivale al `try`
 * que lo rodea (un `projects` indefinido lanza hacia la misma lista vacía), así que no tiene mutante.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../../../mutation-proof/run-mutants.mjs';
import { makeSpeaker } from '../../../bilingual-output/speaker.mjs';

const C = 'gates-kit/angular/angular-budgets/check-budgets.mjs';
const SIZE = '/^(\\d+(?:\\.\\d+)?)(b|kb|mb)$/i';

const MUTANTS = [
  ['a kilobyte is read as 1000 bytes', C, 'kb: 1024,', 'kb: 1000,'],
  ['a megabyte is read as 1000 squared bytes', C, 'mb: 1024 * 1024', 'mb: 1000 * 1000'],
  ['a byte is read as two bytes', C, '{ b: 1, kb', '{ b: 2, kb'],
  ['a size exactly at the cap is refused', C, 'bytes > capBytes', 'bytes >= capBytes'],
  ['a size over the cap is accepted', C, 'bytes > capBytes', 'bytes < capBytes'],
  ['only the first budget of a type is compared with its cap', C, 'return declared.flatMap(', 'return declared.slice(0, 1).flatMap('],
  ['an unreadable cap table is read as an empty one', C, "} catch {\n    return { problem: ['configUnreadable', { file }] };", '} catch {\n    return { caps: {} };'],
  ['a cap table with no types is accepted', C, "if (entries.length === 0) return { problem: ['configUnreadable', { file }] };", ''],
  ['a null cap table crashes instead of failing', C, "caps !== null && typeof caps === 'object' ?", "typeof caps === 'object' ?"],
  ['a cap that is not a size is accepted', C, " || toBytes(entry.maximumError) === undefined", ''],
  ['a cap that is not a string is accepted', C, "typeof entry?.maximumError !== 'string' || ", ''],
  ['a cap problem is not reported', C, "{ problem: ['configCap', { file, type: bad[0], value: String(bad[1]?.maximumError) }] }", '{ caps }'],
  ['a cap table problem exits 1', C, 'speaker.complain(...problem);\n\n    return 2;', 'speaker.complain(...problem);\n\n    return 1;'],
  ['a cap table problem exits 0', C, 'speaker.complain(...problem);\n\n    return 2;', 'speaker.complain(...problem);\n\n    return 0;'],
  ['a size with upper case units is rejected as invalid', C, SIZE, '/^(\\d+(?:\\.\\d+)?)(b|kb|mb)$/'],
  ['an upper case unit is not folded to lower case', C, 'UNITS[match[2].toLowerCase()]', 'UNITS[match[2]]'],
  ['a decimal size is not read', C, '(\\d+(?:\\.\\d+)?)', '(\\d+)'],
  ['leading text before a size is accepted', C, '/^(\\d+', '/(\\d+'],
  ['trailing text after a size is accepted', C, '(b|kb|mb)$/i', '(b|kb|mb)/i'],
  ['a padded size is not trimmed', C, 'String(text).trim()', 'String(text)'],
  ['a warning-only budget counts as an error budget', C, 'entry.type === type && entry.maximumError !== undefined', 'entry.type === type'],
  ['a budget of any type satisfies every type', C, 'entry.type === type && ', ''],
  ['a missing budget is not reported', C, "if (declared.length === 0) return [['missing', { project, type }]];", ''],
  ['an invalid size is not reported', C, "if (bytes === undefined) return [['invalid', { project, type, value: budget.maximumError }]];", ''],
  ['the targets spelling of a project is not read', C, '(project.architect ?? project.targets)', 'project.architect'],
  ['a project without a build target is still checked', C, '.filter(([, build]) => build !== undefined)', '.filter(() => true)'],
  ['a folder without a build target exits 0', C, 'if (builds.length === 0) {', 'if (false) {'],
  ['a no-target refusal exits 1', C, 'speaker.complain(\'unreadable\', { dir });\n\n    return 2;', 'speaker.complain(\'unreadable\', { dir });\n\n    return 1;'],
  ['a project without a production configuration is not checked', C, 'build.configurations?.production?.budgets ?? []', '[]'],
  ['a project without budgets crashes instead of failing', C, 'build.configurations?.production?.budgets ?? []', 'build.configurations.production.budgets'],
  ['the declaration count ignores the types', C, 'builds.length * Object.keys(caps).length', 'builds.length'],
  ['the success line is printed on the error stream', C, "speaker.say('ok'", "speaker.complain('ok'"],
  ['a problem is printed on the success stream', C, 'for (const [id, params] of problems) speaker.complain(id, params);', 'for (const [id, params] of problems) speaker.say(id, params);'],
  ['a run with problems exits 0', C, 'return problems.length === 0 ? 0 : 1;', 'return 0;'],
  ['the caps are read from the checked folder', C, "path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json')", "path.join(process.cwd(), 'config.json')"],
  ['the CLI has no default folder', C, "process.argv[2] ?? '.'", 'process.argv[2]'],
  ['the CLI drops the exit code', C, 'process.exit(main(path.resolve(process.argv[2] ?? \'.\')));', 'main(path.resolve(process.argv[2] ?? \'.\'));'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof', 'bilingual-output'], selftest: 'gates-kit/angular/angular-budgets/check-budgets.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });
const speaker = makeSpeaker({
  clean: { en: 'check-budgets campaign: 0 survivors.', es: 'campaña de check-budgets: 0 supervivientes.' },
  survived: { en: 'check-budgets campaign: {count} survivor(s).', es: 'campaña de check-budgets: {count} superviviente(s).' },
});

if (survivors === 0) speaker.say('clean');
else speaker.complain('survived', { count: survivors });

process.exit(survivors === 0 ? 0 : 1);
