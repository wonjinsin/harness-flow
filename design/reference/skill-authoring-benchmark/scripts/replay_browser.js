import { resolve } from 'node:path';
const canonicalJson = value => JSON.stringify(value, (_, entry) =>
  entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)))
    : entry);

// Invoke from OMP JavaScript Eval: await replayBrowser(browser).
export async function replayBrowser(browser) {
  const root = resolve(import.meta.dir, '..');
  const fixtureServer = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (!/^\/(releases|notices)\.html$/.test(pathname)) return new Response('Not found', { status: 404 });
      return new Response(Bun.file(resolve(root, 'inputs/browser', pathname.slice(1))), {
        headers: { 'Content-Type': 'text/html' },
      });
    },
  });
  const tab = await browser.open({ name: 'skill-benchmark-replay', url: 'about:blank', app: { tern: false }, headed: false });
  try {
    const result = await tab.run(async ({ page }, root, fixturePort) => {
      const trace = [];
      const bridge = Bun.serve({
        hostname: '127.0.0.1', port: 0,
        async fetch(request) {
          const { command, args = [] } = await request.json();
          trace.push({ command, args });
          if (command === 'goto') {
            if (new URL(args[0]).origin !== `http://127.0.0.1:${fixturePort}`) return new Response('Local fixtures only', { status: 403 });
            await page.goto(args[0], { waitUntil: 'domcontentloaded' });
            return new Response(await page.title());
          }
          if (command === 'html') return new Response(await page.content());
          return new Response('Unsupported command', { status: 400 });
        },
      });
      const runs = [];
      try {
        for (const [subject, folder] of [['releases', 'release-feed'], ['notices', 'service-notices']]) {
          const child = Bun.spawn(['bun', `${root}/artifacts/gstack/${folder}/script.ts`], {
            stdout: 'pipe', stderr: 'pipe',
            env: { ...process.env, GSTACK_PORT: String(bridge.port), GSTACK_SKILL_TOKEN: 'local-benchmark-capability',
              BENCHMARK_URL: `http://127.0.0.1:${fixturePort}/${subject}.html` },
          });
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
          ]);
          runs.push({ subject, stdout, stderr, exit_code: exitCode });
        }
      } finally { bridge.stop(true); }
      return { runs, trace };
    }, { args: [root, fixtureServer.port], timeout: 90 });
    const observations = await Bun.file(resolve(root, 'inputs/browser-session.json')).json();
    for (const run of result.runs) {
      const record = observations.records.find(record => record.subject === run.subject);
      const items = record.output.map(item => ({ ...item,
        url: new URL(new URL(item.url).pathname + new URL(item.url).search, `http://127.0.0.1:${fixtureServer.port}`).href }));
      run.expected = { items, count: items.length };
      let actual = null;
      try { actual = JSON.parse(run.stdout); } catch {}
      run.pass = run.exit_code === 0 && canonicalJson(actual) === canonicalJson(run.expected);
    }
    return { ...result, backend: 'real Chromium via direct Puppeteer callbacks; not native gstack daemon' };
  } finally {
    await tab.close();
    fixtureServer.stop(true);
  }
}
