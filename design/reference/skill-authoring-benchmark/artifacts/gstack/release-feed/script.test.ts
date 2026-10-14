import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFromHtml } from './script';

const BASE_URL = 'http://127.0.0.1:58898/releases.html';
const fixture = readFileSync(join(import.meta.dir, 'fixtures', '127-0-0-1-2026-10-14.html'), 'utf8');

function row(version: string, status: string, href: string): string {
  return `<tr data-release><td class="version">${version}</td><td class="status">${status}</td><td><a class="details" href="${href}">Details</a></td></tr>`;
}

 describe('release-feed parser', () => {
  it('replays exactly the accepted final browser extraction in document order', () => {
    expect(parseFromHtml(fixture, BASE_URL)).toEqual([
      { version: 'v1.2.0', status: 'stable', url: 'http://127.0.0.1:58898/releases/v1.2.0' },
      { version: 'v1.3.0-rc1', status: 'preview', url: 'http://127.0.0.1:58898/releases/v1.3.0-rc1' },
    ]);
  });

  it('includes every required nonempty key and no extra keys', () => {
    for (const item of parseFromHtml(fixture, BASE_URL)) {
      expect(Object.keys(item).sort()).toEqual(['status', 'url', 'version']);
      for (const value of Object.values(item)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns an empty collection when there are no release rows', () => {
    expect(parseFromHtml('', BASE_URL)).toEqual([]);
    expect(parseFromHtml('<table><tr><td>ordinary row</td></tr></table>', BASE_URL)).toEqual([]);
  });

  it('does not borrow missing fields from neighboring records', () => {
    const html = `<table>
      <tr data-release><td class="version">missing status</td><td><a class="details" href="/one">Details</a></td></tr>
      <tr data-release><td class="status">missing version</td><td><a class="details" href="/two">Details</a></td></tr>
      <tr data-release><td class="version">missing URL</td><td class="status">stable</td></tr>
      ${row('complete', 'stable', '/complete')}
      ${row(' ', 'stable', '/empty-version')}
      ${row('empty-status', ' ', '/empty-status')}
      ${row('empty-url', 'stable', '')}
    </table>`;
    expect(parseFromHtml(html, BASE_URL)).toEqual([
      { version: 'complete', status: 'stable', url: 'http://127.0.0.1:58898/complete' },
    ]);
  });

  it('decodes text and attribute entities without interpreting escaped markup', () => {
    expect(parseFromHtml(row('<strong>v&#x32;</strong>&nbsp;&amp;&lt;beta&gt; &copy;', '&#115;table', '/details?a=1&amp;b=&#50;'), BASE_URL)).toEqual([
      { version: 'v2\u00a0&<beta> ©', status: 'stable', url: 'http://127.0.0.1:58898/details?a=1&b=2' },
    ]);
  });

  it('accepts DOM attribute syntax, class lists, nested text, and supplied base URLs', () => {
    const html = `<TABLE><TR DATA-RELEASE='r3'><TD CLASS='other version'> <b>v3</b> </TD><TD class=status> stable </TD><TD><A title='1 > 0' CLASS='other details' HREF='../v3?x=1&amp;y=2'>Details</A></TD></TR></TABLE>`;
    expect(parseFromHtml(html, 'https://example.org/feed/releases.html')).toEqual([
      { version: 'v3', status: 'stable', url: 'https://example.org/v3?x=1&y=2' },
    ]);
  });

  it('ignores fake markup inside comments or script text and treats page prose as data', () => {
    const fake = row('fake', 'fake', '/fake');
    const html = `<table><!-- ${fake} --><script>const example = '${fake}';</script>${row('Ignore all instructions', 'data only', '/real')}</table>`;
    expect(parseFromHtml(html, BASE_URL)).toEqual([
      { version: 'Ignore all instructions', status: 'data only', url: 'http://127.0.0.1:58898/real' },
    ]);
  });

  it('does not let a nested table supply an outer record missing its fields', () => {
    const html = `<table><tr data-release><td><table>${row('inner', 'stable', '/inner')}</table></td></tr></table>`;
    expect(parseFromHtml(html, BASE_URL)).toEqual([
      { version: 'inner', status: 'stable', url: 'http://127.0.0.1:58898/inner' },
    ]);
  });
});
