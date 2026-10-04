/**
 * The words that name the subcommand path of a `gentle-ai` call (`sync`, or `review mode enable`),
 * read from its arguments: the leading non-flag words, up to the first help flag.
 *
 * A help flag (`--help`, `-h`) means gentle-ai prints help and runs nothing, so no word after it names
 * something that executes: `gentle-ai --help sync` and `gentle-ai review --help mode enable` yield no
 * subcommand that acts. The word `help` is an ordinary leading word here, so `gentle-ai help sync` is
 * `help` first and never reads as `sync`. Other flags are skipped, as before.
 *
 * @es Las palabras que nombran el camino de subcomandos de una llamada a `gentle-ai` (`sync`, o `review
 * mode enable`), leídas de sus argumentos: las primeras palabras que no son flags, hasta el primer flag de
 * ayuda. Un flag de ayuda (`--help`, `-h`) hace que gentle-ai imprima ayuda y no ejecute nada, así que
 * ninguna palabra posterior nombra algo que se ejecute. La palabra `help` es una palabra inicial más:
 * `gentle-ai help sync` es `help` primero y nunca se lee como `sync`. Los demás flags se saltan, como antes.
 */

const HELP_FLAGS = new Set(['--help', '-h']);

/** @param {string[]} args @returns {string[]} */
export function subcommandWords(args) {
  const helpAt = args.findIndex((arg) => HELP_FLAGS.has(arg));
  const beforeHelp = helpAt === -1 ? args : args.slice(0, helpAt);
  return beforeHelp.filter((arg) => !arg.startsWith('-'));
}
