#!/usr/bin/env node
/**
 * The decisions of the clean-code checker, each broken once, that `check.selftest.mjs` must catch. The runner and
 * its rules (green baseline, exactly-once target, parse check) live in `../../mutation-proof/run-mutants.mjs`;
 * crash-only kills count as survivors (`crashKills: 'fail'`). Each row names the decision it removes, not the line
 * it edits.
 *
 * @es Las decisiones del checker de código limpio, rotas una a una, que `check.selftest.mjs` debe cazar. El
 * runner y sus reglas viven en `../../mutation-proof/run-mutants.mjs`; una muerte solo por crash cuenta como
 * superviviente. Cada fila nombra la decisión que quita, no la línea que edita.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../../mutation-proof/run-mutants.mjs';

const D = 'gates-kit/clean-code-profile/';
const SHELL = `${D}shell-commands.mjs`;
const CI = `${D}ci-jobs.mjs`;
const PATH = `${D}landing-path.mjs`;
const REACH = `${D}landing-reach.mjs`;
const ESLINT = `${D}eslint-verdicts.mjs`;
const TOOLS = `${D}tool-verdicts.mjs`;
const PARTS = `${D}verdict-parts.mjs`;
const PROFILE = `${D}profile.mjs`;
const CHECK = `${D}check.mjs`;
const CONFIGS = `${D}tool-configs.mjs`;
const FACTS = `${D}eslint-facts.mjs`;
const PROBE = `${D}layering-probe.mjs`;

const MUTANTS = [
  ['a semicolon stops separating commands', SHELL, "const SEPARATORS = ['&&', '||', ';', '|', ", "const SEPARATORS = ['&&', '||', '|', "],
  ['a quote never opens, so a separator inside it splits', SHELL, "    if (quote === null && (char === '\"' || char === \"'\")) quote = char;\n    else if", "    if (false) quote = char;\n    else if"],
  ['a separator inside quotes splits', SHELL, 'const separator = quote === null ? separatorAt(text, index) : undefined;', 'const separator = separatorAt(text, index);'],
  ['a word quote never closes', SHELL, 'started = true;\n    } else if (quote === char) quote = null;', 'started = true;\n    } else if (false) quote = null;'],
  ['an environment prefix is kept as the program', SHELL, 'if (ENV_ASSIGNMENT.test(first)) return argv.slice(1);', ''],
  ['cross-env is kept as the program', SHELL, "if (first === 'cross-env') return argv.slice(1);", ''],
  ['an npx flag is kept as the program', SHELL, "while (rest.length > 0 && rest[0].startsWith('-')) rest = rest.slice(1);", ''],
  ['an exec double dash is kept as the program', SHELL, "return argv.slice(argv[2] === '--' ? 3 : 2);", 'return argv.slice(2);'],
  ['yarn test names a script', SHELL, "if (manager !== 'yarn' && (verb === 'test' || verb === 'start')) return verb;", "if (verb === 'test' || verb === 'start') return verb;"],
  ['run-script names no script', SHELL, "if (verb === 'run' || verb === 'run-script') return name;", "if (verb === 'run') return name;"],
  ['an aggregator flag is a script name', SHELL, ".filter((word) => !word.startsWith('-'))", '.filter(() => true)'],
  ['npm-run-all is not an aggregator', SHELL, "new Set(['npm-run-all', 'run-s', 'run-p'])", "new Set(['run-s', 'run-p'])"],
  ['allow_failure false allows a failure', CI, "if (allow !== null && allow[1] !== 'false') allowFailure = true;", 'if (allow !== null) allowFailure = true;'],
  ['allow_failure at any depth is the job setting', CI, 'const ALLOW_FAILURE = /^ {2}allow_failure:', 'const ALLOW_FAILURE = /^ +allow_failure:'],
  ['a global keyword is a job', CI, "'stages', 'variables',", "'variables',"],
  ['a hidden template is a job', CI, "!start.name.startsWith('.') && ", ''],
  ['a YAML alias is a command', CI, " || text.startsWith('*')", ''],
  ['a comment is a command', CI, "text.startsWith('#') || ", ''],
  ['a sibling key does not end the script section', CI, 'indentOf(line) <= keyIndent', 'indentOf(line) < keyIndent'],
  ['a local hook enforces', PATH, "Object.freeze(['unit-suite', 'integration-script', 'ci-job'])", "Object.freeze(['unit-suite', 'integration-script', 'ci-job', 'hook'])"],
  ['a job allowed to fail enforces', PATH, "job.allowFailure ? 'ci-job-allowed-failure' : 'ci-job'", "'ci-job'"],
  ['a workspace-scoped run is followed', PATH, 'if (argv.some((word) => WORKSPACE_FLAGS.has(word))) continue;', ''],
  ['a pre script is not followed', PATH, 'followScript(`pre${name}`, context, here);', ''],
  ['a post script is not followed', PATH, 'followScript(`post${name}`, context, here);', ''],
  ['the unit suite is read from the wrong key', PATH, 'readJson(file)?.unitSuite?.npmScript', 'readJson(file)?.npmScript'],
  ['an eslint run is recognised by the wrong verb', REACH, "argv[0] === 'ng' && argv.includes('lint')", "argv[0] === 'ng' && argv.includes('lint2')"],
  ['a bare tsc is not a type check', REACH, "tsc: (argv) => argv[0] === 'tsc' || ", 'tsc: (argv) => '],
  ['depcruise alone is not recognised', REACH, "argv[0] === 'depcruise' || argv[0] === 'dependency-cruiser'", "argv[0] === 'dependency-cruiser'"],
  ['any npm command is an audit', REACH, "argv[0] === 'npm' && argv[1] === 'audit'", "argv[0] === 'npm'"],
  ['any enforcing command is the landing guard', REACH, "enforcing.some((record) => record.rootKind === 'unit-suite'),", 'enforcing.length > 0,'],
  ['a warning is an error', ESLINT, 'warn: 1,', 'warn: 2,'],
  ['the limit itself is over the limit', ESLINT, 'severity === 2 && actual <= gate.max', 'severity === 2 && actual < gate.max'],
  ['maxComplexity is not a limit', ESLINT, 'option.max ?? option.maxComplexity ?? ', 'option.max ?? '],
  ['a numeric option is not a limit', ESLINT, "if (typeof option === 'number') return option;", ''],
  ['a rule that is off is present', ESLINT, 'present: severity > 0,', 'present: true,'],
  ['a set with every rule missing is present', ESLINT, 'present: missing.length < gate.rules.length,', 'present: true,'],
  ['a tsconfig that is not strict is present', TOOLS, 'present: tsc.strict,', 'present: true,'],
  ['a cycle rule is always met', TOOLS, 'const meets = forbidsCycles(config.config);', 'const meets = true;'],
  ['two missing probes still meet the layering', TOOLS, 'meets: missing.length === 0,', 'meets: missing.length < 3,'],
  ['an equals flag reads the next word', TOOLS, "return word.includes('=') ? word.slice(word.indexOf('=') + 1) : argv[index + 1];", 'return argv[index + 1];'],
  ['the token minimum is exclusive', TOOLS, 'settings.minTokens <= JSCPD.minTokens', 'settings.minTokens < JSCPD.minTokens'],
  ['an unstated audit level is strict enough', TOOLS, 'AUDIT_LEVELS_AT_LEAST_HIGH.includes(auditLevel(record.argv))', "AUDIT_LEVELS_AT_LEAST_HIGH.includes(auditLevel(record.argv) ?? 'high')"],
  ['knip ignore debt is always reported', TOOLS, 'config?.ignoreEntries > 0', 'config?.ignoreEntries >= 0'],
  ['madge is always named', TOOLS, "facts.dependencies.includes('madge')", 'true'],
  ['the configuration alone enforces', PARTS, 'if (meets && found.enforcing.length > 0) verdict = ENFORCED;', 'if (meets) verdict = ENFORCED;'],
  ['complexity is allowed one over', PROFILE, "eslintRule('complexity', 'complexity', 'script', 13,", "eslintRule('complexity', 'complexity', 'script', 14,"],
  ['the max-lines-per-function default is lenient', PROFILE, "'max-lines-per-function', 'script', 100, 50,", "'max-lines-per-function', 'script', 100, 150,"],
  ['jscpd accepts 60 tokens as the floor', PROFILE, 'minTokens: 70, threshold: 0 }', 'minTokens: 60, threshold: 0 }'],
  ['the domain probe is dropped', PROFILE, "    Object.freeze({ id: 'domain-framework-free', from: 'src/app/domain/a.ts', to: '@angular/core' }),\n", ''],
  ['a strict run still exits 0', CHECK, 'if (options.strict && enforced < total) {', 'if (false) {'],
  ['four roots of a kind are listed by name', CHECK, 'named.length <= 3', 'named.length <= 4'],
  ['a second root is accepted', CHECK, '|| options.root !== undefined) return undefined;', '|| false) return undefined;'],
  ['a directory is refused as the root', CHECK, 'if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {', 'if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) {'],
  ['every project is an Angular project', CONFIGS, "Object.hasOwn(dependencies, '@angular/core') ? 'angular' : 'node'", "'angular'"],
  ['knip ignore lists are not counted', CONFIGS, 'if (/^ignore/.test(key) && Array.isArray(value))', 'if (/^ignorex/.test(key) && Array.isArray(value))'],
  ['knip workspaces are not counted', CONFIGS, 'return total + knipIgnoreEntries(value);', 'return total;'],
  ['a component is not preferred as the sample', FACTS, 'const preferred = underSource.find(', 'const preferred = undefined && underSource.find('],
  ['a nested template is as good as a root one', FACTS, "templates.find((file) => file.startsWith('src/')) ?? ", ''],
  ['a rule set is graded as one rule', `${D}verdicts.mjs`, "'eslint-rules-set': ruleSetVerdict,", "'eslint-rules-set': ruleVerdict,"],
  ['every project is graded on the Angular gates', `${D}verdicts.mjs`, 'return gatesOf(facts.stack).map((gate) => {', "return gatesOf('angular').map((gate) => {"],
  ['a warning rule forbids a dependency', PROBE, "rule.severity === 'error' && sideMatches(rule.from, probe.from)", 'sideMatches(rule.from, probe.from)'],
  ['a pathNot does not exempt', PROBE, '&& !negative.some((pattern) => pattern.test(target))', ''],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof', 'bilingual-output'], selftest: `${D}check.selftest.mjs`, mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
