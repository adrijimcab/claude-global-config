#!/usr/bin/env node
/**
 * Selftest of orphaned-work detection on a constructed repository: a stopped agent's dirty worktree, a
 * stopped agent's unintegrated commit, the same work under a live agent, an integrated worktree, a clean
 * one, a worktree outside the agent root, a registered worktree whose folder is gone, an unmeasurable
 * worktree, a non-delegation tool, and an ungoverned repository.
 * @es Selftest de la detección de trabajo huérfano sobre un repositorio construido, recorriendo cada estado.
 */

import { existsSync, mkdirSync, rmSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { baseConfig, cleanup, commitFiles, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { agentRecords } from '../../agent-liveness/liveness.mjs';
import { EXHAUSTED_TRANSCRIPT_BYTES, takeoverDeclaration } from '../../agent-liveness/holder.mjs';
import { absolutePathsIn, canonicalPath, declaredTenancies, delegationTouches, evaluate, evaluateWith, lastWorkedMs, parkedWork } from './guard.mjs';
import { agentDirectories } from './role-access.mjs';

const { check, finish } = suite();
const root = tempDir('orphan');

process.env.HOOK_STATE_DIR = path.join(root, 'state');

try {
  const repository = makeRepository(root);
  const worktreeOf = (name) => path.join(repository, '.claude', 'worktrees', name);
  const add = (name) => git(repository, 'worktree', 'add', '--quiet', '-b', name, worktreeOf(name));
  // `lastWorked: () => 0` = nobody has touched any worktree recently, so these cases isolate the agent-record
  // rule; the recent-work rule has its own cases below, on real modification and author times.
  // @es `lastWorked: () => 0` = nadie tocó ningún worktree hace poco; los casos de trabajo reciente van abajo.
  const parkedNames = (records = [], cwd = repository, tool = 'Agent', lastWorked = () => 0) => parkedWork({ tool_name: tool, cwd }, { records, lastWorked }).map(({ worktree }) => path.basename(worktree.path)).sort();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const backdateHead = (worktree) => git(worktree, 'commit', '--amend', '--no-edit', '--quiet', '--date', twoHoursAgo.toISOString());

  writeConfig(repository, baseConfig());
  check('no agent worktree: nothing parked', parkedNames(), []);

  add('agent-clean');
  add('agent-dirty');
  writeFile(worktreeOf('agent-dirty'), 'draft.txt', 'x\n');
  add('agent-committed');
  commitFiles(worktreeOf('agent-committed'), { 'done.txt': 'x\n' });
  backdateHead(worktreeOf('agent-committed'));
  add('agent-landed');
  commitFiles(worktreeOf('agent-landed'), { 'landed.txt': 'x\n' });
  // develop moves first, so the pick is a NEW commit with the same patch: `git cherry` marks it `-`.
  commitFiles(repository, { 'develop-only.txt': 'x\n' }, 'chore: develop moves on');
  git(repository, 'cherry-pick', 'agent-landed');
  git(repository, 'worktree', 'add', '--quiet', '-b', 'outside', path.join(root, 'outside'));
  writeFile(path.join(root, 'outside'), 'draft.txt', 'x\n');

  check('dirty and unintegrated stopped worktrees are parked; clean, landed and outside ones are not', parkedNames(), ['agent-committed', 'agent-dirty']);
  check('a Task delegation sees the same', parkedNames([], repository, 'Task'), ['agent-committed', 'agent-dirty']);
  check('a non-delegation tool is not judged', parkedNames([], repository, 'Bash'), []);
  check('the counts are named', parkedWork({ tool_name: 'Agent', cwd: repository }, { records: [], lastWorked: () => 0 }).find(({ worktree }) => worktree.branch === 'agent-committed')?.work, { dirty: 0, unintegrated: 1 });

  const transcript = writeFile(root, 't/live.jsonl', '{}\n');

  check('a live agent\'s dirty worktree is not parked', parkedNames([{ id: 'agent-x', worktree: 'agent-dirty', worktreePath: worktreeOf('agent-dirty'), transcript }]), ['agent-committed']);

  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);

  utimesSync(transcript, old, old);
  check('a stopped agent (stale transcript) is parked again', parkedNames([{ id: 'agent-x', worktree: 'agent-dirty', worktreePath: worktreeOf('agent-dirty'), transcript }]), ['agent-committed', 'agent-dirty']);

  rmSync(worktreeOf('agent-dirty'), { recursive: true, force: true });
  check('a registered worktree whose folder is gone holds nothing on disk', parkedNames(), ['agent-committed']);

  // The delegation's target repository decides, not the session's. @es Decide el repositorio destino de la delegación, no el de la sesión.
  const briefed = (prompt) => parkedWork({ tool_name: 'Agent', cwd: repository, tool_input: { prompt } }, { records: [], lastWorked: () => 0 }).map(({ worktree }) => path.basename(worktree.path));
  const elsewhere = path.join(root, 'another-repo').replaceAll('\\', '/');

  check('a brief working only in another repository is not judged here', briefed(`Work only in ${elsewhere}/tool and commit there.`), []);
  check('a brief naming a path inside this repository is judged', briefed(`Read ${repository}\\src\\a.ts and also ${elsewhere}`), ['agent-committed']);
  check('a brief naming no absolute path is judged (nothing says where it works)', briefed('Fix the failing test.'), ['agent-committed']);
  check('a path is read up to whitespace, quote, backtick or bracket, normalised', absolutePathsIn('see `C:\\A\\B c` and "d:/x/y" (E:/z) noC:/no'), ['c:/a/b', 'd:/x/y', 'e:/z']);
  check('a near miss of the repository root is another repository', delegationTouches({ tool_input: { prompt: `${repository}-copy/x` } }, repository), false);

  // --- The path recogniser is PLATFORM-correct: every spelling a brief can use for a location, folded to
  // one canonical key. The root is spelled by the platform the guard runs on, the brief by whoever wrote
  // it, so both go through the same reduction. A POSIX path is case-SENSITIVE; a drive or UNC path never is.
  // @es El reconocedor de rutas es correcto por PLATAFORMA: cada grafía de una ubicación se reduce a una
  // clave canónica. La raíz la escribe la plataforma del guard y el brief quien lo redactó, así que ambos
  // pasan por la misma reducción. Una ruta POSIX distingue mayúsculas; una de unidad o UNC no.
  check('a POSIX absolute path is read, case kept, sentence punctuation dropped', absolutePathsIn('see /home/u/Repo/x, and "/opt/y".', 'linux'), ['/home/u/Repo/x', '/opt/y']);
  check('a UNC path is read and folded', absolutePathsIn('at \\\\Srv\\Share\\a b', 'win32'), ['//srv/share/a']);
  check('a Git Bash drive path is the drive path on Windows', absolutePathsIn('open /c/Users/Me/x now', 'win32'), ['c:/users/me/x']);
  check('a Git Bash drive path is a plain POSIX path elsewhere', absolutePathsIn('open /c/Users/Me/x now', 'linux'), ['/c/Users/Me/x']);
  check('a POSIX path that is no Git Bash drive is no path on Windows', absolutePathsIn('open /home/u/x now', 'win32'), []);
  check('a lone Git Bash switch is no path on Windows', absolutePathsIn('run cmd /c dir and /c', 'win32'), []);
  check('a drive path is read on every platform', absolutePathsIn('C:\\A\\B', 'linux'), ['c:/a/b']);
  check('doubled separators fold to one', absolutePathsIn('C:\\\\Users\\\\Me and /home//u///x', 'linux'), ['c:/users/me', '/home/u/x']);
  check('words that merely contain a slash are no paths', absolutePathsIn('and/or ./a/b ../c/d src/e/f.ts ~/g/h https://h.example/x // a / b', 'linux'), []);
  check('a path after an equals sign or a quote is read', absolutePathsIn('--cwd=/srv/a --other="/srv/b"', 'linux'), ['/srv/a', '/srv/b']);

  const brief = (prompt, root, platform) => delegationTouches({ tool_input: { prompt } }, root, platform);

  check('a POSIX brief path inside a POSIX root touches it', brief('Work in /home/u/repo/src.', '/home/u/repo', 'linux'), true);
  check('a POSIX root keeps its case on a POSIX platform: a brief path of the same case touches it', brief('Work in /home/U/Repo/src.', '/home/U/Repo', 'linux'), true);
  check('a POSIX brief path in a sibling folder does not', brief('Work in /home/u/repo-copy/src', '/home/u/repo', 'linux'), false);
  check('POSIX paths differing only by case are different places', brief('Work in /home/u/REPO/src', '/home/u/repo', 'linux'), false);
  check('a Git Bash brief path touches a Windows root, whatever the case', brief('Work in /c/users/ME/repo/src', 'C:/Users/me/repo', 'win32'), true);
  check('a backslash drive brief path touches a Windows root', brief('Work in C:\\Users\\Me\\repo\\src', 'C:/Users/me/repo', 'win32'), true);
  check('a Git Bash sibling of a Windows root does not touch it', brief('Work in /c/users/me/repo-copy', 'C:/Users/me/repo', 'win32'), false);
  check('a UNC brief path touches a UNC root', brief('Work in \\\\SRV\\share\\repo\\x', '//srv/Share/repo', 'win32'), true);
  check('a root with a trailing slash is the same root', brief('Work in /home/u/repo/x', '/home/u/repo/', 'linux'), true);
  check('a brief naming only a Windows path is elsewhere for a POSIX root', brief('Work in C:\\Users\\Me\\other', '/home/u/repo', 'linux'), false);
  check('a brief naming no path at all is judged', brief('Fix the failing test, see and/or ./a/b', '/home/u/repo', 'linux'), true);

  writeConfig(repository, baseConfig({ integrationBranches: ['no-such-branch'] }));
  check('every unmeasurable worktree is refused, never read as clean', parkedWork({ tool_name: 'Agent', cwd: repository }, { records: [], lastWorked: () => 0 }).filter(({ work }) => work.unmeasurable !== undefined).length, 3);
  writeConfig(repository, baseConfig());

  const output = await evaluate(JSON.stringify({ tool_name: 'Agent', cwd: repository, tool_input: {} }));

  check('evaluate refuses the delegation and names the worktree', [output?.hookSpecificOutput.permissionDecision, output?.hookSpecificOutput.permissionDecisionReason?.includes('agent-committed')], ['deny', true]);
  // --- A launch that cannot write is told about the parked work, never refused; a writer still is.
  // The role is read from its definition (project `.claude/agents` first, then the install's `agents/`).
  // @es Un lanzamiento que no puede escribir recibe la nota del trabajo aparcado, sin rechazo; un escritor sí
  // se rechaza. El rol se lee de su definición (`.claude/agents` del proyecto y luego `agents/` de la instalación).
  const defineRole = (name, frontmatter) => writeFile(repository, `.claude/agents/${name}.md`, `---\nname: ${name}\n${frontmatter}\n---\nbody\n`);

  defineRole('probe-readonly', 'tools: Read, Glob, Grep');
  defineRole('probe-writer', 'tools: Read, Write');
  defineRole('probe-editor', 'tools: Read, Edit');
  defineRole('probe-notebook', 'tools: Read, NotebookEdit');
  defineRole('probe-all', 'tools: []');
  defineRole('probe-all-closed', 'tools: []\ndisallowedTools: Write, Edit, NotebookEdit, Bash, PowerShell');
  defineRole('probe-all-no-shell-closed', 'tools: []\ndisallowedTools: Write, Edit, NotebookEdit');
  defineRole('probe-bash-only', 'tools: Read, Bash');
  defineRole('probe-powershell-only', 'tools: Read, PowerShell');
  defineRole('probe-bash-closed', 'tools: []\ndisallowedTools: Write, Edit, NotebookEdit, PowerShell');
  defineRole('probe-powershell-closed', 'tools: []\ndisallowedTools: Write, Edit, NotebookEdit, Bash');
  defineRole('probe-all-half-closed', 'tools: []\ndisallowedTools: Write, Edit');
  defineRole('probe-no-tools-line', 'description: x');
  // Shapes YAML reads differently from a comma split: each one fails closed, read-only tools or not.
  // @es Formas que YAML lee distinto de un corte por comas: cada una falla cerrada, sean o no de solo lectura.
  defineRole('probe-flow-writer', 'tools: [Read, Write]');
  defineRole('probe-flow-readonly', 'tools: [Read, Grep]');
  defineRole('probe-quoted', 'tools: "Read, Write"');
  defineRole('probe-quoted-token', 'tools: Read, "Write"');
  defineRole('probe-block-list', 'tools:\n  - Read\n  - Write');
  defineRole('probe-bare-tools', 'tools:');
  defineRole('probe-repeated-key', 'tools: Read\ntools: Read, Write');
  // Scoped tools and MCP tools. @es Herramientas con ámbito y herramientas MCP.
  defineRole('probe-scoped-shell', 'tools: Read, Bash(npm:*)');
  defineRole('probe-scoped-write', 'tools: Read, Write(src/**)');
  defineRole('probe-mcp-write', 'tools: Read, mcp__github__create_or_update_file');
  defineRole('probe-mcp-read', 'tools: Read, mcp__plugin_engram_engram__mem_search');
  // The judges' X1 examples: a YAML multi-line plain scalar, and a key spelled with a space before its colon.
  // @es Los ejemplos X1 de los jueces: un escalar plano YAML de varias líneas y una clave con espacio antes de los dos puntos.
  defineRole('probe-continued', 'tools: Read,\n  Write');
  defineRole('probe-spaced-key', 'tools: Read\ntools : Write');
  defineRole('probe-blank-continued', 'tools: Read,\n\n  Write');
  defineRole('probe-blank-then-key', 'tools: Read\n\nmodel: haiku');
  defineRole('probe-scoped-disallow', 'tools: Read, Bash\ndisallowedTools: Bash(rm:*)');
  defineRole('probe-write-disallowed', 'tools: Read, Write\ndisallowedTools: Write');
  // A definition that exists and cannot be read: a folder where the file should be.
  // @es Una definición que existe y no se puede leer: una carpeta donde debería estar el fichero.
  mkdirSync(path.join(repository, '.claude', 'agents', 'probe-unreadable.md'), { recursive: true });

  const launch = async (subagentType) => {
    const output = await evaluate(JSON.stringify({ tool_name: 'Agent', cwd: repository, tool_input: subagentType === undefined ? {} : { subagent_type: subagentType } }));
    const specific = output?.hookSpecificOutput;

    if (specific === undefined) return 'allow';

    return specific.permissionDecision === 'deny' ? 'deny' : (specific.additionalContext ?? '').includes('agent-committed') ? 'note' : 'note-without-the-worktree';
  };

  check('Explore (built-in, no file) passes with the parked-work note', await launch('Explore'), 'note');
  check('Plan (built-in, no file) passes with the note', await launch('Plan'), 'note');
  check('claude-code-guide (built-in, no file) passes with the note', await launch('claude-code-guide'), 'note');
  check('general-purpose is refused', await launch('general-purpose'), 'deny');
  check('a launch with no subagent_type is general-purpose: refused', await launch(undefined), 'deny');
  check('an unknown role is refused', await launch('no-such-role-anywhere'), 'deny');
  check('a custom role whose tools exclude Write, Edit and NotebookEdit passes with the note', await launch('probe-readonly'), 'note');
  check('a role declaring Write is refused', await launch('probe-writer'), 'deny');
  check('a role declaring Edit is refused', await launch('probe-editor'), 'deny');
  check('a role declaring NotebookEdit is refused', await launch('probe-notebook'), 'deny');
  check('a role with every tool (`tools: []`) is refused', await launch('probe-all'), 'deny');
  check('every tool minus the write tools and both shells is read-only', await launch('probe-all-closed'), 'note');
  check('every tool minus the three write tools still reaches a shell: refused', await launch('probe-all-no-shell-closed'), 'deny');
  check('a Bash-only role can commit or redirect: refused', await launch('probe-bash-only'), 'deny');
  check('a PowerShell-only role can write through a command: refused', await launch('probe-powershell-only'), 'deny');
  check('every tool but Bash closed still reaches Bash: refused', await launch('probe-bash-closed'), 'deny');
  check('every tool but PowerShell closed still reaches PowerShell: refused', await launch('probe-powershell-closed'), 'deny');
  check('every tool minus only two write tools still writes', await launch('probe-all-half-closed'), 'deny');
  check('a role file with no `tools:` line is refused, never read as read-only', await launch('probe-no-tools-line'), 'deny');
  // A read-only definition that EXISTS one folder above the agents folder: only the name check keeps it out of reach.
  // @es Una definición de solo lectura que EXISTE una carpeta por encima de la de agentes: solo la comprobación del nombre la deja fuera de alcance.
  writeFile(repository, '.claude/probe-outside.md', '---\nname: probe-outside\ntools: Read\n---\nbody\n');
  check('a role name that walks out of the agents folder is refused', await launch('../probe-outside'), 'deny');
  check('the install\'s read-only judge (jd-judge-a) passes with the note', await launch('jd-judge-a'), 'note');
  check('the install\'s read-only judge (jd-judge-b) passes with the note', await launch('jd-judge-b'), 'note');
  check('the project agents folder is searched first, then the install agents folder', [agentDirectories(repository)[0] === path.join(repository, '.claude', 'agents'), agentDirectories(repository).length, existsSync(path.join(agentDirectories(repository)[1] ?? '', 'jd-judge-a.md'))], [true, 2, true]);
  check('a flow list naming Write is refused', await launch('probe-flow-writer'), 'deny');
  check('a flow list of read tools is refused too: the reader does not read flow lists', await launch('probe-flow-readonly'), 'deny');
  check('a quoted tools value is refused', await launch('probe-quoted'), 'deny');
  check('a quoted Write token is refused', await launch('probe-quoted-token'), 'deny');
  check('a block list is refused', await launch('probe-block-list'), 'deny');
  check('a bare tools key (null inherits every tool) is refused', await launch('probe-bare-tools'), 'deny');
  check('a repeated tools key (YAML keeps the last, which writes) is refused', await launch('probe-repeated-key'), 'deny');
  check('a scoped shell Bash(npm:*) is refused', await launch('probe-scoped-shell'), 'deny');
  check('a scoped Write(src/**) is refused', await launch('probe-scoped-write'), 'deny');
  check('an MCP tool is out of scope: it cannot redo repository work', await launch('probe-mcp-write'), 'note');
  check('an MCP read tool passes with the note', await launch('probe-mcp-read'), 'note');
  check('a multi-line tools value (YAML continues the scalar) is refused', await launch('probe-continued'), 'deny');
  check('a tools key spelled with a space before its colon is refused', await launch('probe-spaced-key'), 'deny');
  check('a tools value continued after a blank line is refused', await launch('probe-blank-continued'), 'deny');
  check('a blank line before the next key leaves a read-only role', await launch('probe-blank-then-key'), 'note');
  check('a scoped disallowedTools leaves the rest of Bash open: refused', await launch('probe-scoped-disallow'), 'deny');
  check('a write tool closed by disallowedTools leaves a read-only role', await launch('probe-write-disallowed'), 'note');
  check('a role file that exists but cannot be read is refused', await launch('probe-unreadable'), 'deny');

  const refusal = async (subagentType) => (await evaluate(JSON.stringify({ tool_name: 'Agent', cwd: repository, tool_input: { subagent_type: subagentType } })))?.hookSpecificOutput.permissionDecisionReason ?? '';

  check('the refusal of an unreadable role file shows the read error', (await refusal('probe-unreadable')).includes('probe-unreadable cannot be read ('), true);
  check('the refusal of an unread shape names the shape', (await refusal('probe-flow-readonly')).includes('does not read ([Read)'), true);
  check('the refusal of an unread shape says it counts as a writer, in both languages', [(await refusal('probe-repeated-key')).includes('counts as a WRITER because its definition was not read'), (await refusal('probe-repeated-key')).includes('@es El rol lanzado cuenta como ESCRITOR')], [true, true]);
  check('a readable writer is refused without an unread-definition line', (await refusal('probe-writer')).includes('was not read'), false);
  check('the install\'s writing fixer (jd-fix-agent) is refused', await launch('jd-fix-agent'), 'deny');
  check('the install\'s `tools: []` reviewer (review-risk) is refused', await launch('review-risk'), 'deny');
  const note = (await evaluate(JSON.stringify({ tool_name: 'Agent', cwd: repository, tool_input: { subagent_type: 'Explore' } })))?.hookSpecificOutput.additionalContext ?? '';

  check('the note says it is information only', note.includes('information only'), true);
  check('the note is bilingual, Spanish after English', [note.includes('@es TRABAJO HUÉRFANO (fleet-kit, solo información)'), note.includes('@es Un lanzamiento que escribe sigue rechazado'), note.indexOf('information only') < note.indexOf('@es TRABAJO HUÉRFANO')], [true, true, true]);

  defineRole('claude-code-guide', 'tools: Read, Write');
  check('a role file overrides the built-in of the same name: a writing definition is refused', await launch('claude-code-guide'), 'deny');
  rmSync(path.join(repository, '.claude', 'agents', 'claude-code-guide.md'));

  check('an ungoverned repository is not judged', parkedNames([], root), []);
  check('a malformed payload fails open', await evaluate('nope'), undefined);

  // Recent work with no agent record: a session's workers writing the worktree by absolute path.
  // @es Trabajo reciente sin registro de agente: workers de una sesión que escriben el worktree por ruta absoluta.
  add('agent-busy');
  commitFiles(worktreeOf('agent-busy'), { 'step-1.txt': 'x\n' });
  backdateHead(worktreeOf('agent-busy'));
  const fresh = writeFile(worktreeOf('agent-busy'), 'step-2.txt', 'x\n');

  check('a worktree with a file written just now is live work, not parked', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-busy'), false);
  utimesSync(fresh, twoHoursAgo, twoHoursAgo);
  check('the same worktree untouched for two hours is parked', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-busy'), true);

  add('agent-fresh-commit');
  commitFiles(worktreeOf('agent-fresh-commit'), { 'step.txt': 'x\n' });
  check('a commit authored just now is live work even with a clean tree', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-fresh-commit'), false);

  git(worktreeOf('agent-busy'), 'mv', 'step-1.txt', 'renamed.txt');
  utimesSync(path.join(worktreeOf('agent-busy'), 'renamed.txt'), new Date(), new Date());
  check('a rename is timed by its destination', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-busy'), false);

  // Work stacked on another worktree's live branch is that branch's work, judged on its own.
  // @es El trabajo apilado sobre la rama viva de otro worktree es de esa rama, que se juzga aparte.
  const parkedWorkOf = (name) => parkedWork({ tool_name: 'Agent', cwd: repository }, { records: [], lastWorked: () => 0 }).find(({ worktree }) => worktree.branch === name)?.work;
  const liveBase = [{ id: 'base-agent', worktree: 'stack-base', worktreePath: worktreeOf('stack-base'), transcript }];
  const stackedOn = (base, name) => git(repository, 'worktree', 'add', '--quiet', '-b', name, worktreeOf(name), base);

  utimesSync(transcript, new Date(), new Date());
  add('stack-base');
  commitFiles(worktreeOf('stack-base'), { 'base-1.txt': 'x\n' }, 'feat: base one');
  commitFiles(worktreeOf('stack-base'), { 'base-2.txt': 'x\n' }, 'feat: base two');
  stackedOn('stack-base', 'stack-empty');
  stackedOn('stack-base', 'stack-own');
  commitFiles(worktreeOf('stack-own'), { 'own.txt': 'x\n' }, 'feat: own');
  const stackNames = () => parkedNames(liveBase).filter((name) => name.startsWith('stack-'));

  check('a worktree stacked on a live branch with no commits of its own is not parked', stackNames().includes('stack-empty'), false);
  check('a stacked worktree with one commit of its own is parked, and that one commit is the count', [stackNames().includes('stack-own'), parkedWork({ tool_name: 'Agent', cwd: repository }, { records: liveBase, lastWorked: () => 0 }).find(({ worktree }) => worktree.branch === 'stack-own')?.work.unintegrated], [true, 1]);
  check('the base keeps its own commits counted once it stops', parkedWorkOf('stack-base')?.unintegrated, 2);

  // --- A DECLARED TAKEOVER OF AN UNRESUMABLE HOLDER (2026-10-26, P1-5). The incident: a worktree with
  // unlanded commits whose agent held a 21.87 MB transcript; resume-before-fresh advised the replacement and
  // this guard refused it. The records are read back from a constructed harness store with `agentRecords`,
  // so their shape is the real one.
  // @es UN RELEVO DECLARADO DE UN TITULAR IRREANUDABLE. El incidente: un worktree con commits sin aterrizar
  // cuyo agente tenía un transcript de 21,87 MB; resume-before-fresh aconsejaba el relevo y este guard lo
  // rechazaba. Los registros se leen de un store construido con `agentRecords`: su forma es la real.
  const harness = (agents) => {
    const store = path.join(root, `store-${Math.random().toString(16).slice(2)}`);
    for (const { id, worktree, sizeBytes = 100, session = 'session-1', age = twoHoursAgo } of agents) {
      const folder = path.join(store, 'C--repo', session, 'subagents');

      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description: `errand ${id}`, worktreePath: worktreeOf(worktree) }));

      const transcript = path.join(folder, `agent-${id}.jsonl`);

      writeFileSync(transcript, '{}\n');
      truncateSync(transcript, sizeBytes);
      utimesSync(transcript, age, age);
    }

    return agentRecords(store);
  };
  const taken = (records, prompt, session = 'session-1') => parkedWork({ session_id: session, tool_name: 'Agent', cwd: repository, tool_input: { prompt } }, { records, lastWorked: () => 0 }).map(({ worktree }) => path.basename(worktree.path)).filter((name) => name.startsWith('take-')).sort();
  const tenancy = (name) => takeoverDeclaration(worktreeOf(name)).en;

  add('take-a');
  commitFiles(worktreeOf('take-a'), { 'a.txt': 'x\n' }, 'feat: work a');
  backdateHead(worktreeOf('take-a'));
  add('take-b');
  commitFiles(worktreeOf('take-b'), { 'b.txt': 'x\n' }, 'feat: work b');
  backdateHead(worktreeOf('take-b'));

  const INCIDENT = 21_870_000;
  const unresumableA = harness([{ id: 'ac19aff0000000000', worktree: 'take-a', sizeBytes: INCIDENT }, { id: 'aBHOLDER00000000', worktree: 'take-b' }]);

  check('INCIDENT: the replacement declaring the unresumable holder\'s worktree is not refused over it', taken(unresumableA, `GOAL: finish it.\n${tenancy('take-a')}`), ['take-b']);
  check('(d) the same unresumable holder WITHOUT a declaration still refuses', taken(unresumableA, 'GOAL: finish it.'), ['take-a', 'take-b']);
  check('(c) a TENANCY of ANOTHER worktree clears nothing', taken(unresumableA, tenancy('take-b')), ['take-a', 'take-b']);
  check('worktree A taken over, parked worktree B (resumable holder, undeclared) still refuses', taken(unresumableA, tenancy('take-a')).includes('take-b'), true);
  check('(b) a declared takeover of a RESUMABLE holder still refuses', taken(harness([{ id: 'aSMALL0000000000', worktree: 'take-a' }]), tenancy('take-a')), ['take-a', 'take-b']);
  check('(e) a declared worktree with NO holder record keeps today\'s refusal', taken([], tenancy('take-a')), ['take-a', 'take-b']);
  check('(a) a holder at exactly the ledger threshold is resumable: still refused', taken(harness([{ id: 'aEDGE00000000000', worktree: 'take-a', sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES }]), tenancy('take-a')), ['take-a', 'take-b']);
  check('(a) one byte past the ledger threshold is unresumable: cleared', taken(harness([{ id: 'aOVER00000000000', worktree: 'take-a', sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1 }]), tenancy('take-a')), ['take-b']);
  // Resumable FROM THIS SESSION, inside the window: the same answer resume-before-fresh gives (2026-10-26).
  // @es Reanudable DESDE ESTA SESIÓN y dentro de la ventana: la misma respuesta que da resume-before-fresh.
  const foreign = harness([{ id: 'aFOREIGN00000000', worktree: 'take-a', session: 'session-2' }]);
  const stale = harness([{ id: 'aSTALE0000000000', worktree: 'take-a', age: new Date(Date.now() - 30 * 60 * 60 * 1000) }]);

  check('a declared takeover of a holder of ANOTHER session is cleared: it cannot be resumed from here', taken(foreign, tenancy('take-a')), ['take-b']);
  check('the same holder of another session, undeclared, still refuses', taken(foreign, 'GOAL: finish it.'), ['take-a', 'take-b']);
  check('a declared takeover of a holder outside the resume window is cleared', taken(stale, tenancy('take-a')), ['take-b']);
  check('the same stale holder, undeclared, still refuses', taken(stale, 'GOAL: finish it.'), ['take-a', 'take-b']);
  check('the holder is judged from the PAYLOAD session: seen from its own session it is resumable and refuses', taken(foreign, tenancy('take-a'), 'session-2'), ['take-a', 'take-b']);
  check('with no session id no holder is the dispatcher\'s own: a declared takeover is cleared', parkedWork({ tool_name: 'Agent', cwd: repository, tool_input: { prompt: tenancy('take-a') } }, { records: harness([{ id: 'aSMALL0000000000', worktree: 'take-a' }]), lastWorked: () => 0 }).map(({ worktree }) => path.basename(worktree.path)).filter((name) => name.startsWith('take-')), ['take-b']);
  check('the declaration is read by its path, never its wording', taken(unresumableA, `TENANCY: you write ONLY in ${worktreeOf('take-a')} now.`), ['take-b']);
  check('a TENANCY line with no colon declares nothing', taken(unresumableA, `TENANCY ${worktreeOf('take-a')}`), ['take-a', 'take-b']);
  // A drive letter carries a colon: the marker colon must be the one after the word, on every platform.
  // @es La letra de unidad lleva dos puntos: el del marcador debe ser el que sigue a la palabra, en toda plataforma.
  check('a TENANCY line with no marker colon declares none of its Windows paths', [...declaredTenancies({ tool_input: { prompt: 'TENANCY C:\\work\\take-a and C:\\work\\take-b' } }, 'win32')], []);
  check('a TENANCY line with a marker colon still declares its Windows paths', [...declaredTenancies({ tool_input: { prompt: 'TENANCY : C:\\work\\take-a and C:\\work\\take-b' } }, 'win32')], ['c:/work/take-a', 'c:/work/take-b']);
  check('a TENANCY inside a sentence declares nothing', taken(unresumableA, `See the TENANCY: ${worktreeOf('take-a')} line.`), ['take-a', 'take-b']);
  check('a TENANCY of a folder INSIDE the worktree is not that worktree', taken(unresumableA, `TENANCY: ${worktreeOf('take-a')}/src`), ['take-a', 'take-b']);
  check('the declared tenancies are the canonical paths on the marker lines', [...declaredTenancies({ tool_input: { prompt: `x\n- TENANCY: ${worktreeOf('take-a')}, and ${worktreeOf('take-b')}.\nTENANCYWISE: /nope` } })], [worktreeOf('take-a'), worktreeOf('take-b')].map((folder) => canonicalPath(folder)));
  check('a payload with no prompt declares nothing', declaredTenancies({ tool_input: {} }).size, 0);

  const refusedResumable = (await evaluateWith({ records: harness([{ id: 'aSMALL0000000000', worktree: 'take-a' }]), lastWorked: () => 0 })(JSON.stringify({ session_id: 'session-1', tool_name: 'Agent', cwd: repository, tool_input: { prompt: tenancy('take-a') } })))?.hookSpecificOutput?.permissionDecisionReason ?? '';

  check('the refusal of a declared resumable holder says to resume it, in both languages', [refusedResumable.includes('TENANCY declares this worktree, but its holder agent-aSMALL0000000000 is resumable'), refusedResumable.includes('instead of replacing it'), refusedResumable.includes('@es TENANCY declara este worktree')], [true, true, true]);

  const refusedNone = (await evaluateWith({ records: [], lastWorked: () => 0 })(JSON.stringify({ session_id: 'session-1', tool_name: 'Agent', cwd: repository, tool_input: { prompt: tenancy('take-a') } })))?.hookSpecificOutput?.permissionDecisionReason ?? '';

  check('the refusal of a declared worktree with no holder says a takeover needs an unresumable one', [refusedNone.includes('its holder is none'), refusedNone.includes('only from an UNRESUMABLE holder'), refusedNone.includes('IRREANUDABLE')], [true, true, true]);

  const refusedUndeclared = (await evaluateWith({ records: unresumableA, lastWorked: () => 0 })(JSON.stringify({ session_id: 'session-1', tool_name: 'Agent', cwd: repository, tool_input: { prompt: 'GOAL: finish it.' } })))?.hookSpecificOutput?.permissionDecisionReason ?? '';

  check('an undeclared parked worktree is described without a holder line', refusedUndeclared.includes('TENANCY declares'), false);

  const busyNow =lastWorkedMs({ path: worktreeOf('agent-busy') });

  check('the last-work time is the newest entry, not the old HEAD', Date.now() - busyNow < 60 * 1000, true);
  check('an unreadable worktree has no last-work time', lastWorkedMs({ path: path.join(root, 'no-such-worktree') }), 0);
} finally {
  cleanup(root);
}

finish('orphan-work');
