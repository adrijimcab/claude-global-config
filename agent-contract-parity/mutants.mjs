#!/usr/bin/env node
/**
 * The decisions of the shared contract-parity engine, each broken once, that `selftest.mjs` must catch: the
 * token boundary on each side, what counts as a token character, the three answers of the match, the
 * declaration checks, the contract-text reader, the verdict and the refusal. The campaign runner and its rules
 * (green baseline first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`.
 * A mutant is never deleted or softened to get a clean campaign: a survivor is a missing assertion.
 *
 * @es Las decisiones del motor compartido de paridad de contratos, rotas una a una, que `selftest.mjs` debe
 * cazar: la frontera de token en cada lado, qué es un carácter de token, las tres respuestas del casamiento,
 * las comprobaciones de la declaración, el lector del texto de contrato, el veredicto y el rechazo. Un mutante
 * nunca se borra ni se ablanda: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MATCH = 'agent-contract-parity/anchor-match.mjs';
const ANCHORS = 'agent-contract-parity/anchors-file.mjs';
const TEXT = 'agent-contract-parity/contract-text.mjs';
const PARITY = 'agent-contract-parity/parity.mjs';
const GUARD = 'agent-contract-parity/guard.mjs';
const REFUSAL = 'agent-contract-parity/refusal-text.mjs';
const ROOT = 'agent-contract-parity/project-root.mjs';
const PRESENCE = 'agent-contract-parity/contract-presence.mjs';
const HOME = 'agent-contract-parity/user-home.mjs';
const REAL = 'agent-contract-parity/real-path.mjs';

const TOKEN_LINE = "const TOKEN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';";

const MUTANTS = [
  // The boundary / La frontera
  ['no right boundary: M1 is carried by M10', MATCH, 'const rightOpen = !needsRightBoundary || !isTokenCharacter(text.charAt(at + anchor.length));', 'const rightOpen = true;'],
  ['no left boundary: M1 is carried by XM1', MATCH, 'const leftOpen = !needsLeftBoundary || !isTokenCharacter(text.charAt(at - 1));', 'const leftOpen = true;'],
  ['the boundary is always demanded, so a symbol-led anchor needs a left boundary', MATCH, 'const needsLeftBoundary = isTokenCharacter(anchor.charAt(0));', 'const needsLeftBoundary = true;'],
  ['the right boundary is always demanded', MATCH, 'const needsRightBoundary = isTokenCharacter(anchor.charAt(anchor.length - 1));', 'const needsRightBoundary = true;'],
  ['only the first occurrence is considered, so a later whole token is missed', MATCH, 'for (let at = text.indexOf(anchor); at !== -1; at = text.indexOf(anchor, at + 1)) {', 'for (let at = text.indexOf(anchor); at !== -1; at = -1) {'],
  ['a boundary needs BOTH sides open to carry the anchor', MATCH, 'if (leftOpen && rightOpen) return', 'if (leftOpen || rightOpen) return'],
  ['an anchor held only embedded reads as absent', MATCH, "return found ? 'embedded' : 'absent';", "return 'absent';"],
  ['an anchor held nowhere reads as embedded', MATCH, "return found ? 'embedded' : 'absent';", "return 'embedded';"],
  ['a digit is not a token character', MATCH, TOKEN_LINE, "const TOKEN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';"],
  ['an underscore is not a token character', MATCH, TOKEN_LINE, "const TOKEN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';"],
  ['a lowercase letter is not a token character', MATCH, TOKEN_LINE, "const TOKEN_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';"],
  ['an uppercase letter is not a token character', MATCH, TOKEN_LINE, "const TOKEN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789_';"],
  ['a hyphen is a token character, so M1-M8 does not carry M1', MATCH, TOKEN_LINE, "const TOKEN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';"],
  ['a dot is a token character, so a sentence-final M1. does not carry M1', MATCH, TOKEN_LINE, "const TOKEN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.';"],
  ['the empty string is a token character, so the text edge is not a boundary', MATCH, "(character) => character !== undefined && character !== '' && TOKEN_CHARACTERS.includes(character);", '(character) => TOKEN_CHARACTERS.includes(character);'],
  // The declaration / La declaración
  ['an absent declaration reads as invalid', ANCHORS, "if (!existsSync(file)) return { status: 'absent' };", "if (!existsSync(file)) return { status: 'invalid', problems: ['x'] };"],
  ['a malformed declaration is tolerated', ANCHORS, "return { status: 'invalid', problems: [`cannot be read as JSON:", "return { status: 'absent', problems: [`cannot be read as JSON:"],
  ['a byte-order mark is not stripped', ANCHORS, 'JSON.parse(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text)', 'JSON.parse(text)'],
  ['an array declaration is accepted as an object', ANCHORS, "typeof declaration !== 'object' || Array.isArray(declaration)", "typeof declaration !== 'object'"],
  ['an unknown key is tolerated', ANCHORS, "...unknown.map((key) =>", '...[].map((key) =>'],
  ['an empty english list is accepted', ANCHORS, "if (!Array.isArray(list) || list.length === 0) return [`\"${side}\" must be", "if (!Array.isArray(list)) return [`\"${side}\" must be"],
  ['an empty anchors list is accepted', ANCHORS, "if (!Array.isArray(list) || list.length === 0) return ['\"anchors\"", "if (!Array.isArray(list)) return ['\"anchors\""],
  ['a duplicated anchor is accepted', ANCHORS, 'if (seen.has(anchor)) problems.push', 'if (false) problems.push'],
  ['a blank anchor is accepted', ANCHORS, "typeof value === 'string' && value.trim() !== '';", "typeof value === 'string';"],
  ['a parent-climbing path is accepted', ANCHORS, ".split('/').includes('..')", ".split('/').includes('...')"],
  ['an absolute path is accepted', ANCHORS, 'if (path.win32.isAbsolute(value)) return', 'if (false) return'],
  ['a backslash climb is accepted', ANCHORS, ".split('\\\\').join('/')", '.split(String.fromCharCode(0)).join(String.fromCharCode(0))'],
  ['the spanish list is not validated', ANCHORS, "...listProblems(declaration, 'spanish'),", ''],
  ['the english list is not validated', ANCHORS, "...listProblems(declaration, 'english'),", ''],
  ['the anchors are not validated', ANCHORS, '...anchorProblems(declaration)', '...[]'],
  // The contract text / El texto de contrato
  ['a non-markdown file under a directory is read', TEXT, "name.endsWith(MARKDOWN_SUFFIX) && statSync", 'statSync'],
  ['the directory listing is not recursive', TEXT, '{ recursive: true }', '{ recursive: false }'],
  ['a missing path counts as a present file', TEXT, 'missing.push(declared);', 'texts.push(\'\');'],
  ['a directory path is read as a file', TEXT, 'if (stats.isDirectory()) texts.push', 'if (false) texts.push'],
  ['the files of a side are not joined', TEXT, "text: texts.join('\\n')", 'text: texts[0] ?? \'\''],
  // The verdict / El veredicto
  ['an embedded anchor counts as carried', PARITY, "presence.filter((entry) => entry.presence !== 'token')", "presence.filter((entry) => entry.presence === 'absent')"],
  ['embedded is reported for every missing anchor', PARITY, "presence.filter((entry) => entry.presence === 'embedded')", "presence.filter((entry) => entry.presence !== 'token')"],
  ['only a missing English side is skipped', PARITY, "spanish.present === 0 ? 'spanish' : undefined", 'undefined'],
  ['only a missing Spanish side is skipped', PARITY, "english.present === 0 ? 'english' : undefined", 'undefined'],
  ['a side with no file is compared as empty text instead of skipped', PARITY, 'if (absentSides.length > 0) return', 'if (false) return'],
  ['drift ignores the Spanish side', PARITY, 'inEnglish.missing.length > 0 || inSpanish.missing.length > 0', 'inEnglish.missing.length > 0'],
  ['drift ignores the English side', PARITY, 'inEnglish.missing.length > 0 || inSpanish.missing.length > 0', 'inSpanish.missing.length > 0'],
  ['the sides are swapped in the report', PARITY, 'missingInEnglish: inEnglish.missing', 'missingInEnglish: inSpanish.missing'],
  ['an invalid declaration reads as absent', PARITY, "return { status: 'invalid', problems: declaration.problems };", "return { status: 'absent' };"],
  // The refusal and the shim / El rechazo y el shim
  ['the English half is omitted from a missing-english line', REFUSAL, "line(id, { anchors: anchors.join(', ') })", "line(id, { anchors: anchors.slice(0, 1).join(', ') })"],
  ['a drift verdict produces no refusal', REFUSAL, "if (verdict.status !== 'drift') return undefined;", 'return undefined;'],
  ['an invalid verdict produces no refusal', REFUSAL, "if (verdict.status === 'invalid') return", "if (verdict.status === 'invalid-x') return"],
  ['the sides with nothing missing are still listed', REFUSAL, '.filter(([, anchors]) => anchors.length > 0);', ';'],
  ['the guard allows on a refusal', GUARD, "if (reason === undefined) return undefined;", 'return undefined;'],
  ['the guard allows an invalid declaration (reason lost)', GUARD, "permissionDecision: 'deny'", "permissionDecision: 'allow'"],
  ['the guard does not strip a byte-order mark', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['the guard ignores the project found upward', GUARD, 'if (root === undefined) return undefined;', 'if (root !== undefined) return undefined;'],
  // A project that owns a contract / Un proyecto con contrato propio
  ['a contract and no declaration reads as absent', PARITY, "ownsContract(root) ? 'undeclared' : 'absent'", "'absent'"],
  ['no contract and no declaration reads as undeclared', PARITY, "ownsContract(root) ? 'undeclared' : 'absent'", "'undeclared'"],
  ['an undeclared verdict produces no refusal', REFUSAL, "if (verdict.status === 'undeclared') return", "if (verdict.status === 'undeclared-x') return"],
  ['the refusal does not name the file to create', REFUSAL, "line('undeclared-create', { file: ANCHORS_FILE, schema: SCHEMA })", "line('undeclared-footer')"],
  ['the refusal does not show the schema', REFUSAL, "line('undeclared-create', { file: ANCHORS_FILE, schema: SCHEMA })", "line('undeclared-create', { file: ANCHORS_FILE, schema: '' })"],
  ['the refusal does not say which file is missing', REFUSAL, "line('undeclared-header', { file: ANCHORS_FILE }), line('undeclared-create'", "line('undeclared-footer'), line('undeclared-create'"],
  ['an AGENT-LEDGER does not make a contract', PRESENCE, 'if (existsSync(path.join(claudeDirectory, LEDGER_FILE))) return true;', 'if (false) return true;'],
  ['an unreadable CLAUDE.md is read anyway', PRESENCE, 'if (!isFile(instructions)) return false;', 'if (false) return false;'],
  ['a line opening with @ is always an import', PRESENCE, "return word.includes('/') || word.includes('.') ? word : undefined;", 'return word;'],
  ['a word with a dot is not an import', PRESENCE, "return word.includes('/') || word.includes('.') ? word : undefined;", "return word.includes('/') ? word : undefined;"],
  ['a word with a slash is not an import', PRESENCE, "return word.includes('/') || word.includes('.') ? word : undefined;", "return word.includes('.') ? word : undefined;"],
  ['the imported file need not exist', PRESENCE, '.some((imported) => isFile(', '.some((imported) => true || isFile('],
  ['an indented import is missed', PRESENCE, 'const trimmed = line.trim();', 'const trimmed = line;'],
  ['a tab does not end the imported word', PRESENCE, ".split(' ')[0].split('\\t')[0]", ".split(' ')[0]"],
  ['a ~/ import is resolved against the .claude directory', PRESENCE, 'imported.startsWith(HOME_PREFIX) ? path.join(homedir(), imported.slice(HOME_PREFIX.length)) : path.resolve(claudeDirectory, imported)', 'path.resolve(claudeDirectory, imported)'],
  ['the guard does not look for a CLAUDE.md project', GUARD, "const ROOT_MARKERS = [ANCHORS_FILE, '.claude/CLAUDE.md', '.claude/AGENT-LEDGER.md'];", "const ROOT_MARKERS = [ANCHORS_FILE, '.claude/AGENT-LEDGER.md'];"],
  ['the guard does not look for an AGENT-LEDGER project', GUARD, "const ROOT_MARKERS = [ANCHORS_FILE, '.claude/CLAUDE.md', '.claude/AGENT-LEDGER.md'];", "const ROOT_MARKERS = [ANCHORS_FILE, '.claude/CLAUDE.md'];"],
  ['the guard takes a user home for a project', GUARD, 'if (root !== undefined && !isUserHome(root)) return root;', 'if (root !== undefined) return root;'],
  ['the guard stops at the first marker even when it is a home', GUARD, 'if (root !== undefined && !isUserHome(root)) return root;', 'if (root !== undefined) return isUserHome(root) ? undefined : root;'],
  ['the process home is not a home', HOME, 'const homes = [homedir()];', 'const homes = [];'],
  ['the account profile is not a home', HOME, 'homes.push(userInfo().homedir);', ''],
  ['two different folders compare as the same', REAL, "=== '';", "!== '';"],
  ['a path that does not exist is not made absolute', REAL, '    return path.resolve(directory);', '    return directory;'],
  // Project resolution / Resolución del proyecto
  ['CLAUDE_PROJECT_DIR is ignored', ROOT, "typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR !== '' ? env.CLAUDE_PROJECT_DIR : undefined", 'undefined'],
  ['the cwd is not searched upward', ROOT, 'if (path.dirname(dir) === dir) return undefined;', 'return undefined;'],
  ['the payload cwd is ignored', ROOT, "typeof payload?.cwd === 'string' && payload.cwd !== '' ? payload.cwd : undefined", 'undefined']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['agent-contract-parity', 'brief-feasibility', 'hook-payloads', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'agent-contract-parity/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
