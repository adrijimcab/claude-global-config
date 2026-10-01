/**
 * Which shell commands can change where the review execution contract belongs: a real `gentle-ai
 * sync` (it rewrites the sdd-orchestrator region and puts the full span back) and `gentle-ai review
 * mode enable|disable` (it changes whether reviews may run). The shell parsing is the sync guard's
 * own (sync-invocations.mjs, executed-programs.mjs), so a command reads the same to both mechanisms.
 *
 * @es Qué comandos de shell pueden cambiar dónde debe estar el contrato de ejecución de revisiones: un
 * `gentle-ai sync` real (reescribe la región sdd-orchestrator y devuelve el tramo completo) y
 * `gentle-ai review mode enable|disable` (cambia si las revisiones pueden correr). El análisis del
 * shell es el del propio guard de sync, así que un comando se lee igual para ambos mecanismos.
 */
import { dialectOfTool } from '../gentle-ai-sync-guard/decide.mjs';
import { executedPrograms } from '../gentle-ai-sync-guard/executed-programs.mjs';
import { syncInvocations } from '../gentle-ai-sync-guard/sync-invocations.mjs';

const MODE_CHANGES = new Set(['enable', 'disable']);

/** `gentle-ai review mode enable|disable`, read from the leading non-flag words. @es Leído de las primeras palabras que no son flags. */
function changesReviewMode({ program, args }) {
  const [group, noun, verb] = args.filter((arg) => !arg.startsWith('-'));
  return program === 'gentle-ai' && group === 'review' && noun === 'mode' && MODE_CHANGES.has(verb);
}

/**
 * @param {unknown} command  the shell text the tool ran @es el texto de shell que corrió la herramienta
 * @param {string} toolName  `Bash` or `PowerShell` @es `Bash` o `PowerShell`
 * @returns {'sync' | 'review-mode' | null}
 */
export function lazyReviewTrigger(command, toolName) {
  if (typeof command !== 'string') return null;
  const dialect = dialectOfTool(toolName);
  if (syncInvocations(command, dialect).some((invocation) => !invocation.dryRun)) return 'sync';
  if (executedPrograms(command, dialect).some(changesReviewMode)) return 'review-mode';
  return null;
}
