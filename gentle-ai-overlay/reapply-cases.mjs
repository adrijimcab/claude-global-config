/**
 * Selftest cases of the self-healing hooks: which shell commands can undo or change the sync-safe
 * customizations (`reapply-triggers.mjs`), the PostToolUse hook run through the REAL dispatcher, manifest and
 * settings entry, and the SessionStart hook. After a raw `gentle-ai sync` (not run through the wrapper) the
 * hook re-applies EVERY sync-safe customization — lazy sections, pruned text, the line replacement — and
 * never a customization that sync can erase. Constructed fixtures and a stand-in CLI only. They live apart
 * from selftest.mjs, which owns the harness and hands it in.
 *
 * @es Casos del selftest de los hooks que se reparan solos: qué comandos de shell pueden deshacer o cambiar
 * las personalizaciones seguras ante sync (`reapply-triggers.mjs`), el hook PostToolUse corrido por el
 * dispatcher, el manifiesto y la entrada de settings REALES, y el hook SessionStart. Tras un
 * `gentle-ai sync` crudo (no por el envoltorio) el hook reaplica TODA personalización segura ante sync —
 * secciones diferidas, texto podado, el reemplazo de línea— y nunca una que sync pueda borrar. Solo
 * fixtures construidos y un CLI de mentira. Viven aparte de selftest.mjs, que es dueño del arnés.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { applyAll, evaluateAll } from './invariants.mjs';
import { holdEveryInsertion } from './line-insertion-cases.mjs';
import { fullOrchestratorMd, lazyEntries, lazyEntryNamed, orchestratorMd } from './lazy-section-fixtures.mjs';
import { inspectSection, reconcileSection } from './lazy-section.mjs';
import { settingsHoldingTheReplacements } from './hook-command-cases.mjs';
import { reapplyTrigger } from './reapply-triggers.mjs';
import { reapplySyncSafe } from './reapply-hook-output.mjs';
import { readTextOrNull } from './text-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DISPATCH = path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs');
const POST_MANIFEST = path.join(HERE, '..', 'hook-dispatch', 'manifests', 'posttooluse-shell.json');
const MCP = 'mcp__engram__mem_search, mcp__engram__mem_save';

const TRIGGERS = [
  ['Bash', 'gentle-ai sync', 'sync'],
  ['Bash', 'cd x && gentle-ai sync --agents claude-code', 'sync'],
  ['Bash', 'gentle-ai sync --dry-run', null],
  ['Bash', 'echo gentle-ai sync', null],
  ['Bash', 'gentle-ai review mode enable --scope global', 'review-mode'],
  ['Bash', 'gentle-ai review mode disable --scope global', 'review-mode'],
  ['PowerShell', '& "C:\\go\\bin\\gentle-ai.exe" review mode enable --scope global', 'review-mode'],
  ['Bash', 'echo "x" \\; gentle-ai review mode enable', null],
  ['PowerShell', 'echo "x" \\; gentle-ai review mode enable', 'review-mode'],
  ['Bash', 'gentle-ai review mode status --json', null],
  ['Bash', 'gentle-ai review start --cwd .', null],
  ['Bash', 'gentle-ai review modes enable', null],
  ['Bash', 'other-tool review mode enable', null],
  // A help flag before the subcommand asks for help, it changes nothing. @es Un flag de ayuda antes del subcomando pide ayuda, no cambia nada.
  ['Bash', 'gentle-ai --help sync', null],
  ['Bash', 'gentle-ai -h sync', null],
  ['Bash', 'gentle-ai help sync', null],
  ['Bash', 'gentle-ai --help review mode enable', null],
  ['Bash', 'gentle-ai review --help mode enable', null],
  ['Bash', 'gentle-ai review mode --help disable', null],
  ['Bash', 'gentle-ai help review mode enable', null],
  ['PowerShell', 'gentle-ai --help sync', null],
  ['PowerShell', '& "C:\\go\\bin\\gentle-ai.exe" -h review mode enable', null],
  ['PowerShell', 'gentle-ai help review mode disable', null],
  ['Bash', 'gentle-ai --verbose sync', 'sync'],
  ['Bash', 'gentle-ai --verbose review mode enable', 'review-mode'],
  ['PowerShell', 'gentle-ai --verbose review mode enable', 'review-mode'],
];

const shellPayload = (command, tool = 'Bash') => JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { command }, tool_response: { stdout: '' } });

export function registerReapplyCases({ test, expect, newRoot, put, read, installFakeCli, completeHome, agentFile, run }) {
  const review = lazyEntryNamed('review-contract');
  const flags = ({ home, fakeCli }) => ['--home', home, '--gentle-ai-node-script', fakeCli];
  const claudeOf = (context) => read(context.home, review.file);
  /** A fixture home whose CLAUDE.md holds every lazy section, loaded, and the given CLI state. @es Un home con todas las secciones diferidas cargadas y el estado de CLI dado. */
  function loadedHome(cliState = { reviewGlobal: '' }, text = fullOrchestratorMd({ eol: '\r\n' })) {
    const context = installFakeCli(newRoot(), { enabled: false, ...cliState });
    put(context.home, review.file, text);
    holdEveryInsertion({ home: context.home, put, read });
    put(context.home, '.claude/settings.json', settingsHoldingTheReplacements());
    return context;
  }
  /** What the overlay makes of `text` with every section moved, computed with the pure logic only. @es Lo que el overlay hace del texto con toda sección movida, con la lógica pura. */
  const allMoved = (text, { keepReview = false } = {}) =>
    lazyEntries().reduce((current, entry) => {
      const keepLoaded = entry.loadedWhile === 'reviews-may-run' && keepReview;
      return reconcileSection(current, entry, { keepLoaded, stash: null, stashLabel: `~/${entry.stash}` }).text;
    }, text);
  /** The dispatcher, the way the harness runs it, pointed at a fixture home. @es El dispatcher como lo corre el harness, apuntando a un home de fixture. */
  const dispatchPost = (context, input, manifest = POST_MANIFEST) =>
    spawnSync(process.execPath, [DISPATCH, manifest], { input, encoding: 'utf8', env: { ...process.env, GENTLE_AI_OVERLAY_HOME: context.home, GENTLE_AI_OVERLAY_CLI_SCRIPT: context.fakeCli } });

  TRIGGERS.forEach(([tool, command, expected]) =>
    test(`trigger (${tool}): ${JSON.stringify(command)} -> ${expected}`, () => expect(reapplyTrigger(command, tool), expected, 'trigger')),
  );
  test('trigger: no command string -> null', () => expect(reapplyTrigger(undefined, 'Bash'), null, 'trigger'));

  test('wiring: settings run the dispatcher on PostToolUse Bash|PowerShell with the shell manifest, which lists the hook, whose registration matches', () => {
    const settings = JSON.parse(readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8'));
    const entries = (settings.hooks.PostToolUse ?? []).filter((entry) => entry.matcher === 'Bash|PowerShell' && entry.hooks.some((hook) => hook.command.includes('hook-dispatch/manifests/posttooluse-shell.json')));
    expect(entries.length, 1, 'settings entry');
    expect(JSON.parse(readFileSync(POST_MANIFEST, 'utf8')).guards.includes('../../gentle-ai-overlay/post-command-hook.mjs'), true, 'manifest lists the hook');
    const registration = JSON.parse(readFileSync(path.join(HERE, 'post-command-hook.mjs.hook-registration.json'), 'utf8'));
    expect(registration.registrations.map((entry) => `${entry.event}:${entry.matcher}`).join(), 'PostToolUse:Bash|PowerShell', 'hook registration');
  });

  test('dispatcher: a real sync with reviews off moves the review span and tells the user; exit 0', () => {
    const context = loadedHome({ reviewGlobal: '' }, orchestratorMd({ eol: '\r\n' }));
    const original = claudeOf(context);
    const result = dispatchPost(context, shellPayload('gentle-ai sync'));
    expect(result.status, 0, 'exit');
    expect(claudeOf(context), reconcileSection(original, review, { keepLoaded: false, stash: null, stashLabel: `~/${review.stash}` }).text, 'CLAUDE.md moved');
    expect(JSON.parse(result.stdout).systemMessage.includes('review contract moved'), true, `stdout (${result.stdout})`);
  });

  test('dispatcher: a raw sync that put EVERY lazy section back is followed by the apply of all of them, and the user is told which', () => {
    const context = loadedHome();
    const original = claudeOf(context);
    const result = dispatchPost(context, shellPayload('gentle-ai sync'));
    expect(claudeOf(context), allMoved(original), 'CLAUDE.md with every section moved');
    const message = JSON.parse(result.stdout).systemMessage;
    lazyEntries().forEach((entry) => expect(message.includes(`${entry.label} moved`), true, `message names ${entry.label} (${message})`));
    lazyEntries().forEach((entry) => expect(readTextOrNull(path.join(context.home, entry.stash)) !== null, true, `${entry.name}: stash written`));
  });

  test('dispatcher: a raw v2/v3 render moves the sections both renders share, keeps its delegation span loaded and names the refusal', () => {
    const context = loadedHome({ reviewGlobal: '' }, fullOrchestratorMd({ eol: '\r\n', regionId: 'sdd-orchestrator' }));
    const original = claudeOf(context);
    const delegation = lazyEntryNamed('delegation-and-verification');
    const message = JSON.parse(dispatchPost(context, shellPayload('gentle-ai sync')).stdout).systemMessage;
    const after = claudeOf(context);
    expect(inspectSection(after, review).form, 'moved', 'review contract moved');
    const span = (text) => text.slice(text.indexOf(delegation.start), text.indexOf(delegation.end));
    expect(span(after), span(original), 'the v3 delegation span is untouched');
    expect(readTextOrNull(path.join(context.home, delegation.stash)), null, 'no v4 stash written');
    expect(message.includes('lazy-delegation-and-verification') && message.includes('could not be re-applied'), true, `refusal named (${message})`);
  });

  test('dispatcher: a raw sync leaves a customization sync can ERASE alone (an enabled telemetry is not re-applied by the hook)', () => {
    const context = completeHome({ telemetryEnabled: true });
    dispatchPost(context, shellPayload('gentle-ai sync'));
    expect(evaluateAll(CUSTOMIZATIONS, context).find((result) => result.id === 'gentle-ai-telemetry-disabled').status, 'broken', 'still broken, for the apply command');
  });

  test('dispatcher: review mode enabled -> the review span is restored, the model is told to read its stash now, and the always-lazy sections stay moved', () => {
    const context = loadedHome();
    const original = claudeOf(context);
    applyAll(CUSTOMIZATIONS.filter((entry) => entry.kind === 'lazy-section'), context);
    installFakeCli(context, { enabled: false, reviewGlobal: 'on' });
    const output = JSON.parse(dispatchPost(context, shellPayload('gentle-ai review mode enable --scope global', 'PowerShell')).stdout);
    expect(claudeOf(context), allMoved(original, { keepReview: true }), 'only the review span is back');
    expect(output.hookSpecificOutput.hookEventName, 'PostToolUse', 'event');
    expect(output.hookSpecificOutput.additionalContext.includes(`read ~/${review.stash} IN FULL now`), true, 'model told to read');
    lazyEntries().filter((entry) => entry !== review).forEach((entry) => expect(output.hookSpecificOutput.additionalContext.includes(entry.stash), false, `${entry.name}: not announced for reading`));
  });

  test('dispatcher: nothing to re-apply -> silent; an unrelated command, or a tool the registration does not name, changes nothing and says nothing', () => {
    const context = loadedHome();
    applyAll(CUSTOMIZATIONS.filter((entry) => entry.kind === 'lazy-section'), context);
    const settled = claudeOf(context);
    expect(dispatchPost(context, shellPayload('gentle-ai sync')).stdout, '', 'a sync with nothing undone');
    expect(dispatchPost(context, shellPayload('ls -la')).stdout, '', 'unrelated command');
    expect(dispatchPost(context, JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { command: 'gentle-ai sync' } })).stdout, '', 'Edit tool');
    expect(claudeOf(context), settled, 'CLAUDE.md untouched');
  });

  test('dispatcher: a command that is not a sync or a mode change leaves every loaded section loaded, even though sections are waiting to be moved', () => {
    const context = loadedHome();
    const original = claudeOf(context);
    for (const command of ['ls -la', 'gentle-ai review mode status --json', 'gentle-ai sync --dry-run', 'echo gentle-ai sync']) {
      expect(dispatchPost(context, shellPayload(command)).stdout, '', `${command}: silent`);
      expect(claudeOf(context), original, `${command}: CLAUDE.md untouched`);
    }
  });

  test('dispatcher RED when unregistered: a manifest without the hook leaves every section loaded after a real sync', () => {
    const context = loadedHome();
    const original = claudeOf(context);
    const root = path.dirname(context.home);
    put(root, 'unregistered/silent.mjs', 'export const evaluate = () => undefined;\n');
    put(root, 'unregistered/posttooluse-shell.json', JSON.stringify({ event: 'PostToolUse', guards: ['./silent.mjs'] }));
    dispatchPost(context, shellPayload('gentle-ai sync'), path.join(root, 'unregistered', 'posttooluse-shell.json'));
    expect(claudeOf(context), original, 'CLAUDE.md untouched without the registration');
  });

  test('post-command hook run directly (not through the dispatcher): it names its own event, PostToolUse', () => {
    const context = loadedHome();
    applyAll(CUSTOMIZATIONS.filter((entry) => entry.kind === 'lazy-section'), context);
    installFakeCli(context, { enabled: false, reviewGlobal: 'on' });
    const env = { ...process.env, GENTLE_AI_OVERLAY_HOME: context.home, GENTLE_AI_OVERLAY_CLI_SCRIPT: context.fakeCli };
    const result = spawnSync(process.execPath, [path.join(HERE, 'post-command-hook.mjs')], { input: shellPayload('gentle-ai review mode enable'), encoding: 'utf8', env });
    expect(result.status, 0, 'exit');
    expect(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'PostToolUse', 'event');
  });

  test('post-command hook run directly: unreadable payload -> exit 0 and a systemMessage saying nothing was re-applied', () => {
    const result = spawnSync(process.execPath, [path.join(HERE, 'post-command-hook.mjs')], { input: 'not json', encoding: 'utf8' });
    expect(result.status, 0, 'exit');
    expect(JSON.parse(result.stdout).systemMessage.includes('NOT re-applied'), true, 'message');
  });

  // ------------------------------------------------------------ the re-apply itself, on an injected list

  const BEFORE = '## Section';
  const AFTER = '## Next section';
  const prune = { id: 'prune', kind: 'pruned-text-stays-pruned', file: '.claude/CLAUDE.md', before: BEFORE, after: AFTER, block: ['', 'Text sync keeps emitting.'] };
  const grants = { id: 'grants', kind: 'agent-tool-required', file: '.claude/agents/worker-x.md', tool: 'Bash' };
  const replace = { id: 'replace', kind: 'anchored-line-replacement', file: '.claude/skills/worker/SKILL.md', upstream: '- Run the full suite — ñandú.', replacement: '- Run only the scoped gates — ñandú.' };
  const plain = (middle) => ['# Pointer', BEFORE, ...middle, AFTER, ''].join('\n');

  test('re-apply: every sync-safe customization that is broken is applied, in one pass, and each outcome is announced', () => {
    const context = installFakeCli(newRoot(), { enabled: false });
    put(context.home, '.claude/CLAUDE.md', plain(['', 'Text sync keeps emitting.']));
    put(context.home, grants.file, agentFile({ tools: `Read, ${MCP}` }));
    put(context.home, replace.file, `# A skill\r\n\r\n${replace.upstream}\r\n`);
    const output = reapplySyncSafe(context, [prune, grants, replace]);
    expect(read(context.home, '.claude/CLAUDE.md'), plain([]), 'pruned');
    expect(read(context.home, replace.file), `# A skill\r\n\r\n${replace.replacement}\r\n`, 'line replaced');
    expect(read(context.home, grants.file), agentFile({ tools: `Read, ${MCP}` }), 'the tool grant is not sync-safe, so untouched');
    expect(output.systemMessage.includes('re-applied prune') && output.systemMessage.includes('replace'), true, `announced (${output.systemMessage})`);
  });

  test('re-apply: nothing broken -> nothing said; a refused customization is reported with its remedy and the file is untouched', () => {
    const context = installFakeCli(newRoot(), { enabled: false });
    put(context.home, '.claude/CLAUDE.md', plain([]));
    expect(JSON.stringify(reapplySyncSafe(context, [prune])), '{}', 'silent when held');
    const reworded = plain(['', 'Upstream reworded this.']);
    put(context.home, '.claude/CLAUDE.md', reworded);
    const refused = reapplySyncSafe(context, [{ ...prune, id: 'prune' }]);
    expect(read(context.home, '.claude/CLAUDE.md'), reworded, 'file untouched');
    expect(refused.systemMessage.includes('prune') && refused.systemMessage.includes('could not be re-applied'), true, `refusal named (${refused.systemMessage})`);
    expect(/@es \S/.test(refused.systemMessage), true, 'bilingual');
  });

  test('re-apply: the real list is the default, so the live customizations are what the hook heals', () => {
    const context = loadedHome({ reviewGlobal: '' });
    const output = reapplySyncSafe(context);
    expect(output.systemMessage.includes('review contract moved'), true, `real list applied (${output.systemMessage})`);
  });

  // ------------------------------------------------------------ session start

  test('session start: reviews off -> every section is moved before the drift check; global on -> the review span is restored and the model is told to read it', () => {
    const context = loadedHome();
    const original = claudeOf(context);
    const moved = run('session-start-hook.mjs', flags(context));
    expect(moved.status, 0, 'exit');
    expect(claudeOf(context), allMoved(original), 'every section moved at session start');
    expect(JSON.parse(moved.stdout).systemMessage.includes('review contract moved'), true, 'user told');
    installFakeCli(context, { enabled: false, reviewGlobal: 'on' });
    const restored = JSON.parse(run('session-start-hook.mjs', flags(context)).stdout);
    expect(claudeOf(context), allMoved(original, { keepReview: true }), 'review span restored at session start');
    expect(restored.hookSpecificOutput.additionalContext.includes('IN FULL now'), true, 'model told to read');
  });
}
