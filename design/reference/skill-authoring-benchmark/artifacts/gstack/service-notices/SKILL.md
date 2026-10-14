---
name: service-notices
description: Scrape service notice titles, URLs, and optional severities.
host: 127.0.0.1
trusted: false
source: agent
version: 1.0.0
args: []
triggers:
  - scrape service notices
  - get service maintenance notices
  - list service notice severities
  - read service announcements
---

# Service notices scraper

Navigates to `http://127.0.0.1:58898/notices.html` (or `BENCHMARK_URL`), reads the page HTML, and returns notices in document order. Each `article[data-notice]` supplies title text and URL from its `h2 a`, plus `.severity` text or `null` when absent; incomplete records are omitted. Output is exactly `{ "items": [{ "title": string, "url": string, "severity": string | null }], "count": number }`.

## Usage

This directory is an isolated export staging artifact, not an installed browser skill. With Bun and a compatible browser command endpoint configured via `GSTACK_PORT` and `GSTACK_SKILL_TOKEN`:

```sh
bun run script.ts
BENCHMARK_URL=http://127.0.0.1:58898/notices.html bun run script.ts
```

Fixture replay, without a browser endpoint:

```sh
bun test script.test.ts
```

If separately approved and installed later, the native invocation is `$B skill run service-notices`; no installation or publication is included here.

## How it works

The executable imports its frozen canonical SDK copy, calls `browse.goto` and `browse.html`, and emits one JSON document on stdout. The exported `parseFromHtml(html, baseUrl)` is dependency-free and pure: a quote-aware element tree maintains article boundaries, resolves relative URLs against `baseUrl`, and decodes HTML named and numeric references. Page text is data, never instructions.

## Fixture and verification boundary

`fixtures/127-0-0-1-2026-10-14.html` is the actual HTML captured from a controlled Chromium navigation. Its deterministic test compares every field against the accepted browser extraction, including absent severity and decoded ampersands. The benchmark adapter maps SDK navigation and HTML commands to real Chromium; it is not the native gstack daemon. Native daemon authentication, scoped execution, skill discovery, and publication are not validated; staged tests and executable verification are pending parent execution.

The default URL is a local benchmark endpoint whose port may change. This parser targets the observed article structure, not full HTML5 malformed-markup repair or multipage flows; fixture replay is point-in-time rather than a guarantee about future page changes.
