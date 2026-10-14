import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { parseFromHtml as parseReleases } from '../artifacts/gstack/release-feed/script';
import { parseFromHtml as parseNotices } from '../artifacts/gstack/service-notices/script';

const root = resolve(import.meta.dir, '..');
const cases = await Bun.file(resolve(root, 'inputs/browser-heldout-cases.json')).json();
const modules = {
  releases: { parseFromHtml: parseReleases },
  notices: { parseFromHtml: parseNotices },
};
const results = [];
for (const testCase of cases) {
  let actual;
  let error = null;
  try {
    actual = modules[testCase.subject as keyof typeof modules].parseFromHtml(testCase.html, testCase.base_url);
  } catch (caught) {
    error = String(caught);
  }
  results.push({ id: testCase.id, subject: testCase.subject, category: testCase.category,
    expected: testCase.expected, actual, error,
    pass: error === null && isDeepStrictEqual(actual, testCase.expected) });
}
console.log(JSON.stringify({ passed: results.filter(result => result.pass).length,
  total: results.length, results }, null, 2));
