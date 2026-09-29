#!/usr/bin/env node
/**
 * PreToolUse hook — engram title guard.
 *
 * WHY THIS EXISTS
 * ---------------
 * engram's `mem_save` MCP tool declares `title` as a REQUIRED input, and `engram doctor`'s
 * `sync_mutation_required_fields` check BLOCKS cloud replication when a queued observation payload
 * carries no title. Between those two ends, nothing enforces it:
 *
 *   - The engram server (v1.20.0) does NOT validate the field. Measured directly against the
 *     server over MCP stdio: title omitted, title "", and title "   " were ALL accepted and
 *     persisted, each returning success with the stored title coerced to the empty string.
 *   - The `observations.title` column is `TEXT NOT NULL`, but "" satisfies NOT NULL, so the
 *     database does not object either.
 *   - The outbox (`sync_mutations`) then snapshots `"title": ""`, and doctor — which treats empty
 *     as missing — blocks replication for the whole project.
 *
 * That gap silently produced 66 untitled observations in b100-am-ui before anything objected.
 *
 * SCOPE, STATED HONESTLY
 * ----------------------
 * The root defect is UPSTREAM, in the engram binary. This hook cannot fix it; it closes the door
 * only for the Claude Code runtime. Any other client of the same MCP server (Codex, Cursor,
 * opencode, the HTTP API, `engram mcp` driven by anything else) writes to the same global store at
 * ~/.engram/engram.db and is NOT covered. The durable fix is server-side validation upstream.
 *
 * CONTRACT
 *   - stdin  : JSON with `tool_name` and `tool_input`.
 *   - stdout : {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}}
 *              denies the call; anything else lets it through.
 *   - Every malfunction of the guard itself exits 0 (fail-open). A guard that wedges the fleet is
 *     worse than the defect it prevents.
 *
 * M5: zero regex. String operations only.
 */

const GUARDED_TOOL_SUFFIX = 'mem_save';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const allow = () => process.exit(0);

const isBlank = (value) => {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return true;
  return value.trim().length === 0;
};

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

const main = async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    allow(); // malformed payload must never wedge a session
  }

  const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : '';
  if (!toolName.endsWith(GUARDED_TOOL_SUFFIX)) allow();

  const input = payload.tool_input;
  if (input === null || typeof input !== 'object') allow();

  const title = input.title;
  if (!isBlank(title)) allow();

  const shape = title === undefined ? 'omitted' : JSON.stringify(title);

  deny(
    [
      'engram title guard: this mem_save has no usable `title` (' + shape + ').',
      '',
      'The engram server will ACCEPT this call and silently store an empty title. It will not',
      'error. The cost lands later: the queued sync payload carries "title": "", and',
      '`engram doctor` blocks cloud replication for the entire project until it is repaired by',
      'hand. 66 observations were already lost to this exact path.',
      '',
      'Re-issue the call with a short, SEARCHABLE title derived from the content itself — the',
      'phrase you would actually type into mem_search months from now. For example:',
      '  "EMFILE en Windows: causa raiz encontrada y arreglada"',
      '  "check:consumer-types era vacuo"',
      '',
      'Do NOT satisfy this guard with a placeholder ("observation 417", "memory", "note"). A',
      'placeholder passes the schema and defeats the field\'s only purpose.',
    ].join('\n'),
  );
};

main();
