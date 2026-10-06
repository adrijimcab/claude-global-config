#!/usr/bin/env node
/**
 * The decisions of the `engines.node` reader, each broken once, that `node-range.selftest.mjs` must catch. The
 * runner and its rules (green baseline, exactly-once target, parse check) live in
 * `../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors (`crashKills: 'fail'`). Each row
 * names the decision it removes, not the line it edits.
 *
 * @es Las decisiones del lector de `engines.node`, rotas una a una, que `node-range.selftest.mjs` debe cazar.
 * Una muerte solo por crash cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const N = 'gates-kit/node-range.mjs';

const MUTANTS = [
  ['a host version may carry a prerelease', N, '/^v?(\\d+)\\.(\\d+)\\.(\\d+)$/', '/^v?(\\d+)\\.(\\d+)\\.(\\d+)/'],
  ['a partial host version is read', N, '/^v?(\\d+)\\.(\\d+)\\.(\\d+)$/', '/^v?(\\d+)\\.(\\d+)\\.?(\\d*)$/'],
  ['an unreadable host version answers instead of throwing', N, "if (match === null) throw new Error(`not an exact version", "if (match === null) return [0, 0, 0];\n  if (false) throw new Error(`not an exact version"],
  ['versions compare by major only', N, 'for (let index = 0; index < 3; index += 1) if', 'for (let index = 0; index < 1; index += 1) if'],
  ['a comparison reads lower as higher', N, 'left[index] < right[index] ? -1 : 1', 'left[index] < right[index] ? 1 : -1'],
  ['a wildcard part is read as a number', N, "if (part === undefined || /^[*xX]$/.test(part)) break;", 'if (part === undefined) break;'],
  ['a full version names no span', N, 'if (parts.length === 3) return { lower, upper: [lower[0], lower[1], lower[2] + 1] };', 'if (parts.length === 3) return { lower, upper: undefined };'],
  ['a partial span is one part too wide', N, 'upper[parts.length - 1] += 1;', 'upper[0] += 1;'],
  ['a bare wildcard accepts nothing', N, "if (parts.length === 0) return operator === '' || operator === '=' || operator === '>=' || operator === '<=';", 'if (parts.length === 0) return false;'],
  ['a bare version is only its lower bound', N, "case '=':\n      return compare(version, lower) >= 0 && below(upper);", "case '=':\n      return compare(version, lower) >= 0;"],
  ['>= excludes its own bound', N, "case '>=':\n      return compare(version, lower) >= 0;", "case '>=':\n      return compare(version, lower) > 0;"],
  ['> includes its own bound', N, "case '>':\n      return !below(upper);", "case '>':\n      return compare(version, lower) >= 0;"],
  ['< includes its own bound', N, "case '<':\n      return compare(version, lower) < 0;", "case '<':\n      return compare(version, lower) <= 0;"],
  ['<= stops at the lower bound', N, "case '<=':\n      return below(upper);", "case '<=':\n      return compare(version, lower) <= 0;"],
  ['a caret has no upper bound', N, "return compare(version, lower) >= 0 && compare(version, caretUpper(parts)) < 0;", 'return compare(version, lower) >= 0;'],
  ['a caret always holds the major', N, 'const at = pivot === -1 ? 0 : pivot;', 'const at = 0;'],
  ['a caret over a zero major ignores a given zero minor', N, "value !== 0 || index === parts.length - 1", 'value !== 0'],
  ['a caret keeps the parts after its pivot', N, 'index < at ? value : 0', 'value'],
  ['a tilde over a major alone holds the minor', N, 'parts.length === 1 ? [lower[0] + 1, 0, 0] : [lower[0], lower[1] + 1, 0]', '[lower[0], lower[1] + 1, 0]'],
  ['a tilde holds the major only', N, 'parts.length === 1 ? [lower[0] + 1, 0, 0] : [lower[0], lower[1] + 1, 0]', '[lower[0] + 1, 0, 0]'],
  ['an unreadable comparator answers instead of throwing', N, 'if (match === null) throw new Error(`unreadable comparator', 'if (match === null) return false;\n  if (false) throw new Error(`unreadable comparator'],
  ['an operator separated by a space is two tokens', N, ".replace(/(\\^|~|>=|<=|>|<|=)\\s+/g, '$1')", ''],
  ['an empty alternative is read as accepting all', N, 'if (alternatives.some((alternative) => comparators(alternative).length === 0)) throw', 'if (false) throw'],
  ['alternatives must all hold', N, 'return alternatives.some((alternative)', 'return alternatives.every((alternative)'],
  ['one comparator of a conjunction suffices', N, 'comparators(alternative).every((token)', 'comparators(alternative).some((token)'],
  ['the v prefix is refused', N, '/^v?(\\d+)', '/^(\\d+)'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof'], selftest: 'gates-kit/node-range.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
