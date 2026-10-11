#!/usr/bin/env node
/**
 * The decisions of the contract path check, each broken once, that `selftest.mjs` must catch. The runner
 * and its rules (green unmutated baseline, exactly-once target, parse check) live in
 * `../mutation-proof/run-mutants.mjs`. Each row names the decision it removes, not the line it edits.
 *
 * @es Las decisiones del check de rutas de contrato, rotas una a una, que `selftest.mjs` debe cazar. Cada
 * fila nombra la decisión que elimina, no la línea que edita.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const C = 'contract-path-check/check.mjs';

const MUTANTS = [
  ['the home spelled out stops being a claimed root', C, ", `${home.split('\\\\').join('/')}/.claude/`]", ']'],
  ['Windows backslashes in the home are not folded to slashes', C, "home.split('\\\\').join('/')", 'home'],
  ['a near-miss prefix without its slash is claimed', C, "return ['~/.claude/',", "return ['~/.claude',"],
  ['a run cut by a placeholder is still claimed', C, 'if (!endsInPattern && claimed.length > 0)', 'if (claimed.length > 0)'],
  ['a bare prefix is claimed', C, 'if (!endsInPattern && claimed.length > 0)', 'if (!endsInPattern)'],
  ['the angle placeholder stops being a pattern', C, "const PATTERN_STARTS = '<*…{$[';", "const PATTERN_STARTS = '*…{$[';"],
  ['the glob stops being a pattern', C, "const PATTERN_STARTS = '<*…{$[';", "const PATTERN_STARTS = '<…{$[';"],
  ['the ellipsis stops being a pattern', C, "const PATTERN_STARTS = '<*…{$[';", "const PATTERN_STARTS = '<*{$[';"],
  ['the brace set stops being a pattern', C, "const PATTERN_STARTS = '<*…{$[';", "const PATTERN_STARTS = '<*…$[';"],
  ['the variable stops being a pattern', C, "const PATTERN_STARTS = '<*…{$[';", "const PATTERN_STARTS = '<*…{[';"],
  ['the bracket set stops being a pattern', C, "const PATTERN_STARTS = '<*…{$[';", "const PATTERN_STARTS = '<*…{$';"],
  ['a sentence period stays in the claimed path', C, "while (claimed.endsWith('.')) claimed = claimed.slice(0, -1);", ''],
  ['a path may not contain a slash', C, "0123456789._-/';", "0123456789._-';"],
  ['the scan stops at the first claim of a prefix', C, 'from = text.indexOf(prefix, end);', 'from = -1;'],
  ['the live home no longer confirms a claim', C, " || existsSync(path.join(home, '.claude', ...relative.split('/')))", ''],
  ['the checkout no longer confirms a claim', C, "existsSync(path.join(root, ...relative.split('/'))) ||", 'false ||'],
  ['an absent contract document passes silently', C, "unresolved.push({ doc, claim: '(the document itself is missing)' });", ''],
  ['a non-markdown rules file is scanned', C, ".filter((name) => name.endsWith('.md'))", '.filter(() => true)'],
  ['a root contract is dropped from the scan', C, "['CLAUDE.md', 'route-mandate.md', 'verification-contract.md']", "['CLAUDE.md', 'route-mandate.md']"],
  ['a missing rules directory is read anyway', C, 'const rules = existsSync(rulesDirectory)', 'const rules = true'],
  ['the inspected count never moves', C, 'inspected += 1;', ''],
  ['a claim is never confirmed', C, 'if (!isConfirmed(claim, { root, home }))', 'if (true)'],
  ['every claim is confirmed', C, 'if (!isConfirmed(claim, { root, home }))', 'if (false)'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['contract-path-check', 'mutation-proof', 'rules', 'CLAUDE.md', 'route-mandate.md', 'verification-contract.md'], selftest: 'contract-path-check/selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
