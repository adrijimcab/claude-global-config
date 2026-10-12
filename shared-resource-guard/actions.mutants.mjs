#!/usr/bin/env node
/**
 * The decisions of the control-action recognisers (start, stop, reconfigure, listeners), each broken once,
 * that `actions.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de los reconocedores de acciones de control (arrancar, detener, reconfigurar, escuchas),
 * rotas una a una, que `actions.selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const START = 'shared-resource-guard/start-match.mjs';
const STOP = 'shared-resource-guard/stop-match.mjs';
const RECONFIGURE = 'shared-resource-guard/reconfigure-match.mjs';
const ACTIONS = 'shared-resource-guard/control-actions.mjs';
const LISTENERS = 'shared-resource-guard/listeners.mjs';
const PATHS = 'shared-resource-guard/path-words.mjs';

const MUTANTS = [
  // --- start -----------------------------------------------------------------------------------
  ['the executable is ignored, so reading the entry point (`cat bin/www`) is a start', START, '(index === 0 || launched) && executableName(word) === executableName(pattern[0])', '(index === 0 || launched)'],
  ['a launcher in front is not looked through', START, '(index === 0 || launched) &&', 'index === 0 &&'],
  ['the pattern words are not required', START, 'const found = wanted.every(', 'const found = true || wanted.every('],
  ['a path matches by suffix without a segment boundary', PATHS, 'spelled.endsWith(`/${wanted}`)', 'spelled.endsWith(wanted)'],
  ['the home is ignored, so another checkout starts the shared resource', START, 'if (home === undefined || wanted.some(isPathLike)) return true;', 'return true;'],
  ['a directory the cd cannot reveal is not a match', START, 'return directory === undefined || isInside(directory, home, platform);', 'return directory !== undefined && isInside(directory, home, platform);'],
  ['a sibling that shares the home prefix is inside the home', START, 'inner.startsWith(`${outer}/`)', 'inner.startsWith(outer)'],
  ['a path is always compared by suffix, never resolved against the home', START, 'if (home === undefined || directory === undefined) return endsAtSegment(argument, wanted, platform);', 'return endsAtSegment(argument, wanted, platform);'],

  // --- stop ------------------------------------------------------------------------------------
  ['an unresolvable target never widens to the whole script', STOP, 'const unresolvable = targets.length === 0 ||', 'const unresolvable = false &&'],
  ['a stop with no target of its own is judged on its own words only', STOP, 'const unresolvable = targets.length === 0 || ', 'const unresolvable = '],
  ['xargs and npx are not looked through', STOP, 'if (!WRAPPERS.has(executableName(words[at]))) return -1;', 'return -1;'],
  ['a pid is never attributed through the live listener table', STOP, 'pids.some((pid) => listeners(port).has(pid))', 'pids.some(() => false)'],
  ['a port is matched as a substring', STOP, 'return digitRuns(word).includes(text);', 'return word.includes(text);'],
  ['a bare number after any flag is a port', STOP, 'return word === text && (bareIsPort || PORT_FLAGS.has(String(previous).toLowerCase()));', 'return word === text;'],
  ['kill-port numbers are read as pids', STOP, 'const bareIsPort = executableName(words[at]) === PORT_ARGUMENT_EXECUTABLE;', 'const bareIsPort = false;'],
  ['a declared process name is never matched', STOP, '(resource.processNames ?? []).some((name) => executableName(name) === bare)', '(resource.processNames ?? []).some(() => false)'],
  ['a start path is never matched in a kill pattern', STOP, 'return byName || startPaths.some(', 'return byName || false && startPaths.some('],
  ['Stop-Process is not a stop executable', STOP, '\'taskkill\', \'stop-process\', \'spps\'', '\'taskkill\', \'spps\''],
  ['an option is read as a target', STOP, 'if (word.startsWith(\'-\')) return true;', 'if (false) return true;'],
  ['-LocalPort is not a port flag', STOP, 'new Set([\'-port\', \'-localport\', \'--port\', \'/port\'])', 'new Set([\'-port\', \'--port\', \'/port\'])'],

  // --- reconfigure -----------------------------------------------------------------------------
  ['a prefix assignment is not a reconfiguration', RECONFIGURE, 'if (prefix.some(assigns)) return true;', ''],
  ['names compare case-sensitively', RECONFIGURE, 'left.toLowerCase() === right.toLowerCase()', 'left === right'],
  ['export, declare and set do not assign', RECONFIGURE, 'new Set([\'export\', \'declare\', \'typeset\', \'readonly\', \'local\', \'set\'])', 'new Set([])'],
  ['any command with a NAME=value argument assigns (curl -d FRT_URL=x)', RECONFIGURE, 'if (ASSIGNING_EXECUTABLES.has(executable) && arguments_.some(assigns)) return true;', 'if (arguments_.some(assigns)) return true;'],
  ['setx is not a reconfiguration', RECONFIGURE, 'if (executable === \'setx\' &&', 'if (false &&'],
  ['$env: assignment is not recognised', RECONFIGURE, 'if (isPowerShellAssignment(', 'if (false && isPowerShellAssignment('],
  ['$env: += is not an assignment', RECONFIGURE, 'next.startsWith(\'=\') || next.startsWith(\'+=\')', 'next.startsWith(\'=\')'],
  ['a longer $env: name that starts with the declared one is taken for it', RECONFIGURE, 'const next = rest === \'\' ? following[0] ?? \'\' : rest;', 'const next = following[0] ?? rest;'],
  ['Env: drive writers are not recognised', RECONFIGURE, 'new Set([\'set-item\', \'si\', \'new-item\', \'ni\', \'remove-item\', \'ri\', \'clear-item\', \'cli\', \'set-content\'])', 'new Set([])'],
  ['SetEnvironmentVariable is not recognised', RECONFIGURE, 'return words[at]?.toLowerCase() === SET_ENVIRONMENT_VARIABLE &&', 'return false &&'],
  ['SetEnvironmentVariable of any name counts', RECONFIGURE, 'sameName((nextCommandWords[0] ?? \'\').split(\',\')[0], name)', 'true'],

  // --- composition -----------------------------------------------------------------------------
  ['a start is never reported', ACTIONS, 'if (startsResource(', 'if (false && startsResource('],
  ['a stop is never reported', ACTIONS, 'if (route !== undefined) found(', 'if (false) found('],
  ['the next command is not passed to the reconfigure recogniser', ACTIONS, 'const nextWords = paired[index + 1]?.command.words ?? [];', 'const nextWords = [];'],
  ['only the first resource is checked', ACTIONS, 'for (const resource of resources) {', 'for (const resource of resources.slice(0, 1)) {'],
  ['the script words are not collected for an unresolvable target', ACTIONS, 'const scriptWords = paired.flatMap(({ command }) => command.words);', 'const scriptWords = [];'],
  ['the listener table is asked on every call', ACTIONS, 'if (!known.has(port)) known.set(port, listeners(port));', 'known.set(port, listeners(port));'],

  // --- listeners -------------------------------------------------------------------------------
  ['a Windows line is taken whatever its state', LISTENERS, 'if (state?.trim() === LISTENING && local.endsWith(`:${port}`))', 'if (local.endsWith(`:${port}`))'],
  ['a Windows port matches as a substring', LISTENERS, 'local.endsWith(`:${port}`)', 'local.includes(String(port))'],
  ['a failing runner throws instead of giving an empty set', LISTENERS, '  } catch {\n    return new Set();\n  }', '  } catch (error) {\n    throw error;\n  }']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'shared-resource-guard/actions.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
