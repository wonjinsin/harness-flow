'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', '..', 'skills/using-harness-flow/references/codex-agents');
const files = ['sdd-cheap.toml', 'sdd-standard.toml', 'sdd-review.toml'];

for (const f of files) {
  test(`${f} has required custom-agent keys and a tier lever`, () => {
    const t = fs.readFileSync(path.join(DIR, f), 'utf-8');
    assert.match(t, /^name\s*=/m);
    assert.match(t, /^description\s*=/m);
    assert.match(t, /developer_instructions\s*=/m);
    assert.match(t, /model_reasoning_effort\s*=\s*"(low|medium|high)"/m);
  });
}

test('review profile uses high reasoning effort (reviewer floor)', () => {
  const t = fs.readFileSync(path.join(DIR, 'sdd-review.toml'), 'utf-8');
  assert.match(t, /model_reasoning_effort\s*=\s*"high"/);
});
