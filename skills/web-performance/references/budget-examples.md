# Performance Budget — Example Configs

## Lighthouse CI assertion budget (`.lighthouserc.cjs` / `.json`)

```js
module.exports = {
  ci: {
    collect: { numberOfRuns: 3 },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }], // lab proxy for INP
        'resource-summary:script:size': ['error', { maxNumericValue: 300000 }],
        'resource-summary:total:size': ['error', { maxNumericValue: 1000000 }],
      },
    },
  },
};
```

Note: **INP itself cannot be measured in a synthetic/lab Lighthouse run** — it requires a real user
interaction. Lighthouse's lab proxy is Total Blocking Time (TBT); INP needs either a scripted
Playwright interaction trace (`performance_start_trace` + a real click, per
`chrome-devtools-mcp:debug-optimize-lcp`'s trace workflow) or real-user field data (Chrome UX
Report / `web-vitals` JS library reporting to an analytics endpoint).

## Bundle-size budget (framework-agnostic shape)

```json
{
  "budgets": [
    { "path": "main.*.js", "maxSize": "180kb" },
    { "path": "polyfills.*.js", "maxSize": "40kb" },
    { "path": "styles.*.css", "maxSize": "50kb" }
  ]
}
```

Angular CLI has this natively via `budgets` in `angular.json` (`type: "bundle"` /
`"initial"`/`"anyComponentStyle"`). For React/Vite/webpack, `webpack-bundle-analyzer` +
a custom size-limit check (e.g. the `size-limit` package) achieves the same gate.

## Why resource budgets run before timing budgets in CI

A resource-size regression is a **direct cause** of a timing regression but is measurable without
launching a browser — checking `dist/**` file sizes is milliseconds; a full Lighthouse/Playwright
trace run is seconds-to-minutes per page. Fail fast on the cheap check first (see
`gates-kit/README.md`'s cost ranking) so a bundle-bloat PR gets feedback before the expensive suite
even starts.
