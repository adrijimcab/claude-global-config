#!/usr/bin/env node
/**
 * Run `gentle-ai sync` through the overlay: the real sync with the arguments given here, then apply, then
 * check; the exit code is non-zero while anything is left drifting. This is the documented way to sync (see
 * sync-wrapper.mjs for what it does and why it is its own gate).
 *
 *   node sync.mjs [any `gentle-ai sync` arguments]
 *
 * Every argument goes to `gentle-ai sync`; there are no wrapper flags. The only fixture seams are the
 * environment variables of `contextFromEnvironment` (GENTLE_AI_OVERLAY_HOME, GENTLE_AI_OVERLAY_CLI_SCRIPT).
 *
 * @es Corre `gentle-ai sync` a través del overlay: el sync real con los argumentos dados aquí, luego apply,
 * luego check; la salida es distinta de cero mientras algo quede desviado. Es la forma documentada de
 * sincronizar (ver sync-wrapper.mjs). Todos los argumentos van a `gentle-ai sync`; el envoltorio no tiene
 * flags propios. Las únicas costuras de fixture son las variables de entorno de `contextFromEnvironment`.
 */
import { contextFromEnvironment } from './context.mjs';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { syncThroughOverlay } from './sync-wrapper.mjs';

process.exitCode = syncThroughOverlay({ args: process.argv.slice(2), customizations: CUSTOMIZATIONS, context: contextFromEnvironment() });
