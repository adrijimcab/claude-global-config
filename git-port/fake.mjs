/**
 * A scripted git for selftests: answers are declared per command, every call is recorded, and a command nobody
 * scripted is refused loudly, so a selftest never passes by asking git something it did not mean to.
 *
 * @es Un git guionado para selftests: las respuestas se declaran por orden, cada llamada queda registrada y una
 * orden que nadie guionó se rechaza con ruido, para que un selftest nunca pase preguntando algo que no quería.
 */

/**
 * @param {Record<string, { status?: number | null, stdout?: string, stderr?: string, timedOut?: boolean }>} script
 *   Keyed by the arguments joined with a space: `'rev-parse HEAD'`.
 * @returns {{ run: Function, ask: Function, calls: { cwd: string | undefined, args: string[], options: object | undefined }[] }}
 *   `run` has the shape of `runGit`; `ask(...args)` the shape of a `gitAsker`.
 */
export function createFakeGit(script) {
  const calls = [];

  function run(cwd, args, options) {
    const key = args.join(' ');

    calls.push({ cwd, args, options });
    if (!Object.hasOwn(script, key)) throw new Error(`The fake git was asked "git ${key}" and nobody scripted it. @es Al git falso se le pidió "git ${key}" y nadie lo guionó.`);

    return { status: 0, stdout: '', stderr: '', timedOut: false, ...script[key] };
  }

  return { run, ask: (...args) => run(undefined, args), calls };
}
