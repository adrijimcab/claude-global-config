#!/usr/bin/env node
/**
 * The decisions of the shared-resources declaration schema, each broken once, that
 * `declaration.selftest.mjs` must catch. The runner and its rules (green baseline first, exactly-once
 * targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del esquema de la declaración de recursos compartidos, rotas una a una, que
 * `declaration.selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FILE = 'shared-resource-guard/declaration.mjs';

const MUTANTS = [
  ['an unknown top-level key is accepted', FILE, 'const problems = unknownKeys(declaration, TOP_LEVEL_KEYS, \'file\');', 'const problems = [];'],
  ['an unknown resource key is accepted, so a misspelt key reads as "absent"', FILE, 'const problems = [...unknownKeys(resource, RESOURCE_KEYS, where), ...nameProblems(resource.name, where)];', 'const problems = [...nameProblems(resource.name, where)];'],
  ['the schema version is not checked', FILE, 'if (declaration.schemaVersion !== SCHEMA_VERSION) problems.push(', 'if (false) problems.push('],
  ['an empty resource list is accepted', FILE, 'declaration.resources.length === 0) {', 'declaration.resources.length === -1) {'],
  ['a resource that identifies no control action is accepted', FILE, 'if (!IDENTIFYING_KEYS.some((key) => resource[key] !== undefined)) {', 'if (false) {'],
  ['a duplicate name is accepted', FILE, 'names.filter((candidate, index) => isText(candidate) && names.indexOf(candidate) !== index)', 'names.filter(() => false)'],
  ['the port range is not enforced', FILE, 'port >= 1 && port <= HIGHEST_PORT', 'port >= 0 && port <= 99999999'],
  ['the description is optional', FILE, 'if (!isText(resource.description)) problems.push(', 'if (false) problems.push('],
  ['a name may start with a dash', FILE, ' || name.startsWith(\'-\')) return', ') return'],
  ['an environment variable name may start with a digit', FILE, '&& !\'0123456789\'.includes(name.charAt(0))', ''],
  ['a BOM breaks the reader', FILE, 'text.charCodeAt(0) === 0xfeff ? text.slice(1) : text', 'text'],
  ['an unusable file reads as absent', FILE, 'return { status: \'invalid\', file, problems: [`cannot be read as JSON', 'return { status: \'absent\', file, problems: [`cannot be read as JSON'],
  ['a relative home is not resolved against the project root', FILE, 'home: resource.home === undefined ? undefined : path.resolve(projectRoot, resource.home)', 'home: resource.home']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'shared-resource-guard/declaration.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
