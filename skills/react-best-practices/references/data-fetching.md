# Data fetching

Sources: react.dev/reference/react/Suspense (verified 2026-09-29),
nextjs.org/docs/app/getting-started/metadata-and-og-images (`React.cache`
memoization example, verified 2026-09-29), and
`adrii-docs/skills/vercel-react-best-practices/SKILL.md`'s "Eliminating
Waterfalls" and "Server-Side Performance" rule sets (Vercel Engineering,
MIT — reused as-is, still current, added the react.dev citation for the
`use()`/Suspense mechanics they assume but don't cite).

## `use()` for reading promises (and conditional context)

```tsx
import { use } from 'react';

function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise); // suspends the nearest <Suspense>
  return comments.map((c) => <div key={c.id}>{c.text}</div>);
}
```

`use()` only suspends for: `lazy()` components, promises passed via
`use()`, and stylesheet loading — **not** for promises created inside
`useEffect` or an event handler. Suspense-enabled frameworks (Next.js,
Relay) hand you an already-suspendable promise; without a framework,
cache the promise instance so the same one is reused across renders
(`use()` on a *new* promise every render loops forever):

```ts
const cache = new Map<string, Promise<unknown>>();
function fetchData(url: string) {
  if (!cache.has(url)) cache.set(url, getData(url));
  return cache.get(url)!;
}
```

## `React.cache` — per-request dedup, not cross-request caching

Use `cache()` (from `'react'`) to memoize a Server Component data-loader
so the same call across multiple components/`generateMetadata` executes
once per request, not once per caller:

```ts
import { cache } from 'react';
export const getPost = cache(async (slug: string) => db.query.posts.findFirst({ where: eq(posts.slug, slug) }));
```

This is `server-cache-react` from the Vercel rule set — for
cross-request caching reach for an LRU cache or Next.js's `'use cache'`
(see `nextjs-app-router` skill), not `React.cache`, which is scoped to a
single render pass.

## Eliminate fetch waterfalls (Vercel Engineering rules, kept as-is)

- **Start independent fetches in parallel**: `Promise.all([getUsers(),
  getPosts()])`, never `await getUsers(); await getPosts();` when they
  don't depend on each other.
- **Check cheap sync conditions before an `await`** — don't await a flag
  you could check synchronously first.
- **Defer `await`** into the branch where the value is actually used,
  not at the top of the function.
- **In API routes**: start promises early, `await` as late as possible —
  do other synchronous work while the I/O is in flight.
- **Chain nested per-item fetches inside `Promise.all`**, not a
  sequential loop of `await`.
- **Use `<Suspense>` boundaries to stream** instead of blocking the whole
  page/route on the slowest fetch — see `error-boundaries-and-suspense.md`.

## Server-side performance (Vercel Engineering rules, kept as-is)

- **Authenticate Server Functions/Actions exactly like API routes** —
  they are public endpoints (see `forms-and-actions.md`'s "treat
  arguments as untrusted").
- **Hoist static I/O** (fonts, logos, config read from disk) to module
  scope, not inside the component body, so it runs once per server
  instance, not once per request.
- **Avoid module-level *mutable* request state** in RSC/SSR — a module
  singleton that stores per-request data leaks across concurrent
  requests on the same server instance.
- **Minimize what a Server Component serializes to the client** — pass
  only the fields a Client Component actually renders, not whole DB rows.
- **Use `after()`** for work that shouldn't block the response (logging,
  analytics) but must still run.

## Client-side fetching (Vercel Engineering rules, kept as-is)

- Prefer **SWR** (or React Query) for automatic request dedup/caching
  over hand-rolled `useEffect` fetch — see `state-management.md`, point 7.
- Deduplicate global event listeners across components subscribing to
  the same source; use passive listeners for scroll/touch.
