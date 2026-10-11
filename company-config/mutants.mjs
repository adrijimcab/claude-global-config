#!/usr/bin/env node
/**
 * The decisions of company-config, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`.
 * @es Las decisiones de company-config, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const NAMES = 'company-config/names.mjs';
const CONFIG = 'company-config/config.mjs';

const MUTANTS = [
  // --- names.mjs: the whole-word boundary.
  ['a digit next to a name no longer defeats the match', NAMES, "(character >= '0' && character <= '9') || ", ''],
  ['a letter next to a name no longer defeats the match (substring matching)', NAMES, 'character.toLowerCase() !== character.toUpperCase()', 'false'],
  ['the character BEFORE a hit is no longer checked', NAMES, '!isWordCharacter(lowered[at - 1]) && ', ''],
  ['the character AFTER a hit is no longer checked', NAMES, ' && !isWordCharacter(lowered[at + name.length])', ''],
  ['matching becomes case-sensitive', NAMES, 'const lowered = text.toLowerCase();', 'const lowered = text;'],
  ['a near miss ends the search, hiding a real hit later in the text', NAMES, '      from = at + 1;\n', '      break;\n'],
  ['the reported index is lost', NAMES, 'hits.push({ name, index: at });', 'hits.push({ name, index: 0 });'],

  // --- config.mjs: the list is validated, not trusted.
  ['an empty list is accepted', CONFIG, 'if (!Array.isArray(value) || value.length === 0) return undefined;', 'if (!Array.isArray(value)) return undefined;'],
  ['a blank or non-string entry is accepted', CONFIG, "if (!value.every((item) => typeof item === 'string' && item.trim().length > 0)) return undefined;", "if (!value.every((item) => typeof item === 'string')) return undefined;"],
  ['entries are no longer lower-cased', CONFIG, 'return value.map((item) => item.trim().toLowerCase());', 'return value.map((item) => item.trim());'],
  ['entries are no longer trimmed', CONFIG, 'return value.map((item) => item.trim().toLowerCase());', 'return value.map((item) => item.toLowerCase());'],
  ['a missing names list is no longer a problem', CONFIG, 'if (names === undefined) return', 'if (false) return'],
  ['a missing hosts list is no longer a problem', CONFIG, 'if (hosts === undefined) return', 'if (false) return'],
  ['an unreadable file yields an empty configuration instead of a problem', CONFIG, "return { problem: `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}` };", 'return { names: [], hosts: [] };'],
  ['the refusal loses its Spanish half', CONFIG, "    `@es ${guardName} RECHAZÓ este comando: falta la lista de nombres/hosts de repositorios de empresa o está vacía (${problem}).`,\n", ''],
  ['the refusal stops naming the problem', CONFIG, "    `${guardName} REFUSED this command: the company-repository name/host list is missing or empty (${problem}).`,", "    `${guardName} REFUSED this command: the company-repository name/host list is missing or empty.`,"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['company-config', 'mutation-proof'],
  selftest: 'company-config/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
