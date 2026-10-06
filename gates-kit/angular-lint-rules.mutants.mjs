#!/usr/bin/env node
/**
 * The decisions of the per-major angular-eslint rule table, each broken once, that
 * `angular-lint-rules.selftest.mjs` must catch. The runner and its rules (green baseline, exactly-once target,
 * parse check) live in `../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors
 * (`crashKills: 'fail'`). Each row names the decision it removes, not the line it edits.
 *
 * @es Las decisiones de la tabla de reglas de angular-eslint por major, rotas una a una, que
 * `angular-lint-rules.selftest.mjs` debe cazar. Una muerte solo por crash cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const A = 'gates-kit/angular-lint-rules.mjs';

const MUTANTS = [
  ['prefer-signals waits for 20', A, "['@angular-eslint/prefer-signals', 19]", "['@angular-eslint/prefer-signals', 20]"],
  ['no-experimental is on for 19, whose plugin lacks it', A, "['@angular-eslint/no-experimental', 20]", "['@angular-eslint/no-experimental', 19]"],
  ['no-developer-preview waits for 21', A, "['@angular-eslint/no-developer-preview', 20]", "['@angular-eslint/no-developer-preview', 21]"],
  ['prefer-inject is on for 19, whose guide shows constructors', A, "['@angular-eslint/prefer-inject', 20]", "['@angular-eslint/prefer-inject', 19]"],
  ['prefer-host-metadata-property is on for 19', A, "['@angular-eslint/prefer-host-metadata-property', 20]", "['@angular-eslint/prefer-host-metadata-property', 19]"],
  ['prefer-control-flow is on for 19', A, "['@angular-eslint/template/prefer-control-flow', 20]", "['@angular-eslint/template/prefer-control-flow', 19]"],
  ['prefer-service-decorator is on for 21, before @Service exists', A, "['@angular-eslint/prefer-service-decorator', 22]", "['@angular-eslint/prefer-service-decorator', 21]"],
  ['OnPush is on for 22, where it is the default', A, "'@angular-eslint/prefer-on-push-component-change-detection', 19, 21]", "'@angular-eslint/prefer-on-push-component-change-detection', 19]"],
  ['OnPush stops at 20', A, "'@angular-eslint/prefer-on-push-component-change-detection', 19, 21]", "'@angular-eslint/prefer-on-push-component-change-detection', 19, 20]"],
  ['OnPush waits for 20, so 19 grades without it', A, "'@angular-eslint/prefer-on-push-component-change-detection', 19, 21]", "'@angular-eslint/prefer-on-push-component-change-detection', 20, 21]"],
  ['the last major of a rule is ignored', A, ' && major <= to)', ')'],
  ['a rule is dropped from the table', A, "  ['@angular-eslint/no-experimental', 20],\n", ''],
  ['a rule is on only at its first major', A, '.filter(([, from, to = Infinity]) => major >= from && major <= to)', '.filter(([, from, to = Infinity]) => major === from && major <= to)'],
  ['rules are warnings', A, "[rule, 'error']", "[rule, 'warn']"],
  ['a template rule goes to the TypeScript plugin', A, 'pick(on.filter((rule) => !rule.startsWith(TEMPLATE_PREFIX)))', 'pick(on)'],
  ['template rules are dropped', A, 'template: pick(on.filter((rule) => rule.startsWith(TEMPLATE_PREFIX)))', 'template: {}'],
  ['a major outside the table takes a near one', A, 'if (!LINT_MAJORS.includes(major)) throw', 'if (false) throw'],
  ['Angular 23 is covered', A, 'LINT_MAJORS = [19, 20, 21, 22]', 'LINT_MAJORS = [19, 20, 21, 22, 23]'],
  ['a two-part version is read', A, " || String(version).split('.').length !== 3", ''],
  ['a non-numeric version is read', A, '!Number.isInteger(major) || ', ''],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof'], selftest: 'gates-kit/angular-lint-rules.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
