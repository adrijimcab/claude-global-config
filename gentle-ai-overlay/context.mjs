/**
 * Where the overlay looks: the home directory holding the managed files, and the Go module cache
 * holding gentle-ai's source, and the command that runs the gentle-ai CLI. All default to this
 * machine's real ones; `--home <dir>`, `--mod-cache <dir>` and `--gentle-ai-node-script <file>` (a node
 * script standing in for the CLI) point them at constructed fixtures, so the selftest never touches
 * live files or live gentle-ai state.
 */
import { homedir } from 'node:os';
import path from 'node:path';

function defaultModCache(home) {
  if (process.env.GOMODCACHE) return process.env.GOMODCACHE;
  const gopath = process.env.GOPATH?.split(path.delimiter)[0];
  return path.join(gopath || path.join(home, 'go'), 'pkg', 'mod');
}

function flagValue(argv, flag) {
  const at = argv.indexOf(flag);
  if (at < 0) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

/** @returns {{ home: string, modCache: string, gentleAi: string[] }} */
export function contextFromArgv(argv) {
  const home = flagValue(argv, '--home') ?? homedir();
  const fakeCli = flagValue(argv, '--gentle-ai-node-script');
  return {
    home,
    modCache: flagValue(argv, '--mod-cache') ?? defaultModCache(home),
    gentleAi: fakeCli === undefined ? ['gentle-ai'] : [process.execPath, fakeCli],
  };
}

/**
 * The context of a hook run by the dispatcher, which passes no flags: the same two fixture seams, read
 * from GENTLE_AI_OVERLAY_HOME and GENTLE_AI_OVERLAY_CLI_SCRIPT, which no real session sets.
 * @es El contexto de un hook que corre el dispatcher, que no pasa flags: las mismas dos costuras de
 * fixture, leídas de GENTLE_AI_OVERLAY_HOME y GENTLE_AI_OVERLAY_CLI_SCRIPT, que ninguna sesión real define.
 */
export function contextFromEnvironment(environment = process.env) {
  const home = environment.GENTLE_AI_OVERLAY_HOME;
  const fakeCli = environment.GENTLE_AI_OVERLAY_CLI_SCRIPT;
  return contextFromArgv([...(home ? ['--home', home] : []), ...(fakeCli ? ['--gentle-ai-node-script', fakeCli] : [])]);
}
