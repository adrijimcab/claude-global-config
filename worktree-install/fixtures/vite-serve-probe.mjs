/**
 * THE MEASUREMENT behind the own-install default, kept runnable: starts a REAL Vite dev server rooted at the
 * current directory and fetches the module Vitest browser mode loads for coverage
 * (`@vitest/coverage-v8/browser`), exactly as the browser requests it. Exit 0 only when Vite serves it.
 *
 * Measured 2026-10-26, Vite 7.3.7 + Vitest 3.2.4, Linux: from the main checkout -> 200; from a linked worktree
 * whose `node_modules` is a link (or a per-entry farm) into the main checkout's -> the id resolves to
 * `<main>/node_modules/@vitest/coverage-v8/dist/browser.js` and Vite answers 403; from a worktree with its own
 * `npm ci` -> the id resolves inside the worktree and Vite answers 200. Not run by the selftest (it needs a real
 * install); `fake-project.mjs` mirrors the rule it measures.
 *
 * @es LA MEDICIÓN detrás de la instalación propia por defecto: arranca un servidor de Vite REAL en el directorio
 * actual y pide el módulo que el modo navegador de Vitest carga para cobertura, como lo pide el navegador. Sale 0
 * solo si Vite lo sirve. Medido el 2026-10-26: principal 200; worktree con junction 403 (el id resuelve al
 * realpath del principal); worktree con su propio `npm ci` 200. El selftest no lo corre; `fake-project.mjs`
 * reproduce la regla que mide.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const req = createRequire(path.join(root, 'package.json'));
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href);
const server = await createServer({ root, logLevel: 'silent', server: { port: 0, host: '127.0.0.1' }, optimizeDeps: { noDiscovery: true, include: [] } });

await server.listen();

const resolved = await server.pluginContainer.resolveId('@vitest/coverage-v8/browser', path.join(root, 'index.html'));
const id = resolved.id.split('?')[0];
const response = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/@fs${id.startsWith('/') ? '' : '/'}${id}`);

console.log(`resolved ${id}\nstatus ${response.status}`);
await server.close();
process.exit(response.status === 200 ? 0 : 1);
