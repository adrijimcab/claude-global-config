#!/usr/bin/env node
/**
 * REPLAY of the labelled live turns against the PREFILTER: every genuine announcement must reach the pending
 * judge (the prefilter's RECALL is the whole point of making it broad), and the share of the dismissed turns
 * that also reach it is the model-call cost the judge then resolves. Prints the counts.
 * @es REPLAY de los turnos vivos etiquetados contra el PREFILTRO: cada anuncio genuino debe llegar al juez de
 * pendientes (el recall del prefiltro es todo el sentido de hacerlo amplio), y la parte de los turnos descartados
 * que también llega es el costo de llamadas que el juez resuelve. Imprime los conteos.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCandidate } from './announcement.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'live-turns-2026-10-11.json');

/** The labelled turns of the live journals. @es Los turnos etiquetados de los journals vivos. */
export const liveTurns = () => JSON.parse(readFileSync(FIXTURES, 'utf8'));

/** `{ total, reachJudge }` per label: how many turns of each label the prefilter sends to the judge. @es Conteos por etiqueta de los turnos que el prefiltro manda al juez. */
export function replay() {
  const result = { allow: { total: 0, reachJudge: 0 }, block: { total: 0, reachJudge: 0 } };

  for (const turn of liveTurns()) {
    const bucket = turn.label === 'allow' ? result.allow : result.block;

    bucket.total += 1;
    bucket.reachJudge += findCandidate(turn.text) === undefined ? 0 : 1;
  }

  return result;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) console.log(JSON.stringify(replay()));
