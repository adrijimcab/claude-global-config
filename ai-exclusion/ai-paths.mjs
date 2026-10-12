/**
 * The ONE declared list of AI tool paths a clone must never version. Owner rule: AI paths live in the clone's
 * `.git/info/exclude`, never in its versioned `.gitignore` (nothing about AI reaches the company remote).
 * Each entry carries the tool it belongs to. Entries are git exclude patterns, written as the clones'
 * own `.gitignore` files already write them.
 *
 * Every entry was measured on 2026-10-12 against BOTH tracked trees (b100-am-ui: 7986 tracked files;
 * di_1700002_discovery_fe: 1092) with `git ls-files -c -i -X <pattern>`: 0 tracked files match any entry. The
 * provisioning step re-measures this on every run and refuses to write when a clone tracks a match, so an
 * entry that stops being safe is found at once and is never hidden. `company-config` names tools, not paths,
 * so this list does not duplicate it; the path segments come from the tool directories that
 * `company-scan` and the b100 `.gitignore` already treat as AI tooling.
 *
 * @es La lista ÚNICA declarada de rutas de herramientas de IA que un clon nunca debe versionar. Regla del
 * dueño: las rutas de IA viven en el `.git/info/exclude` del clon, nunca en su `.gitignore` versionado. Cada
 * entrada lleva su herramienta y es un patrón de exclusión de git. Medido el 2026-10-12 contra los DOS
 * árboles versionados con `git ls-files -c -i -X`: 0 ficheros versionados coinciden con alguna entrada. El
 * paso de provisión lo vuelve a medir en cada corrida y se niega a escribir si un clon versiona una
 * coincidencia. `company-config` nombra herramientas, no rutas, así que esta lista no la duplica.
 */

export const AI_PATHS = Object.freeze([
  Object.freeze({ pattern: '.claude/', tool: 'Claude Code: settings, rules, worktrees, runtime state' }),
  Object.freeze({ pattern: '.agents/', tool: 'agent instruction twin directory (AGENTS.md parity twin)' }),
  Object.freeze({ pattern: '.atl/', tool: 'gentle-ai skill registry and workspace' }),
  Object.freeze({ pattern: '.engram/', tool: 'engram memory chunks exported into the project directory' }),
  Object.freeze({ pattern: '/openspec/', tool: 'spec-driven planning artifacts (proposals, specs, tasks)' }),
  Object.freeze({ pattern: '/odd/', tool: 'ODD feature documents (odd/tasks/<feature>.md)' }),
  Object.freeze({ pattern: '.cursor/', tool: 'Cursor' }),
  Object.freeze({ pattern: '.cursorrules', tool: 'Cursor' }),
  Object.freeze({ pattern: '.cursorignore', tool: 'Cursor' }),
  Object.freeze({ pattern: '.gemini/', tool: 'Gemini CLI' }),
  Object.freeze({ pattern: '.geminiignore', tool: 'Gemini CLI' }),
  Object.freeze({ pattern: 'GEMINI.md', tool: 'Gemini CLI instructions' }),
  Object.freeze({ pattern: 'AGENTS.md', tool: 'agent instructions file' }),
  Object.freeze({ pattern: 'AGENT-LEDGER*', tool: 'agent contract ledger' }),
  Object.freeze({ pattern: '.codex/', tool: 'Codex' }),
  Object.freeze({ pattern: '.opencode/', tool: 'OpenCode' }),
  Object.freeze({ pattern: '.kimi/', tool: 'Kimi' }),
  Object.freeze({ pattern: '.windsurf/', tool: 'Windsurf' }),
  Object.freeze({ pattern: '.aider*', tool: 'Aider' }),
  Object.freeze({ pattern: '.mimocode/', tool: 'MiMo agent tooling' }),
  Object.freeze({ pattern: '.mimocode-project-id', tool: 'MiMo agent tooling' }),
  Object.freeze({ pattern: '.playwright-mcp/', tool: 'Playwright MCP snapshot and session scratch' })
]);
