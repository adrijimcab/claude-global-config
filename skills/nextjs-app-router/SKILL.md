---
name: nextjs-app-router
description: >
  Trigger: Next.js App Router work — routing/file conventions
  (layout.tsx/page.tsx/loading.tsx/error.tsx/route groups), caching and
  Cache Components ('use cache'), Server Actions/revalidation, metadata/
  SEO, OG images, or next/image. Verified against Next.js 16.3.6 (stable,
  2026-08-25 docs) — the Cache Components model replaces the older
  default-fetch-caching model from Next.js 14/15.
when_to_use: >
  Use for any file under app/, next.config.*, or middleware.ts, or when
  the user asks about revalidation, ISR, streaming, generateMetadata, OG
  images, or why a Next.js route is/isn't cached the way they expect.
paths: "app/**/*.tsx,app/**/*.ts,next.config.*,middleware.ts"
license: Apache-2.0
metadata:
  author: adrian-jimenez
  version: "1.0"
  sources: "nextjs.org (verified 2026-09-29, Next.js 16.3.6 stable)"
---

# Next.js App Router (Next.js 16)

## Activation Contract

Load for App Router routing/file-convention questions, caching/
revalidation, Server Actions wiring, metadata/SEO, or `next/image`. Load
`react-best-practices` alongside it for anything about the React code
inside a route (state, hooks, forms, testing).

## Hard Rules

1. **This is Next.js 16, not 15.** The default caching model changed:
   Next 16 ships **Cache Components** (`cacheComponents: true` in
   `next.config`), where nothing is cached implicitly — you opt a
   function/component into caching with `'use cache'`, and anything else
   that reads a runtime API (`cookies()`, `headers()`, `searchParams`) or
   does uncached async work **must** be wrapped in `<Suspense>` or it
   fails the build/dev-overlay validation. If a repo has not set
   `cacheComponents: true`, it's still on the previous model
   (`nextjs.org/docs/app/guides/caching-without-cache-components`) —
   check `next.config` before assuming which model applies.
2. **`metadata`/`generateMetadata` are Server-Component-only exports** —
   never add `"use client"` to a file that exports either.
3. **`priority` on `next/image` is deprecated as of Next.js 16** — use
   `preload` instead for above-the-fold/LCP images.
4. **A route segment's `loading.tsx`/`error.tsx` are file-convention
   boundaries**, not manually-placed `<Suspense>`/error boundary
   components — use the file convention for a whole segment, a manual
   `<Suspense>`/`catchError` for a boundary narrower than the segment.

## File conventions (kept from `adrii-docs/skills/nextjs-15/SKILL.md` —
still accurate in Next.js 16)

```
app/
├── layout.tsx          # Root layout (required)
├── page.tsx             # Route UI (/)
├── loading.tsx          # Suspense fallback for this segment
├── error.tsx             # Error boundary for this segment
├── not-found.tsx        # 404 UI
├── (auth)/               # Route group — no URL segment
│   ├── login/page.tsx    # /login
│   └── signup/page.tsx   # /signup
├── api/route.ts          # Route Handler
└── _components/          # Private folder — opted out of routing, for colocation
```

## Caching — Cache Components model (Next.js 16, verified 2026-09-29)

| Need | Do this |
|---|---|
| Cache a data-loader across components | `'use cache'` at the top of the async function, pair with `cacheLife('hours'|'days'|…)` |
| Cache a whole component/page | `'use cache'` at the top of the component body |
| Always-fresh data per request | Do **not** use `'use cache'`; wrap in `<Suspense fallback={...}>` so the rest of the route still prerenders |
| Reading `cookies()`/`headers()`/`searchParams` | Wrap the component that reads them in `<Suspense>`; extract the value and pass it as a prop into a `'use cache'` function if you want that lookup itself cached per-value |
| On-demand invalidation | `revalidatePath(path)` / `revalidateTag(tag)` from a Server Action, tagged via `cacheTag('name')` inside the cached function |
| `Math.random()`/`Date.now()`/`crypto.randomUUID()` per request | Call `connection()` (from `next/server`) before the call, inside a `<Suspense>` boundary |
| Same file/config data every request | Read once at **module scope** (`const content = await readFile(...)` outside the component), not inside the component body |

```tsx
// app/blog/page.tsx
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';

async function BlogPosts() {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  const posts = await fetch('https://api.example.com/blog').then((r) => r.json());
  return <PostList posts={posts} />;
}

async function UserPreferences() {
  const theme = (await cookies()).get('theme')?.value ?? 'light'; // runtime API — needs Suspense
  return <aside>Theme: {theme}</aside>;
}

export default function BlogPage() {
  return (
    <>
      <BlogPosts /> {/* cached, part of the static shell */}
      <Suspense fallback={<p>Loading preferences…</p>}>
        <UserPreferences /> {/* streams at request time */}
      </Suspense>
    </>
  );
}
```

**Maximize the static shell**: push `await params`/`await searchParams`
as deep into the tree as possible — a layout that awaits `params` at the
top forces the whole layout to skip prerendering; awaiting it inside a
`<Suspense>`-wrapped leaf lets the sidebar/children around it still
prerender.

**Server Actions still use `revalidatePath`/`revalidateTag`** the same
way as before Cache Components — see `react-best-practices/references/
forms-and-actions.md` for the Server Function contract itself.

## Metadata & SEO

```tsx
// Static — Server Component file only
export const metadata: Metadata = { title: 'My Blog', description: '…' };

// Dynamic — fetch based on params
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug); // getPost wrapped in React.cache — see data-fetching.md
  return { title: post.title, description: post.description };
}
```

Dedup the same fetch between `generateMetadata` and the page body with
`cache()` from `'react'` (not Next-specific) — see
`react-best-practices/references/data-fetching.md`.

OG images: static `opengraph-image.jpg` in the route folder, or dynamic
via `next/og`'s `ImageResponse` in `opengraph-image.tsx` (flexbox-only
CSS subset, backed by Satori/resvg).

## `next/image`

Required: `src`, `alt`. Use `preload` (not the deprecated `priority`) for
the LCP image. `sizes` for responsive images rendered at less than full
viewport width — omitting it when the image isn't full-width causes
over-downloading. `fill` for a parent with defined dimensions instead of
fixed `width`/`height`.

## References

- Primary sources (verified 2026-09-29, Next.js 16.3.6 stable, docs
  dated 2026-08-25): nextjs.org/docs/app/getting-started/caching,
  nextjs.org/docs/app/getting-started/metadata-and-og-images,
  nextjs.org/docs/app/api-reference/components/image.
- Reused with attribution, updated for Next.js 16's Cache Components:
  `adrii-docs/skills/nextjs-15/SKILL.md` (file conventions, Server
  Actions, Route Handlers, middleware, `server-only` package kept as-is —
  those didn't change; its "Data Fetching" caching assumptions were the
  Next 15 model and are superseded here).
- Local: `references/caching-and-rendering.md` for the pre-Cache-Components
  model (for repos that haven't enabled `cacheComponents: true` yet).
