/**
 * Reading and writing the text files the overlay guards, without changing a byte it did not mean to.
 *
 * Lines are split on '\n' only, so a CRLF file keeps its '\r' at the end of each line; callers that
 * compare line CONTENT use `lineContent`, and callers that rewrite a line put the '\r' back with
 * `withEndingOf`. That is what lets `apply` edit one line of a CRLF file and leave every other byte as
 * it was.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

/** The file's text, or null when it does not exist. Any other I/O failure is thrown, never hidden. */
export function readTextOrNull(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write through a temporary sibling and rename, so a crash never leaves a half-written file. */
export function writeTextAtomic(filePath, text) {
  const temporary = `${filePath}.overlay-tmp-${process.pid}`;
  writeFileSync(temporary, text, 'utf8');
  renameSync(temporary, filePath);
}

export const splitLines = (text) => text.split('\n');

export const joinLines = (lines) => lines.join('\n');

/** A line without its trailing carriage return. */
export const lineContent = (line) => (line.endsWith('\r') ? line.slice(0, -1) : line);

/** `content` carrying the same line ending as `original`. */
export const withEndingOf = (original, content) => (original.endsWith('\r') ? `${content}\r` : content);
