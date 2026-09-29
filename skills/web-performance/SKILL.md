---
name: web-performance
description: >
  This skill should be used when the user asks about Core Web Vitals, page speed, "LCP", "INP",
  "CLS", "TBT", "performance budget", "bundle size budget", "slow interaction", "layout shift",
  "why is my page slow" for an Angular or React app or component library. Provides the current
  Core Web Vitals thresholds and root-cause categories for each. For LCP specifically, defer to the
  already-installed `chrome-devtools-mcp:debug-optimize-lcp` skill (it owns the full LCP debugging
  workflow with Chrome DevTools MCP traces) — this skill covers INP and CLS, which that skill does
  not, plus how to set repo-wide performance budgets.
license: MIT
metadata:
  owner: b100-am-ui cross-cutting skills
  scope: web.dev Core Web Vitals (INP/CLS primarily — LCP is owned by debug-optimize-lcp)
  companions: chrome-devtools-mcp:debug-optimize-lcp (LCP), gates-kit/README.md (Lighthouse CI/Playwright budgets)
---

# Web Performance (Core Web Vitals)

**LCP is out of scope here** — `chrome-devtools-mcp:debug-optimize-lcp` already owns a full trace-driven
LCP debugging workflow (subpart breakdown, network waterfall, optimization strategies). Invoke that
skill directly for any LCP question. This skill covers **INP** and **CLS** (which that skill doesn't
cover) plus how to translate all three into a CI-enforceable performance budget.

## The three Core Web Vitals, current thresholds

Source: [web.dev — Core Web Vitals](https://web.dev/articles/vitals). All thresholds are measured
at the **75th percentile** of real-user page loads.

| Metric | Measures | Good | Needs improvement | Poor |
|---|---|---|---|---|
| LCP (Largest Contentful Paint) | Loading | ≤2.5s | 2.5s–4.0s | >4.0s |
| INP (Interaction to Next Paint) | Interactivity | ≤200ms | 200ms–500ms | >500ms |
| CLS (Cumulative Layout Shift) | Visual stability | ≤0.1 | 0.1–0.25 | >0.25 |

**FID → INP**: First Input Delay (FID) was fully retired as a Core Web Vital and replaced by INP —
INP graduated from experimental to a stable Core Web Vital in March 2024. If a project's Lighthouse
config or dashboards still report FID as a gating metric, that's a stale-tooling finding worth
raising on its own — FID only measured the delay before the *first* interaction's handler started;
INP measures the full latency (delay + processing + paint) of *every* interaction, end to end.

## INP — the three phases

Source: [web.dev — INP](https://web.dev/articles/inp).

1. **Input delay**: time before the event handler starts running — often caused by long tasks
   already occupying the main thread when the user clicks/taps.
2. **Processing duration**: time for all the interaction's callbacks to actually execute.
3. **Presentation delay**: time after callbacks finish until the browser paints the next frame.

**Where to look first**: input delay is dominated by *unrelated* main-thread work (a big
re-render, a synchronous data transform) blocking the handler from starting at all — this is often
the actual bottleneck even when the interaction's own handler is fast. Processing duration is
dominated by expensive handler logic itself (unmemoized re-renders cascading through a large
component tree, synchronous layout reads inside the handler). Presentation delay is dominated by
large DOM updates or heavy style/layout recalculation triggered by the interaction's result.

**Component-library-specific culprits**: an `OnPush`/memoized boundary that's missing so one state
change re-renders far more of the tree than necessary; a `(click)`/`onClick` handler that
synchronously does layout-forcing DOM reads (`getBoundingClientRect` in a loop) between writes.

## CLS — thresholds and top causes

Source: [web.dev — CLS](https://web.dev/articles/cls).

Good ≤0.1, needs-improvement 0.1–0.25, poor >0.25. Top causes, in the order web.dev lists them:
1. **Images/videos without explicit dimensions** — the browser can't reserve space before the
   resource loads, so layout shifts when it arrives. Always set `width`/`height` (or `aspect-ratio`
   in CSS) even for responsive images.
2. **Web fonts rendering larger/smaller than the fallback** — causes a reflow when the real font
   swaps in (FOUT). Mitigate with `font-display: swap` plus a fallback font metrically close to the
   real one (or `size-adjust` in a `@font-face` block).
3. **Dynamically injected content** pushed in above existing content (a banner, a cookie notice, an
   ad slot) without a reserved space.
4. **Third-party embeds that resize themselves** after load (widgets, ads).

**Fix pattern that avoids CLS by construction**: animate with `transform: scale()`/`transform:
translate()` instead of animating `width`/`height`/`top`/`left` — a `transform` never triggers
layout, so it structurally cannot cause a layout shift, regardless of how the animation is tuned.

## Performance budgets — the CI-enforceable version of all three metrics

A budget converts "the page should be fast" into a number a gate can compare against on every PR.
Two complementary budget types:

- **Timing budgets** (LCP/INP/CLS thresholds above, enforced via Lighthouse CI assertions or
  Playwright trace assertions against a real or throttled environment) — catches regressions in
  actual user-facing speed.
- **Resource budgets** (total JS/CSS bytes shipped, request count, largest single chunk size) —
  catches the *cause* before it becomes a timing regression; a budget on bundle size fails fast in
  CI without needing a full browser trace, so it's cheaper to run on every PR than a full Lighthouse
  pass.

See `gates-kit/README.md` for the concrete `lighthouserc` budget config and bundle-size gate this
library already ships, and what a fresh consumer project needs to adopt to get the same coverage.

## What this skill does NOT replace

- **LCP debugging** — `chrome-devtools-mcp:debug-optimize-lcp` (trace recording, subpart breakdown,
  network waterfall analysis, emulation under throttling).
- **Tool execution** — Lighthouse CI, Playwright perf assertions, bundle-size gates: see
  `gates-kit/README.md`.
