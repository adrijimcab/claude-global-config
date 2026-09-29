---
name: seo-technical
description: >
  This skill should be used when the user asks about technical SEO for an Angular or React
  application — "robots.txt", "sitemap.xml", "structured data", "JSON-LD", "schema markup",
  "canonical tag", "hreflang", "crawlability", "indexability", "Core Web Vitals for SEO", "SSR for
  SEO", "meta description", "title tag", "Rich Results Test". Scope is the crawlable/indexable
  surface of a component-library-driven app: what a search engine sees when it fetches and renders
  the page, not content strategy or link building. Complements `web-performance` (Core Web Vitals
  are a Google ranking signal) — load both when the question is "why isn't this page ranking".
license: MIT
metadata:
  owner: b100-am-ui cross-cutting skills
  scope: Google Search Central technical SEO; derived with attribution from AgriciDaniel's seo-* skill pack (MIT)
  companions: web-performance (Core Web Vitals overlap), gates-kit/README.md
---

# Technical SEO

Scope: the crawlable, indexable, machine-readable surface of a page — robots.txt, sitemaps,
canonical tags, structured data, hreflang, and whether the content a user sees is the same content
a crawler sees (JS-rendering risk). Content quality, keyword strategy, and link building are out of
scope; those need editorial/content judgment this skill doesn't provide.

**Attribution**: several checklists below are derived, with adaptation and re-verification against
current Google Search Central docs, from the `seo-technical`, `seo-sitemap`, `seo-schema`, and
`seo-hreflang` skills in AgriciDaniel's published SEO skill pack (MIT licensed) — reused as
structural inspiration, not copied verbatim, and re-cited to primary Google/W3C sources throughout.

## Core technical requirements

Source: [Google Search Central — SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

- **Crawlable links**: every important page reachable via a plain `<a href>` — a link that only
  works via a JS `onClick` handler (no real `href`) is invisible to crawlers that don't execute JS,
  and a risk factor even for those that do.
- **Unique, descriptive `<title>`** and meta description per page — these are what render in search
  results; a component-library-driven SPA regularly ships a single static `<title>` for every route
  unless the routing layer explicitly sets it per navigation.
- **Heading structure** reflects content hierarchy (one purpose-fitting `h1`, logical nesting) —
  this overlaps directly with WCAG 2.4.6/1.3.1 (see the `web-accessibility` skill); fixing heading
  structure for a11y fixes it for SEO too.
- **Mobile-friendliness and page experience** — Core Web Vitals are an explicit ranking signal; see
  the `web-performance` skill for LCP/INP/CLS thresholds and how to hit them.

## Crawlability — robots.txt and JS rendering

Source: [Google — robots.txt intro](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

- File must be served at the site root (`/robots.txt`), plain text, one directive group per
  `User-agent`. Core directives: `User-agent`, `Disallow`, `Allow`, `Sitemap` (points at the sitemap
  URL — a validator can assert this cross-reference exists).
- **Different crawlers interpret syntax differently** — Google's own docs call this out explicitly;
  don't assume Googlebot-verified behavior holds for every bot when authoring `robots.txt` for a
  broad audience (this matters for `llms.txt`/AI-crawler management too — see below).
- **JS-rendering risk**: if critical content (the content that should be indexed) only appears after
  client-side JS execution, verify with `curl <url>` or "View Source" that it's present in the raw
  HTML, or confirm the app is SSR/prerendered for that route. This is the single highest-impact
  technical SEO defect in Angular/React SPAs that skip SSR.
- **AI crawler management**: increasingly relevant addition — decide deliberately (not by omission)
  whether AI training/answer crawlers (GPTBot, ClaudeBot, Google-Extended, etc.) are allowed or
  blocked per section of the site, and whether an `llms.txt` file is worth publishing to guide
  AI-answer citability. This is a policy decision, not a pure technical gate.

## Sitemaps

Source: [Google — build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Validation checks a tool can assert mechanically:
- Valid XML; ≤50,000 URLs and ≤50MB uncompressed per file (protocol hard limit) — use a sitemap
  index file above that.
- Every listed URL returns HTTP 200 (a sitemap listing a 404/redirect is a quality signal problem).
- `<lastmod>` dates are accurate and vary per page (all-identical timestamps are a known
  red flag — they read as generated-and-never-verified).
- `<priority>` and `<changefreq>` are **ignored by Google** — do not spend effort tuning them; they
  are dead weight in the file, not a lever.
- The sitemap is referenced from `robots.txt` via a `Sitemap:` line.

## Structured data (JSON-LD)

Source: [Google — Intro to structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data),
[Structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

- **JSON-LD is Google's stated preferred format** over Microdata/RDFa — a `<script type="application/ld+json">`
  block, not attributes scattered through markup.
- Every required property for the chosen schema type must be present for rich-result eligibility;
  Google explicitly recommends **fewer, complete, accurate** properties over exhaustively filling
  every optional one.
- **Official validation tools** (use these, don't hand-roll a JSON-LD validator): the
  [Rich Results Test](https://search.google.com/test/rich-results) for pre-deploy validation and
  preview, Search Console's **Rich Result Status reports** for post-deploy monitoring, and the
  **URL Inspection Tool** to confirm Google actually found the markup on a live URL.

## Canonical tags and hreflang

- **Canonical** (`<link rel="canonical" href="...">`): declares the authoritative URL when the same
  content is reachable via multiple URLs (query params, trailing slash, http/https, www/non-www).
  Every page should self-canonicalize at minimum.
- **Hreflang** (multi-language/region sites): every page must include a **self-referencing** hreflang
  tag whose URL exactly matches its own canonical URL — a missing self-reference invalidates the
  *entire* hreflang set for that cluster, not just that one tag. Hreflang relationships must be
  **bidirectional** ("return tags"): if page A declares `hreflang="es"` pointing at page B, page B
  must declare a tag pointing back at A. Supported implementations: HTML `<link>` tags, HTTP
  `Link:` headers, or XML sitemap `<xhtml:link>` entries — pick one, don't mix per-page.

## What this skill does NOT replace

- **Core Web Vitals measurement and optimization** — see the `web-performance` skill; this skill
  only notes that CWV is a ranking signal, it doesn't own the LCP/INP/CLS thresholds.
- **Content/E-E-A-T quality, keyword strategy, backlinks** — genuinely out of scope; these need
  editorial judgment a technical skill can't supply.
- **Tool execution** — see `gates-kit/README.md` for wiring a sitemap/structured-data/robots.txt
  validator into CI.

## Additional resources

- `references/structured-data-sitemaps.md` — expanded JSON-LD schema-type checklist and sitemap
  validation script sketch.
