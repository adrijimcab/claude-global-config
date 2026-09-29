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
