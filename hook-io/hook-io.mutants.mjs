#!/usr/bin/env node
/**
 * The decisions of `hook-io/hook-io.mjs`, each broken once, that `hook-io.selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that only
 * crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `hook-io.mjs`, rotas una a una, que `hook-io.selftest.mjs` debe detectar. Un mutante que
 * solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const H = 'hook-io/hook-io.mjs';

const MUTANTS = [
  // --- parsing ---
  ['the BOM is not stripped', H, "raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw", 'raw'],
  ['the BOM test strips any first character', H, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw.slice(1)'],
  ['the parse error loses its Spanish half', H, ' @es Payload de hook inválido: no es JSON.', ''],
  ['the parse error loses its English half', H, 'Invalid hook payload: not JSON.', ''],
  ['the parse error loses its cause', H, '{ cause }', '{}'],
  ['the tolerant parse rethrows', H, '  } catch {\n    return undefined;\n  }\n}\n\n/**\n * Why', '  } catch (error) {\n    throw error;\n  }\n}\n\n/**\n * Why'],
  ['the tolerant parse turns a valid null into undefined', H, 'return parsePayload(raw);', 'return parsePayload(raw) ?? undefined;'],
  ['the failure message reports the wrapper, not the parser cause', H, '(error.cause ?? error).message', 'error.message'],
  ['the failure message of a non-error is dropped', H, ': String(error));\n\n/** All', ': undefined);\n\n/** All'],

  // --- stdin ---
  ['the stream is decoded as latin1', H, "toString('utf8');\n}\n\n/** A PreToolUse", "toString('latin1');\n}\n\n/** A PreToolUse"],
  ['only the first chunk is read', H, 'for await (const chunk of stream) chunks.push(Buffer.from(chunk));', 'for await (const chunk of stream) { chunks.push(Buffer.from(chunk)); break; }'],
  ['the raw bytes come back decoded as text', H, '  return Buffer.concat(chunks);', "  return Buffer.concat(chunks).toString('utf8');"],
  ['the raw bytes lose their first byte', H, '  return Buffer.concat(chunks);', '  return Buffer.concat(chunks).subarray(1);'],
  ['the text reader does not decode the bytes', H, "return (await readStdinBytes(stream)).toString('utf8');", 'return readStdinBytes(stream);'],

  // --- shapers ---
  ['deny does not say deny', H, "permissionDecision: 'deny'", "permissionDecision: 'allow'"],
  ['deny names the wrong event', H, "hookEventName: 'PreToolUse', permissionDecision", "hookEventName: 'Stop', permissionDecision"],
  ['deny drops the reason', H, 'permissionDecisionReason: reason', 'permissionDecisionReason: undefined'],
  ['advise refuses', H, "hookEventName: 'PreToolUse', additionalContext: context", "hookEventName: 'PreToolUse', permissionDecision: 'deny', additionalContext: context"],
  ['advise drops the context', H, "hookEventName: 'PreToolUse', additionalContext: context } });", "hookEventName: 'PreToolUse', additionalContext: undefined } });"],
  ['context names a fixed event', H, 'hookEventName: event, additionalContext: text', "hookEventName: 'PreToolUse', additionalContext: text"],
  ['context drops the text', H, 'hookEventName: event, additionalContext: text', 'hookEventName: event, additionalContext: undefined'],
  ['context refuses', H, 'hookEventName: event, additionalContext: text', "hookEventName: event, permissionDecision: 'deny', additionalContext: text"],
  ['blockStop does not block', H, "decision: 'block', reason", "decision: 'approve', reason"],
  ['blockStop drops the reason', H, "{ decision: 'block', reason, ...", "{ decision: 'block', ..."],
  ['blockStop always adds the context block', H, 'context === undefined ? {} :', 'false ? {} :'],
  ['blockStop names the wrong event', H, "hookEventName: 'Stop'", "hookEventName: 'PreToolUse'"],

  // --- evaluator ---
  ['the evaluator hands the raw text to the decision', H, 'await decide(parsePayload(raw))', 'await decide(raw)'],
  ['the evaluator does not await an async decision', H, 'return await decide(parsePayload(raw));', 'return decide(parsePayload(raw));'],
  ['a malfunction is not recorded', H, 'record(guard, { error:', '(() => {})(guard, { error:'],
  ['a malfunction loses the raw payload', H, 'String(error), raw });', 'String(error) });'],
  ['a malfunction is denied instead of allowed', H, '      return undefined;\n    }\n  };', "      return deny('malfunction');\n    }\n  };"],
  ['a malfunction is rethrown', H, '      return undefined;\n    }\n  };', '      throw error;\n    }\n  };'],
  ['the default record is silent', H, 'process.stderr.write(`${guard}', '(() => {})(`${guard}'],
  ['the default record loses its Spanish half', H, ' @es ${guard}: avería, se deja pasar.', ''],

  // --- main-only entry ---
  ['main runs always', H, 'if (isMain) main();', 'main();'],
  ['main never runs', H, 'if (isMain) main();', 'if (false) main();'],
  ['the entry point is not resolved to its real path', H, 'realpathSync.native(process.argv[1]) ===', 'path.resolve(process.argv[1]) ==='],
  ['the module path is not resolved to its real path', H, '=== realpathSync.native(fileURLToPath(moduleUrl))', '=== fileURLToPath(moduleUrl)'],
  ['an unresolvable path is never the main process', H, '    isMain = path.resolve(process.argv[1]) === path.resolve(fileURLToPath(moduleUrl));', '    isMain = false;'],
  ['an unresolvable path is taken as the main process', H, '    isMain = path.resolve(process.argv[1]) === path.resolve(fileURLToPath(moduleUrl));', '    isMain = true;'],

  // --- standalone hook ---
  ['hookMain prints a missing decision as null', H, 'if (output !== undefined) process', 'if (true) process'],
  ['hookMain never prints the decision', H, 'if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\\n`);', ''],
  ['hookMain prints without the line break', H, '${JSON.stringify(output)}\\n','${JSON.stringify(output)}'],
  ['hookMain stops reading after a failed read with a throw', H, '  } catch {\n    return;\n  }\n\n  const output', '  } catch (error) {\n    throw error;\n  }\n\n  const output']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-io'],
  selftest: 'hook-io/hook-io.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
