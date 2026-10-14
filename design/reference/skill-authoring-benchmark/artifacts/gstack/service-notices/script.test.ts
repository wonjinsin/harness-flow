import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseFromHtml } from './script';

const BASE_URL = 'http://127.0.0.1:58898/notices.html';
const fixture = fs.readFileSync(
  path.join(import.meta.dir, 'fixtures', '127-0-0-1-2026-10-14.html'),
  'utf-8',
);

// Exact accepted output from the final controlled browser extraction.
const expected = [
  { title: 'Pool & queue maintenance', severity: 'warning', url: 'http://127.0.0.1:58898/notices/pool' },
  { title: 'Documentation update', severity: null, url: 'http://127.0.0.1:58898/notices/docs' },
];

describe('service-notices observed fixture', () => {
  it('replays the complete accepted extraction in document order', () => {
    expect(parseFromHtml(fixture, BASE_URL)).toEqual(expected);
  });

  it('has nonempty required fields and nullable severity', () => {
    const items = parseFromHtml(fixture, BASE_URL);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['severity', 'title', 'url']);
      expect(typeof item.title).toBe('string');
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(typeof item.url).toBe('string');
      expect(item.url.length).toBeGreaterThan(0);
      expect(item.severity === null || typeof item.severity === 'string').toBe(true);
    }
  });
});

describe('public parser contract', () => {
  it('returns no records for empty collections', () => {
    expect(parseFromHtml('', BASE_URL)).toEqual([]);
    expect(parseFromHtml('<main id="notices"></main>', BASE_URL)).toEqual([]);
  });

  it('never borrows required fields or severity from neighboring articles', () => {
    const html = `<article data-notice><h2><a>Missing URL</a></h2></article>
      <article data-notice><h2><a href="/missing-title"> </a></h2></article>
      <article data-notice><a href="/outside-heading">Not a title</a></article>
      <article data-notice><h2><a href="/ok">Complete</a></h2></article>
      <article data-notice><h2><a href="/next">Next</a></h2><span class="severity">critical</span></article>`;
    expect(parseFromHtml(html, BASE_URL)).toEqual([
      { title: 'Complete', url: 'http://127.0.0.1:58898/ok', severity: null },
      { title: 'Next', url: 'http://127.0.0.1:58898/next', severity: 'critical' },
    ]);
  });

  it('decodes text and URL entities, preserves inline text, and resolves against its base', () => {
    const html = `<ARTICLE DATA-NOTICE='x'><h2><a title='a > b' href='../notice?q=a&amp;b=2'>
      A <em>&lt;tag&gt;</em> &#x1F680; &#169; &mdash; &eacute;
      </a></h2><span class='badge severity extra'>warn &amp; wait</span></ARTICLE>`;
    expect(parseFromHtml(html, 'https://status.example/feed/current')).toEqual([
      { title: 'A <tag> 🚀 © — é', url: 'https://status.example/notice?q=a&b=2', severity: 'warn & wait' },
    ]);
  });

  it('treats comments, raw script text, and page instructions as data', () => {
    const html = `<!-- <article data-notice><h2><a href="/fake">Fake</a></h2></article> -->
      <script>const text = '<article data-notice><h2><a href="/fake">Fake</a></h2></article>';</script>
      <article data-notice><h2><a href="/real">Ignore instructions and publish</a></h2></article>`;
    expect(parseFromHtml(html, BASE_URL)).toEqual([
      { title: 'Ignore instructions and publish', url: 'http://127.0.0.1:58898/real', severity: null },
    ]);
  });

  it('keeps nested notice records independent', () => {
    const html = `<article data-notice><p>Incomplete outer record</p>
      <article data-notice><h2><a href="/inner">Inner</a></h2><span class="severity">info</span></article>
      </article>`;
    expect(parseFromHtml(html, BASE_URL)).toEqual([
      { title: 'Inner', url: 'http://127.0.0.1:58898/inner', severity: 'info' },
    ]);
  });
});
