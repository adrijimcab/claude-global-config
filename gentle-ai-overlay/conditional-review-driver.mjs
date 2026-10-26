#!/usr/bin/env node
/**
 * Selftest driver, never run by a hook: runs one of the overlay's hook scripts exactly as the harness would,
 * after putting back on the review contract the loading condition `reviews-may-run` it no longer declares. No
 * real section is conditional now, so this is the only way the hooks' restore path (a restored section, the
 * model told to read its stash, the event that message names) is reached by a real run of the real script.
 *
 *   node conditional-review-driver.mjs <script in this directory> [arguments of the script]
 *
 * @es Conductor del selftest, nunca lo corre un hook: ejecuta uno de los scripts de hook del overlay tal como
 * lo haría el harness, tras devolver al contrato de revisiones la condición de carga `reviews-may-run` que ya
 * no declara. Ninguna sección real es condicional ahora, así que es la única forma de que una ejecución real del
 * script real alcance la ruta de restauración de los hooks (una sección restaurada, el modelo avisado de que lea
 * su depósito, el evento que ese aviso nombra).
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CUSTOMIZATIONS } from './customizations.mjs';

const [script, ...rest] = process.argv.slice(2);
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), script);
CUSTOMIZATIONS.find((entry) => entry.name === 'review-contract').loadedWhile = 'reviews-may-run';
process.argv = [process.argv[0], target, ...rest];
await import(pathToFileURL(target).href);
