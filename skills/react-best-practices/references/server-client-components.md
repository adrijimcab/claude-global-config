# Server vs Client Components

Source: react.dev/reference/rsc/server-components (verified 2026-09-29).
Confirms and keeps `adrii-docs/skills/react-19/SKILL.md`'s "Server
Components First" section — it was already accurate; added the exact
constraint quotes and the async-render detail below.

## What a Server Component is

"Renders ahead of time, before bundling, in an environment separate from
your client app or SSR server." Runs at build time (CI) or per-request on
a server, with direct access to backend resources — no API layer needed.

**There is no directive for Server Components.** A Server Component is
just a component with no `"use client"` at the top of its file. (The
common mix-up: `"use server"` marks **Server Functions**, not Server
Components — see `forms-and-actions.md`.)

## Constraints (quoted)

- **No interactive APIs**: "Server Components are not sent to the
  browser, so they cannot use interactive APIs like `useState`." No
  `useEffect`, no event handlers, no browser globals.
- **Cannot create Context**, though they can render a Context Provider
  that a Client Component defines.
- **Async Components**: "a new feature of Server Components that allow
  you to `await` in render" — direct DB/file/service access during
  render, no `useEffect` fetch dance.

## Server vs Client at a glance

| Aspect | Server Component | Client Component |
|---|---|---|
| Rendering | Build time or per-request, server | Browser |
| Data access | Direct (DB, filesystem, secrets) | Via API/Server Function only |
| Bundle | Code never ships to the client | Ships in the client bundle |
| Interactivity | None | Full (hooks, state, events) |

## When to add `"use client"`

Add it to the smallest file that actually needs:
`useState`/`useEffect`/`useContext`/refs, event handlers
(`onClick`/`onChange`/…), or a browser-only API
(`window`/`localStorage`/`IntersectionObserver`).

```tsx
// Server Component (default, no directive) — can be async
async function Notes() {
  const notes = await db.notes.getAll();
  return <Expandable><NoteContent notes={notes} /></Expandable>;
}

// Client Component — only the interactive leaf needs the directive
"use client";
export default function Expandable({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <button onClick={() => setExpanded(!expanded)}>{expanded && children}</button>;
}
```

**Push `"use client"` as far down the tree as possible.** Marking a
high-level layout as a Client Component drags every Server Component it
renders as a *child prop* back to needing serialization, and forfeits
their server-only data access for that subtree. Pass Server Components
*into* a Client Component via `children`/props rather than importing a
Server Component from inside a Client Component file (the latter is not
possible — a Client Component cannot import a `.tsx` Server Component
directly, only receive one as a prop).

## Imports (React 19, kept from adrii-docs/skills/react-19)

Always named imports; the default/namespace `React` import is not needed
for JSX with the automatic runtime:

```ts
import { useState, useEffect, useRef } from 'react';
```
