/**
 * Selftest cases of the sync wrapper (`sync-wrapper.mjs`, run as `sync.mjs`), on constructed fixtures and
 * a stand-in gentle-ai CLI only: it runs the real sync with the arguments untouched, then re-applies, then
 * checks; it refuses a sync the sync guard would refuse; and its exit code says whether anything is left
 * drifting. They live apart from selftest.mjs, which owns the harness and hands it in.
 *
 * @es Casos del selftest del envoltorio de sync (`sync-wrapper.mjs`, que se ejecuta como `sync.mjs`),
 * solo sobre fixtures construidos y un CLI de gentle-ai de mentira: corre el sync real con los argumentos
 * intactos, luego reaplica, luego comprueba; rechaza un sync que el guard de sync rechazaría; y su código
 * de salida dice si algo queda desviado. Viven aparte de selftest.mjs, que es dueño del arnés y lo entrega.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { syncOutcome } from './gentle-ai-cli.mjs';
import { syncThroughOverlay } from './sync-wrapper.mjs';

const CLAUDE = '.claude/CLAUDE.md';
const BEFORE = '## Section';
const AFTER = '## Next section';
const BLOCK = ['', 'Text sync keeps emitting.'];
const prune = { id: 'prune', kind: 'pruned-text-stays-pruned', file: CLAUDE, before: BEFORE, after: AFTER, block: BLOCK };
const owner = { id: 'owner', kind: 'owner-sections-outside-managed-regions', file: '.claude/rules/owner.md', anchors: ['# Mandate'] };
const claude = (middle) => ['# Pointer', BEFORE, ...middle, AFTER, ''].join('\n');

const withEs = (line) => /@es \S/.test(line);

export function registerSyncWrapperCases({ test, expect, newRoot, put, read, installFakeCli, completeHome, agentFile, run }) {
  /** A fixture with the fake CLI; `state` shapes what the fake sync does. @es Un fixture con el CLI falso; `state` define qué hace su sync. */
  const fixture = ({ file = claude([]), state = {}, withOwner = true } = {}) => {
    const context = installFakeCli(newRoot(), { enabled: false, ...state });
    put(context.home, CLAUDE, file);
    if (withOwner) put(context.home, owner.file, '# Mandate text\n');
    context.syncCalls = path.join(path.dirname(context.home), 'fake-cli', 'sync-calls.log');
    return context;
  };
  const calls = (context) => (existsSync(context.syncCalls) ? readFileSync(context.syncCalls, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  const wrap = (context, args = [], customizations = [owner, prune]) => {
    const lines = [];
    const exitCode = syncThroughOverlay({ args, customizations, context, stdio: 'pipe', log: (line) => lines.push(line) });
    return { exitCode, lines, text: lines.join('\n') };
  };
  const target = (context) => path.join(context.home, CLAUDE);

  test('sync wrapper: the arguments reach `gentle-ai sync` untouched, no shell in between', () => {
    const context = fixture();
    const args = ['--agent', 'claude-code', 'a b', '$(touch x)', ';echo hi', '--scope=global', ''];
    wrap(context, args);
    expect(JSON.stringify(calls(context)), JSON.stringify([args]), 'argv the fake sync saw');
  });

  test('sync wrapper: a sync that puts the pruned block back is undone by the apply that follows it -> exit 0, file pruned', () => {
    const context = fixture();
    installFakeCli(context, { enabled: false, syncWrites: { [target(context)]: claude(BLOCK) } });
    const { exitCode, text } = wrap(context);
    expect(calls(context).length, 1, 'sync calls');
    expect(read(context.home, CLAUDE), claude([]), 'file after the wrapper');
    expect(exitCode, 0, 'exit');
    expect(text.includes('APPLIED   prune'), true, `apply outcome shown (${text})`);
  });

  test('sync wrapper: the block already back before the sync (a raw sync happened) is allowed to sync, since sync can only undo it -> exit 0', () => {
    const context = fixture({ file: claude(BLOCK) });
    expect(wrap(context).exitCode, 0, 'exit');
    expect(calls(context).length, 1, 'sync calls');
    expect(read(context.home, CLAUDE), claude([]), 'file after the wrapper');
  });

  test('sync wrapper: a sync that rewords the block leaves it drifting -> exit 1 naming the upstream change, file untouched', () => {
    const context = fixture();
    const reworded = claude(['', 'Text sync now words differently.']);
    installFakeCli(context, { enabled: false, syncWrites: { [target(context)]: reworded } });
    const { exitCode, text } = wrap(context);
    expect(exitCode, 1, 'exit');
    expect(text.includes('upstream changed'), true, `finding shown (${text})`);
    expect(text.includes('REFUSED   prune') && text.includes('BROKEN       prune'), true, `apply refusal and final verdict shown (${text})`);
    expect(read(context.home, CLAUDE), reworded, 'file bytes');
  });

  test('sync wrapper: a failing sync exits with its code, and the apply and check still run', () => {
    const context = fixture();
    installFakeCli(context, { enabled: false, syncExit: 3, syncWrites: { [target(context)]: claude(BLOCK) } });
    const { exitCode, text } = wrap(context);
    expect(exitCode, 3, 'exit');
    expect(read(context.home, CLAUDE), claude([]), 'pruned again');
    expect(text.includes('exited 3'), true, `says so (${text})`);
  });

  test('sync wrapper: a sync killed by a signal is never a success -> non-zero exit, and the apply and check still run', () => {
    const context = fixture({ file: claude(BLOCK) });
    installFakeCli(context, { enabled: false, syncSignal: 'SIGKILL' });
    const { exitCode } = wrap(context);
    expect(exitCode !== 0, true, `exit (${exitCode})`);
    expect(read(context.home, CLAUDE), claude([]), 'pruned');
  });

  test('sync outcome: a child ended by a signal (status null) is a failure that names the signal; a status is kept as is', () => {
    const outcome = (result) => JSON.stringify(syncOutcome(result));
    expect(outcome({ status: null, signal: 'SIGKILL' }), JSON.stringify({ started: true, status: 1, note: 'killed by SIGKILL' }), 'killed');
    expect(outcome({ status: 0, signal: null }), JSON.stringify({ started: true, status: 0 }), 'clean');
    expect(outcome({ status: 3, signal: null }), JSON.stringify({ started: true, status: 3 }), 'failed');
    expect(outcome({ error: new Error('ENOENT'), status: null }), JSON.stringify({ started: false, reason: 'ENOENT' }), 'unstarted');
  });

  test('sync wrapper: a gentle-ai that cannot start -> exit 1, nothing applied, and it says so', () => {
    const context = fixture({ file: claude(BLOCK) });
    context.gentleAi = [path.join(path.dirname(context.home), 'no-such-gentle-ai')];
    const { exitCode, text } = wrap(context);
    expect(exitCode, 1, 'exit');
    expect(text.includes('could not run'), true, `message (${text})`);
    expect(read(context.home, CLAUDE), claude(BLOCK), 'file untouched');
  });

  test('sync wrapper: a customization sync would erase (not sync-safe) is broken -> refused BEFORE the sync, which never runs', () => {
    const context = fixture();
    put(context.home, owner.file, 'no mandate here\n');
    const { exitCode, text } = wrap(context);
    expect(exitCode, 1, 'exit');
    expect(calls(context).length, 0, 'sync calls');
    expect(text.includes('REFUSED') && text.includes('owner'), true, `refusal (${text})`);
  });

  test('sync wrapper: a customization that could not be verified refuses the sync like a broken one', () => {
    const context = fixture();
    const persona = { id: 'persona', kind: 'persona-region-matches-upstream', file: CLAUDE, region: 'persona' };
    const { exitCode } = wrap(context, [], [persona, prune]);
    expect(exitCode, 1, 'exit');
    expect(calls(context).length, 0, 'sync calls');
  });

  test('sync wrapper: --dry-run previews only, past a broken customization: no preflight, no apply; the exit is the current verdict', () => {
    const context = fixture({ file: claude(BLOCK) });
    put(context.home, owner.file, 'no mandate here\n');
    for (const [index, spelling] of ['--dry-run', '--dry-run=true'].entries()) {
      const broken = wrap(context, [spelling]);
      expect(calls(context).length, index + 1, `sync calls (${spelling})`);
      expect(broken.exitCode, 1, `exit while drifting (${spelling})`);
      expect(read(context.home, CLAUDE), claude(BLOCK), `nothing was applied (${spelling})`);
    }
    const clean = fixture();
    expect(wrap(clean, ['--dry-run=true']).exitCode, 0, 'exit while clean');
    expect(calls(clean).length, 1, 'sync calls while clean');
  });

  test('sync wrapper: --dry-run=false is a real sync, so a broken customization refuses it', () => {
    const context = fixture();
    put(context.home, owner.file, 'no mandate here\n');
    expect(wrap(context, ['--dry-run=false']).exitCode, 1, 'exit');
    expect(calls(context).length, 0, 'sync calls');
  });

  test('sync wrapper: its own prose lines carry both languages', () => {
    const context = fixture({ file: claude(BLOCK) });
    const { lines } = wrap(context);
    const prose = lines.filter((line) => line.startsWith('[gentle-ai overlay sync]'));
    expect(prose.length >= 2, true, `prose lines (${lines.join(' | ')})`);
    prose.forEach((line) => expect(withEs(line), true, `line "${line}"`));
    const refused = wrap(fixture({ withOwner: false }), []).lines.filter((line) => line.startsWith('[gentle-ai overlay sync]'));
    refused.forEach((line) => expect(withEs(line), true, `refusal line "${line}"`));
    const unstarted = fixture();
    unstarted.gentleAi = [path.join(path.dirname(unstarted.home), 'no-such-gentle-ai')];
    wrap(unstarted).lines.filter((line) => line.startsWith('[gentle-ai overlay sync]')).forEach((line) => expect(withEs(line), true, `unstarted line "${line}"`));
  });

  // The CLI itself, on the REAL customization list, through the environment seams a hook uses.
  // @es El CLI mismo, sobre la lista REAL de personalizaciones, por las costuras de entorno de un hook.
  const cliEnv = (context) => ({ ...process.env, GENTLE_AI_OVERLAY_HOME: context.home, GENTLE_AI_OVERLAY_CLI_SCRIPT: context.fakeCli, GOMODCACHE: context.modCache });
  const syncCalls = (context) => path.join(path.dirname(context.home), 'fake-cli', 'sync-calls.log');

  test('sync.mjs on the real list: all held -> runs the sync with the given arguments and exits 0', () => {
    const context = completeHome();
    const result = run('sync.mjs', ['--agent', 'claude-code'], cliEnv(context));
    expect(result.status, 0, `exit (${result.stdout}${result.stderr})`);
    expect(readFileSync(syncCalls(context), 'utf8').trim(), JSON.stringify(['--agent', 'claude-code']), 'argv the fake sync saw');
  });

  test('sync.mjs on the real list: owner text inside a managed region is broken and not sync-safe -> exit 1, the sync never runs', () => {
    const context = completeHome();
    put(context.home, '.claude/CLAUDE.md', read(context.home, '.claude/CLAUDE.md').replace('<!-- gentle-ai:persona -->', '<!-- gentle-ai:persona -->\r\n# Configuración propia del dueño: vive fuera de este archivo'));
    const result = run('sync.mjs', [], cliEnv(context));
    expect(result.status, 1, 'exit');
    expect(existsSync(syncCalls(context)), false, 'sync ran');
    expect(result.stdout.includes('claude-md-owner-sections-outside-managed-regions'), true, `names the broken one (${result.stdout})`);
  });
}
