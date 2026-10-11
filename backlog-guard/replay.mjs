#!/usr/bin/env node
/**
 * REPLAY of the labelled live turns against the current decision: every dismissed refusal of the owner's
 * sessions must now be ALLOWED, every genuine announcement must still be BLOCKED. Prints the counts.
 * @es REPLAY de los turnos vivos etiquetados contra la decisión actual: cada rechazo descartado debe
 * PERMITIRSE ahora y cada anuncio genuino seguir BLOQUEÁNDOSE. Imprime los conteos.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findAnnouncement } from './announcement.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'live-turns-2026-10-11.json');

/** The labelled turns of the live journals. @es Los turnos etiquetados de los journals vivos. */
export const liveTurns = () => JSON.parse(readFileSync(FIXTURES, 'utf8'));

/** `{ allowed, blocked }` counts per label for the current decision. @es Conteos por etiqueta con la decisión actual. */
export function replay() {
  const result = { allow: { total: 0, allowed: 0 }, block: { total: 0, blocked: 0 } };

  for (const turn of liveTurns()) {
    const fires = findAnnouncement(turn.text) !== undefined;

    if (turn.label === 'allow') {
      result.allow.total += 1;
      result.allow.allowed += fires ? 0 : 1;
    } else {
      result.block.total += 1;
      result.block.blocked += fires ? 1 : 0;
    }
  }

  return result;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) console.log(JSON.stringify(replay()));
