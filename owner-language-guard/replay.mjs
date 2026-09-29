#!/usr/bin/env node
/**
 * Repetición del guard sobre un transcript REAL completo: cada turno pasa por `decide()` como si el
 * Stop hubiera disparado al final de ese turno. Sirve para medir precisión y para justificar umbrales
 * con datos, no con intuición.
 *
 * Uso: node replay.mjs <transcript.jsonl> <salida.jsonl>
 * Escribe una línea por turno con texto visible: `{ turn, startLine, at, block, findings, preview }`, y una línea
 * por párrafo en `<salida>.paragraphs.jsonl` con sus cuentas `{ english, spanish, isEnglish, excerpt }`.
 * Imprime el resumen por stdout.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { classifyParagraph, decide } from './decide.mjs';
import { proseParagraphs } from './prose.mjs';
import { opensTurn, visibleTextsOf } from './turn.mjs';

/**
 * Parte las líneas en turnos en una sola pasada, con los MISMOS predicados (`opensTurn`,
 * `visibleTextsOf`) que usa el guard en vivo: la repetición mide el corte real, no uno parecido.
 */
function turnsOf(lines) {
  const turns = [];
  let current = { startLine: 0, at: undefined, texts: [] };

  lines.forEach((line, index) => {
    if (line.trim().length === 0) return;

    let entry;

    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }

    if (opensTurn(entry)) {
      if (current.texts.length > 0) turns.push(current);

      current = { startLine: index, at: entry.timestamp, texts: [] };
      return;
    }

    current.texts.push(...visibleTextsOf(entry));
  });

  if (current.texts.length > 0) turns.push(current);

  return turns;
}

function main() {
  const [transcriptPath, outputPath] = process.argv.slice(2);

  if (transcriptPath === undefined || outputPath === undefined) {
    console.error('uso: node replay.mjs <transcript.jsonl> <salida.jsonl>');
    process.exit(2);
  }

  const lines = readFileSync(transcriptPath, 'utf8').split('\n');
  const turns = turnsOf(lines);
  const turnRecords = [];
  const paragraphRecords = [];

  turns.forEach(({ startLine, at, texts }, turn) => {
    const verdict = decide({ texts, stopHookActive: false });

    turnRecords.push({ turn, startLine, at, block: verdict.block, findings: verdict.findings ?? [], preview: texts.join(' ¶ ').slice(0, 240) });

    for (const text of texts) {
      for (const paragraph of proseParagraphs(text)) {
        paragraphRecords.push({ turn, ...classifyParagraph(paragraph.words), excerpt: paragraph.text.slice(0, 200) });
      }
    }
  });

  writeFileSync(outputPath, turnRecords.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
  writeFileSync(`${outputPath}.paragraphs.jsonl`, paragraphRecords.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');

  const blocked = turnRecords.filter((record) => record.block).length;

  console.log(`turnos con texto: ${turnRecords.length}; bloqueados: ${blocked}; párrafos: ${paragraphRecords.length}`);
}

main();
