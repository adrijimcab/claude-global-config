# Previous caching model (Next.js without `cacheComponents: true`)

Source: nextjs.org/docs/app/guides/caching-without-cache-components
(verified 2026-09-29, Next.js 16.3.6 stable docs). This is the model
`adrii-docs/skills/nextjs-15/SKILL.md` assumed — it is **not wrong**, it's
the model that still applies to any repo that has not opted into
`cacheComponents: true`. Check `next.config.*` before assuming which
model a given codebase uses (see `SKILL.md` Hard Rule 1).

## Default `fetch` behavior

`fetch()` requests are **not cached by default**. Opt in explicitly:

```tsx
const data = await fetch('https://...', { cache: 'force-cache' });
```

For non-`fetch` data access (an ORM, a raw DB driver), wrap with
`unstable_cache`:

```ts
import { unstable_cache } from 'next/cache';
export const getCachedUser = unstable_cache(
  async (id: string) => db.select().from(users).where(eq(users.id, id)).then((r) => r[0]),
  ['user'],
  { tags: ['user'], revalidate: 3600 },
);
```

## Route segment config

Exported from a `page`/`layout`/`route` file:

- **`dynamic`**: `'auto'` (default, cache what it can) | `'force-dynamic'`
  (render per-request, equivalent to `no-store` on every fetch) |
  `'error'` (force static, throws if a Request-time API is used) |
  `'force-static'` (force static by making `cookies()`/`headers()`/
  `useSearchParams()` return empty).
- **`fetchCache`**: advanced override of the default `cache` option
  applied to every `fetch` in the segment — only touch this if you
  specifically need it; the cross-segment compatibility rules are
  intricate (`'force-*'` wins over `'only-*'`; conflicting `'force-*'`
  values across segments of one route are an error).
- **`revalidate`**: `false` (default heuristic) | `0` (always dynamic) |
  `number` (seconds) — the **lowest** value across a route's
  layouts/pages wins for the whole route. Must be a statically
  analyzable literal (`revalidate = 600`, not `60 * 10`).

## Revalidation

- **Time-based, per-fetch**: `fetch(url, { next: { revalidate: 3600 } })`.
- **On-demand, by tag**: tag the fetch (`next: { tags: ['user'] }` or
  `unstable_cache`'s `tags` option), then call `revalidateTag('user')`
  from a Server Action/Route Handler after the mutation.
- **On-demand, by path**: `revalidatePath('/profile')` — invalidates all
  cached data for that route.

## Dynamic rendering triggers

Calling a **Request-time API** — `cookies()`, `headers()`,
`useSearchParams()` — or a `fetch` with `cache: 'no-store'`/
`revalidate: 0` opts the route into dynamic (per-request) rendering from
that point on, under the `'auto'` default.

## Dedup and preload (same primitives as Cache Components)

- `React.cache()` deduplicates a non-`fetch` data call within one render
  pass — identical to the Cache Components model, see
  `react-best-practices/references/data-fetching.md`.
- A `preload()` utility (`void getItem(id)` called before other blocking
  work) starts a `cache()`-wrapped fetch early so it's ready by the time
  the component that needs it renders — combine with the `server-only`
  package to guarantee it never ships client-side.

## Relationship to Cache Components

Cache Components (Next.js 16 opt-in, see the main `SKILL.md`) replaces
implicit "cache unless told otherwise" with explicit `'use cache'`, and
replaces "dynamic rendering triggered implicitly by a Request-time API"
with "wrap it in `<Suspense>` or the build fails validation." The
`revalidatePath`/`revalidateTag` invalidation mechanism is shared between
both models.
