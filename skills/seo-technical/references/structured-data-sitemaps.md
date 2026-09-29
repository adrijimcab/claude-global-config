# Structured Data & Sitemap — Expanded Reference

Sources: [Google Structured Data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies),
[Sitemaps documentation](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[Rich Results Test](https://search.google.com/test/rich-results). Structural inspiration for the
checklist format attributed to AgriciDaniel's `seo-schema`/`seo-sitemap` skills (MIT).

## JSON-LD detection and common errors

Detection order on a rendered page: (1) `<script type="application/ld+json">` blocks — the
preferred format; (2) Microdata (`itemscope`/`itemprop` attributes); (3) RDFa (`typeof`/`property`
attributes). If a page uses (2) or (3), recommend migrating to JSON-LD — it's decoupled from the
DOM structure, so template refactors don't silently break the markup.

Common validation errors to check for:
- Missing `@context` (must be `"https://schema.org"`) or `@type`.
- A type used that Google doesn't support for rich results (supported types are a moving target —
  always re-check https://developers.google.com/search/docs/appearance/structured-data/search-gallery
  rather than trusting a memorized list).
- Required property present but empty/placeholder value (e.g. `"reviewCount": 0` on a Product with
  no real reviews — Google's guidelines explicitly forbid marking up content not visible on the page).
- Structured data describing content that isn't actually visible to the user on that page (a
  guideline violation, not just a technical error — this is a common source of manual actions).

## Sitemap validation checklist

A validator (script or CI step) should assert, per sitemap file:
1. Valid XML (parses without error) — use a real XML parser, never a text/regex scan (the b100-am-ui
   codebase's own no-regex mandate applies equally well here: `fast-xml-parser`/`xmldom`, not a
   line-by-line grep).
2. URL count ≤ 50,000 and file size ≤ 50MB uncompressed; above either limit, split into a sitemap
   index referencing multiple sub-sitemaps.
3. Every `<loc>` URL is well-formed and, ideally, spot-checked/sampled for a 200 response (a full
   crawl of every URL in a large sitemap is expensive — sample or run async in CI).
4. `<lastmod>` values are present and vary meaningfully across entries (all-identical timestamps
   read as auto-generated-and-unverified, a quality signal Google's own guidance calls out).
5. `<priority>`/`<changefreq>` may be present for other consumers but are explicitly ignored by
   Google — don't gate on them or spend engineering time tuning them.
6. The sitemap's URL is referenced by a `Sitemap:` line in `robots.txt`.
7. For >50k-URL sites: a sitemap index file exists and each sub-sitemap independently satisfies 1-6.

## Canonical + hreflang cross-check

For a self-referencing hreflang audit: for every page P with hreflang tags, confirm (a) P includes a
tag pointing at itself with `hreflang` matching its own locale, (b) that self-referencing URL
exactly equals P's own `<link rel="canonical">` URL (protocol, trailing slash, and query string all
must match), and (c) for every other locale variant P links to, that variant page links back to P —
a one-way hreflang relationship is treated by Google as unreliable and may be ignored entirely for
the whole cluster, not just the broken pair.
