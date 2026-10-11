/**
 * A command the selftest runs through the gate summary: it behaves as its first argument says.
 * @es Una orden que el selftest corre a través del resumen de gates: se comporta como dice su primer argumento.
 */

const [mode] = process.argv.slice(2);

if (mode === 'clean') console.log('all good\n0 errors found');
if (mode === 'marks') console.log('everything passed\nTypeError: swallowed in a logger\nstill passed');
if (mode === 'fail') { console.log('step one\nError: the real cause'); process.exitCode = 3; }
if (mode === 'huge') { for (let line = 0; line < 20000; line += 1) console.log(`Error: noisy line ${String(line)}`); process.exitCode = 1; }
if (mode === 'cwd') console.log(process.cwd());
if (mode === 'stderr') { console.error('Error: on stderr only'); process.exitCode = 1; }
if (mode === 'sleep') setTimeout(() => {}, 30000);
