'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../skills/requesting-code-review/scripts/combine-reviews.js');
const { combineReviews, REQUIRED_CHECKS } = require(SCRIPT);
const { indexPacket } = require('../../skills/requesting-code-review/scripts/read-review-evidence.js');
const ALL_CHECKS = [
  'requirements', 'correctness', 'edge-cases', 'error-handling', 'types', 'prior-blockers',
  'security', 'authorization', 'data-loss', 'concurrency', 'integration', 'compatibility',
  'architecture', 'performance', 'verification', 'tests', 'migration', 'comments',
  'documentation', 'maintainability',
];
const EXPECTED_CHECKS = {
  detail_a: ALL_CHECKS,
  detail_b: ALL_CHECKS,
  integration: ['requirements', 'prior-blockers', 'verification', 'security', 'authorization',
    'data-loss', 'concurrency', 'integration', 'compatibility', 'architecture', 'performance', 'migration'],
  single: ALL_CHECKS,
};
const assignments = { detail_a: [0], detail_b: [1], integration: [0, 1] };
const corePacket = {
  schemaVersion: 1,
  fromSha: 'a'.repeat(40),
  toSha: 'b'.repeat(40),
  manifest: ['src/account.js', 'tests/account.test.js'],
  log: 'Example account change',
  files: [
    { path: 'src/account.js', diff: 'Account implementation diff', resultingContent: 'Account implementation' },
    { path: 'tests/account.test.js', diff: 'Account test diff', resultingContent: 'Account tests' },
  ],
};
const packet = { ...corePacket, digest: createHash('sha256').update(JSON.stringify(corePacket)).digest('hex') };
const finding = {
  severity: 'Important',
  path: 'src/account.js',
  line: 12,
  problem: 'A missing account is dereferenced.',
  consequence: 'The request fails without the required not-found response.',
  correction: 'Return the not-found response before dereferencing the account.',
};

function report(role, overrides = {}) {
  return {
    schemaVersion: 1,
    role,
    fromSha: packet.fromSha,
    toSha: packet.toSha,
    packetDigest: packet.digest,
    reviewedFileIndices: assignments[role] ?? packet.manifest.map((_, index) => index),
    reviewedSections: [],
    checksCompleted: [...EXPECTED_CHECKS[role]],
    priorVerification: [],
    complete: true,
    incompleteReasons: [],
    highRiskSignals: [],
    findings: [],
    strengths: ['The successful account response retains its contract.'],
    ...overrides,
  };
}

function parallel(overrides = {}) {
  return ['detail_a', 'detail_b', 'integration'].map((role) => report(role, overrides[role]));
}

function combine(reports, overrides = {}) {
  return combineReviews({ packet, reports, assignments: reports.some((item) => item?.role === 'single') ? undefined : assignments, riskLevel: 'high', transport: 'inline', ...overrides });
}

function nativePacket() {
  const core = { ...corePacket, files: corePacket.files.map((file, index) => index ? file : { ...file, diff: 'x'.repeat(50000) }) };
  return { ...core, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
}

test('three complete role reports preserve exact coverage without mutating inputs', () => {
  const reports = parallel();
  const before = JSON.stringify({ packet, reports, assignments });
  const result = combine(reports);
  assert.equal(result.complete, true);
  assert.deepEqual(result.reviewedPaths, packet.manifest);
  assert.deepEqual(result.incompleteReasons, []);
  assert.equal(result.roleEvidence.length, 3);
  for (const evidence of result.roleEvidence) {
    assert.deepEqual(evidence.assignedFileIndices, assignments[evidence.role]);
    assert.deepEqual(evidence.reviewedFileIndices, assignments[evidence.role]);
    assert.deepEqual(evidence.reviewedPaths, assignments[evidence.role].map((index) => packet.manifest[index]));
    assert.deepEqual(evidence.reviewedSections, []);
  }
  assert.match(result.markdown, /\*\*Review complete:\*\* yes/);
  assert.match(result.markdown, /\*\*Reviewed files:\*\* 2\/2/);
  assert.match(result.markdown, /\*\*Blocking findings:\*\* none/);
  assert.equal(JSON.stringify({ packet, reports, assignments }), before);
});

test('single fallback must complete the union of all checks', () => {
  const good = combine([report('single')]);
  assert.equal(good.complete, true);
  const bad = combine([report('single', { checksCompleted: EXPECTED_CHECKS.integration })]);
  assert.equal(bad.complete, false);
  assert.match(bad.incompleteReasons.join('\n'), /checksCompleted/);
});

test('details and single each own all twenty unique checks while integration owns twelve', () => {
  assert.deepEqual(REQUIRED_CHECKS, EXPECTED_CHECKS);
  for (const role of ['detail_a', 'detail_b', 'single']) {
    assert.equal(new Set(REQUIRED_CHECKS[role]).size, 20);
    for (const checksCompleted of [ALL_CHECKS.slice(1), [...ALL_CHECKS, ALL_CHECKS[0]], [...ALL_CHECKS, 'unknown']]) {
      const reports = role === 'single' ? [report(role, { checksCompleted })] : parallel({ [role]: { checksCompleted } });
      assert.equal(combine(reports).complete, false);
    }
  }
  assert.equal(new Set(REQUIRED_CHECKS.integration).size, 12);
});

test('parallel controller assignments reject missing, malformed, overlapping, and incomplete partitions', () => {
  const malformed = [
    undefined, null, [], 'assignments', {},
    { detail_a: [0], detail_b: [1] },
    { ...assignments, other: [0] },
    { detail_a: [0], detail_b: [0], integration: [0, 1] },
    { detail_a: [], detail_b: [0, 1], integration: [0, 1] },
    { detail_a: [0], detail_b: [1], integration: [0] },
    ...[[0, 0], [2], [-1], [0.5], ['0'], [null], [true], null, {}]
      .flatMap((indices) => ['detail_a', 'detail_b', 'integration'].map((role) => ({ ...assignments, [role]: indices }))),
  ];
  for (const value of malformed) {
    const result = combine(parallel(), { assignments: value });
    assert.equal(result.complete, false, JSON.stringify(value));
    assert.match(result.incompleteReasons.join('\n'), /assignment/i);
  }
});

test('single fallback allows only an omitted or exact full-manifest controller assignment', () => {
  assert.equal(combine([report('single')], { assignments: { single: [1, 0] } }).complete, true);
  for (const value of [null, {}, assignments, { single: [0] }, { single: [0, 0] }, { single: [0, 2] }, { single: [0, 1], detail_a: [0] }]) {
    const result = combine([report('single')], { assignments: value });
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /assignment/i);
  }
  assert.equal(combine([report('single', { reviewedFileIndices: [0] })]).complete, false);
});

test('detail attestations cannot claim another shard, use local indices, or omit assigned files', () => {
  for (const [role, indices] of [['detail_a', [1]], ['detail_b', [0]], ['detail_a', [0, 1]], ['detail_b', []], ['detail_a', [0, 0]]]) {
    const reports = parallel({ [role]: { reviewedFileIndices: indices, findings: [finding] } });
    const result = combine(reports);
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /reviewedFileIndices.*assignment/);
    assert.deepEqual(result.findings, [finding]);
    assert.deepEqual(result.invalidReports, [{ index: role === 'detail_a' ? 0 : 1, report: reports[role === 'detail_a' ? 0 : 1] }]);
  }
});

test('noncontiguous global assignments cover the manifest through detail union intersect integration', () => {
  const files = ['a.js', 'b.js', 'c.js', 'd.js'].map((filePath) => ({ path: filePath, diff: `Diff for ${filePath}`, resultingContent: filePath }));
  const core = { ...corePacket, manifest: files.map((file) => file.path), files };
  const source = { ...core, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
  const assigned = { detail_a: [2, 0], detail_b: [3, 1], integration: [0, 1, 2, 3] };
  const reports = Object.keys(assigned).map((role) => report(role, { packetDigest: source.digest, reviewedFileIndices: assigned[role] }));
  const options = { packet: source, assignments: assigned };
  const complete = combine(reports, options);
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.reviewedPaths, source.manifest);
  const missingDetail = combine(reports.map((item) => item.role === 'detail_a' ? { ...item, reviewedFileIndices: [0] } : item), options);
  assert.equal(missingDetail.complete, false);
  assert.deepEqual(missingDetail.reviewedPaths, ['a.js', 'b.js', 'd.js']);
  const missingIntegration = combine(reports.map((item) => item.role === 'integration' ? { ...item, reviewedFileIndices: [0, 2, 3] } : item), options);
  assert.equal(missingIntegration.complete, false);
  assert.deepEqual(missingIntegration.reviewedPaths, ['a.js', 'c.js', 'd.js']);
  const gap = combine(reports, { ...options, assignments: { ...assigned, detail_a: [0] } });
  assert.equal(gap.complete, false);
  assert.match(gap.incompleteReasons.join('\n'), /assignments.*complete manifest/);
});

test('missing, duplicate, and mixed role sets are incomplete', () => {
  for (const reports of [[], parallel().slice(0, 2), [...parallel(), report('detail_b')], [report('single'), ...parallel()]]) {
    const result = combine(reports);
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /role/);
  }
});

test('explicit file indices reject omissions, duplicates, foreign values, and invalid types', () => {
  for (const reviewedFileIndices of [
    [0, 2], [0, 0], [0], [0, 1, 2], [-1, 1], ['0', 1], [0.5, 1],
    [null, 1], [true, 1], [], null, 2,
  ]) {
    const reports = parallel({ integration: { reviewedFileIndices } });
    const result = combine(reports);
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /reviewedFileIndices/);
    assert.deepEqual(result.invalidReports[0], { index: 2, report: reports[2] });
  }
  const reordered = combine(parallel({ integration: { reviewedFileIndices: [1, 0] } }));
  assert.equal(reordered.complete, true);
  assert.deepEqual(reordered.roleEvidence[2].reviewedFileIndices, [1, 0]);
  assert.deepEqual(reordered.roleEvidence[2].reviewedPaths, [...packet.manifest].reverse());
  assert.deepEqual(reordered.reviewedPaths, packet.manifest);
});

test('file attestation cannot be replaced by a count or legacy path array', () => {
  const { reviewedFileIndices, ...withoutIndices } = report('single');
  for (const response of [withoutIndices, { ...withoutIndices, reviewedPaths: [...packet.manifest] }, { ...withoutIndices, reviewedFileCount: 2 }]) {
    const result = combine([response]);
    assert.equal(result.complete, false);
    assert.deepEqual(result.reviewedPaths, []);
    assert.match(result.incompleteReasons.join('\n'), /reviewedFileIndices/);
  }
});

test('incomplete file indices map only valid supplied identities and preserve raw evidence', () => {
  const reports = parallel({ integration: { reviewedFileIndices: [1, 2, -1, '0'] } });
  const result = combine(reports);
  assert.equal(result.complete, false);
  assert.deepEqual(result.roleEvidence[2].reviewedFileIndices, [1, 2, -1, '0']);
  assert.deepEqual(result.roleEvidence[2].reviewedPaths, [packet.manifest[1]]);
  assert.deepEqual(result.reviewedPaths, [packet.manifest[1]]);
  assert.deepEqual(result.invalidReports, [{ index: 2, report: reports[2] }]);
  assert.match(result.markdown, /Invalid report evidence/);
});

test('complete native-reader section indices are required from every reviewer', () => {
  const source = nativePacket();
  const expectedSections = indexPacket(source).sections.map((section) => section.index);
  assert.deepEqual(expectedSections, [0, 1, 2]);
  const reports = parallel(Object.fromEntries(['detail_a', 'detail_b', 'integration']
    .map((role) => [role, { reviewedSections: [2, 0, 1], packetDigest: source.digest }])));
  const options = { packet: source, transport: 'native', expectedSections };
  const result = combine(reports, options);
  assert.equal(result.complete, true);
  assert.deepEqual(result.expectedSections, expectedSections);
  assert.deepEqual(result.reviewedSections, expectedSections);
  for (const evidence of result.roleEvidence) assert.deepEqual(evidence.reviewedSections, [2, 0, 1]);
  assert.match(result.markdown, /Reviewed sections/);
  for (let index = 0; index < reports.length; index += 1) {
    for (const reviewedSections of [[0, 1], [0, 1, 1], [0, 1, 3], [0, 1, 2, 3], [-1, 1, 2], ['0', 1, 2], [0.5, 1, 2], [], null]) {
      const invalidReports = reports.map((item, reportIndex) => reportIndex === index ? { ...item, reviewedSections } : item);
      const incomplete = combine(invalidReports, options);
      assert.equal(incomplete.complete, false);
      assert.match(incomplete.incompleteReasons.join('\n'), /reviewedSections/);
      assert.deepEqual(incomplete.invalidReports, [{ index, report: invalidReports[index] }]);
    }
  }
});

test('transport is mandatory and native sections are derived without trusting caller omissions', () => {
  const source = nativePacket();
  const sections = indexPacket(source).sections.map((section) => section.index);
  const response = report('single', { packetDigest: source.digest, reviewedSections: sections });
  assert.equal(combine([response], { packet: source, transport: 'native' }).complete, true);
  for (const transport of [undefined, null, 'automatic']) {
    const result = combine([report('single')], { transport });
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /transport/);
  }
  const uninspected = { ...response, reviewedSections: [] };
  for (const supplied of [{}, { expectedSections: [] }]) {
    const result = combine([uninspected], { packet: source, transport: 'native', ...supplied });
    assert.equal(result.complete, false);
    assert.deepEqual(result.expectedSections, sections);
    assert.match(result.incompleteReasons.join('\n'), /reviewedSections/);
  }
  const mismatched = combine([response], { packet: source, transport: 'native', expectedSections: [99] });
  assert.equal(mismatched.complete, false);
  assert.match(mismatched.incompleteReasons.join('\n'), /expectedSections/);
  assert.equal(combine([report('single')], { expectedSections: [0] }).complete, false);
});

test('native section validation uses the reader output bound and rejects unreadable packet order', () => {
  const source = nativePacket();
  const maxBytes = 16000;
  const sections = indexPacket(source, { maxBytes }).sections.map((section) => section.index);
  const response = report('single', { packetDigest: source.digest, reviewedSections: sections });
  assert.equal(combine([response], { packet: source, transport: 'native', maxBytes }).complete, true);
  assert.equal(combine([response], { packet: source, transport: 'native' }).complete, false);
  assert.equal(combine([response], { packet: source, transport: 'native', maxBytes: 0 }).complete, false);
  const core = { ...corePacket, files: [...corePacket.files].reverse() };
  const reordered = { ...core, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
  const result = combine([report('single', { packetDigest: reordered.digest, reviewedSections: [0] })], { packet: reordered, transport: 'native' });
  assert.equal(result.complete, false);
  assert.match(result.incompleteReasons.join('\n'), /manifest order/);
});

test('inline evidence requires an explicit empty section attestation', () => {
  assert.equal(combine([report('single')]).complete, true);
  assert.equal(combine([report('single', { reviewedSections: [0] })]).complete, false);
  const { reviewedSections, ...withoutSections } = report('single');
  assert.equal(combine([withoutSections]).complete, false);
});

test('invalid expected section identities fail closed', () => {
  for (const expectedSections of [[0, 0], [-1], ['0'], [0.5], [null], {}, null]) {
    const result = combine([report('single')], { expectedSections });
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /expectedSections/);
  }
});

test('wrong range and packet digest are rejected even with all file indices', () => {
  for (const mismatch of [{ fromSha: 'd'.repeat(40) }, { toSha: 'd'.repeat(40) }, { packetDigest: 'd'.repeat(64) }]) {
    const result = combine(parallel({ detail_a: mismatch }));
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /fromSha|toSha|packetDigest/);
  }
});

test('index identities remain bound to manifest order by the packet digest', () => {
  const reorderedCore = { ...corePacket, manifest: [...corePacket.manifest].reverse(), files: [...corePacket.files].reverse() };
  const reorderedPacket = { ...reorderedCore, digest: createHash('sha256').update(JSON.stringify(reorderedCore)).digest('hex') };
  const stale = combine([report('single')], { packet: reorderedPacket });
  assert.equal(stale.complete, false);
  assert.match(stale.incompleteReasons.join('\n'), /packetDigest/);
  const current = combine([report('single', { packetDigest: reorderedPacket.digest })], { packet: reorderedPacket });
  assert.equal(current.complete, true);
  assert.deepEqual(current.reviewedPaths, reorderedPacket.manifest);
  assert.deepEqual(current.roleEvidence[0].reviewedPaths, reorderedPacket.manifest);
});

test('both transports reject rehashed packets whose file evidence disagrees with manifest order', () => {
  for (const core of [
    { ...corePacket, files: [...corePacket.files].reverse() },
    { ...corePacket, manifest: [...corePacket.manifest].reverse() },
  ]) {
    const source = { ...core, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
    for (const transport of ['inline', 'native']) {
      const result = combine([report('single', { packetDigest: source.digest, reviewedSections: transport === 'native' ? [0] : [] })], { packet: source, transport });
      assert.equal(result.complete, false, transport);
      assert.match(result.incompleteReasons.join('\n'), /manifest order/);
    }
  }
});

test('both transports reject isolated surrogates anywhere in rehashed packet source text', () => {
  for (const malformed of ['\ud800', '\udc00']) {
    const cases = [
      { ...corePacket, log: malformed },
      { ...corePacket, manifest: [malformed, corePacket.manifest[1]], files: [{ ...corePacket.files[0], path: malformed }, corePacket.files[1]] },
      ...['path', 'diff', 'resultingContent'].map((field) => ({ ...corePacket, files: [{ ...corePacket.files[0], [field]: malformed }, corePacket.files[1]] })),
    ];
    for (const core of cases) {
      const source = { ...core, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
      for (const transport of ['inline', 'native']) {
        const result = combine([report('single', { packetDigest: source.digest, reviewedSections: transport === 'native' ? [0] : [] })], { packet: source, transport });
        assert.equal(result.complete, false, JSON.stringify({ transport, core }));
        assert.match(result.incompleteReasons.join('\n'), /Unicode/i);
        assert.equal(Buffer.from(result.markdown, 'utf8').toString('utf8'), result.markdown);
        assert.doesNotMatch(result.markdown, /\uFFFD/);
      }
    }
  }
});

test('check ownership is exact, including duplicate and foreign checks', () => {
  for (const checksCompleted of [
    EXPECTED_CHECKS.integration.slice(1),
    [...EXPECTED_CHECKS.integration, EXPECTED_CHECKS.integration[0]],
    [...EXPECTED_CHECKS.integration, 'correctness'],
  ]) {
    const result = combine(parallel({ integration: { checksCompleted } }));
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /checksCompleted/);
  }
});

test('prior blockers require exact text and nonempty evidence from the owner', () => {
  const priorFindings = ['The account response omits its identifier.'];
  const valid = { finding: priorFindings[0], evidence: 'src/account.js:8 returns account.id in the response.' };
  assert.equal(combine(parallel({ integration: { priorVerification: [valid] } }), { priorFindings }).complete, true);
  for (const priorVerification of [[], [{ ...valid, finding: 'A paraphrase.' }], [{ ...valid, evidence: ' ' }], [valid, valid]]) {
    const result = combine(parallel({ integration: { priorVerification } }), { priorFindings });
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /priorVerification/);
  }
  assert.equal(combine(parallel({ detail_b: { priorVerification: [valid] } }), { priorFindings }).complete, false);
});

test('detail prior verification may only contain a unique exact-text subset while integration owns all priors', () => {
  const priorFindings = ['First blocker', 'Second blocker'];
  const priorVerification = priorFindings.map((text) => ({ finding: text, evidence: `Evidence for ${text}` }));
  const valid = parallel({ detail_a: { priorVerification: [priorVerification[0]] }, integration: { priorVerification } });
  const complete = combine(valid, { priorFindings });
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.priorVerification, priorVerification);
  for (const invalid of [[priorVerification[0], priorVerification[0]], [{ finding: 'Foreign blocker', evidence: 'Evidence' }], [{ ...priorVerification[0], evidence: ' ' }]]) {
    const result = combine(parallel({ detail_a: { priorVerification: invalid }, integration: { priorVerification } }), { priorFindings });
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /priorVerification/);
  }
});

test('single fallback also verifies every prior blocker', () => {
  const priorFindings = ['One blocker', 'Another blocker'];
  const priorVerification = priorFindings.map((text) => ({ finding: text, evidence: `Evidence for ${text}` }));
  const result = combine([report('single', { priorVerification })], { priorFindings });
  assert.equal(result.complete, true);
  assert.deepEqual(result.priorVerification, priorVerification);
  assert.match(result.markdown, /Evidence for Another blocker/);
});

test('incomplete and malformed reports preserve usable findings and escalation signals', () => {
  const result = combine(parallel({ detail_b: {
    complete: false,
    incompleteReasons: ['The authorization dependency could not be inspected.'],
    highRiskSignals: ['Authorization changes require high-risk review.'],
    findings: [finding],
    packetDigest: 'wrong',
  } }));
  assert.equal(result.complete, false);
  assert.deepEqual(result.findings, [finding]);
  assert.deepEqual(result.highRiskSignals, ['Authorization changes require high-risk review.']);
  assert.match(result.markdown, /could not be inspected/);
  assert.match(result.markdown, /A missing account is dereferenced/);
});

test('new high-risk signals invalidate standard review but not a complete high-risk review', () => {
  const reports = parallel({ detail_b: { highRiskSignals: ['The change affects authorization.'] } });
  assert.equal(combine(reports, { riskLevel: 'standard' }).complete, false);
  assert.equal(combine(reports).complete, true);
  assert.match(combine(reports, { riskLevel: 'standard' }).markdown, /escalat/i);
});

test('identical defects merge at highest severity while distinct corrections remain', () => {
  const alternative = { ...finding, correction: 'Have the repository return an explicit missing-account result.' };
  const result = combine(parallel({
    detail_a: { findings: [finding] },
    detail_b: { findings: [{ ...finding, severity: 'Critical' }] },
    integration: { findings: [{ ...finding, severity: 'Minor' }, alternative] },
  }));
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, [{ ...finding, severity: 'Critical' }, alternative]);
  assert.match(result.markdown, /\*\*Blocking findings:\*\* Critical/);
  assert.match(result.markdown, /Have the repository return/);
  assert.equal(result.roleEvidence[2].findings.length, 2);
});

test('distinct evidence and contradictory corrections are preserved for caller assessment', () => {
  const other = { ...finding, consequence: 'A separate consumer receives a generic 500.', correction: 'Throw the missing-account exception.' };
  const result = combine(parallel({ detail_a: { findings: [finding] }, detail_b: { findings: [other] } }));
  assert.equal(result.findings.length, 2);
  assert.match(result.markdown, /contradictory conclusions/i);
  assert.match(result.markdown, /mark.*incomplete/i);
});

test('all findings are retained without a cap and no blocker means only Minor findings', () => {
  const findings = Array.from({ length: 30 }, (_, index) => ({ ...finding, severity: 'Minor', line: index + 1, problem: `Problem ${index}` }));
  const result = combine([report('single', { findings })]);
  assert.equal(result.findings.length, 30);
  assert.match(result.markdown, /Problem 29/);
  assert.match(result.markdown, /\*\*Blocking findings:\*\* none/);
});

test('schema defects cannot produce a complete review or silently discard malformed findings', () => {
  for (const overrides of [
    { schemaVersion: 2 }, { complete: 'yes' }, { incompleteReasons: ['Unresolved evidence.'] },
    { strengths: [7] }, { findings: [{ ...finding, line: 0 }] },
    { findings: [{ ...finding, severity: 'urgent' }] }, { unknown: 'not in the schema' },
  ]) {
    const result = combine([report('single', overrides)]);
    assert.equal(result.complete, false);
    if (overrides.findings) assert.match(result.markdown, /Invalid report evidence/);
  }
});

test('invalid packet and caller metadata fail closed', () => {
  for (const overrides of [
    { packet: { ...packet, manifest: ['same', 'same'] } },
    { packet: { ...packet, manifest: [] } },
    { packet: { ...packet, digest: '' } },
    { riskLevel: 'low' },
    { priorFindings: ['same', 'same'] },
  ]) {
    assert.equal(combine(parallel(), overrides).complete, false);
  }
});

test('packet integrity covers the actual file evidence, not only a matching digest label', () => {
  const altered = { ...packet, files: packet.files.map((file, index) => index ? file : { ...file, resultingContent: 'Tampered content' }) };
  const result = combine(parallel(), { packet: altered });
  assert.equal(result.complete, false);
  assert.match(result.incompleteReasons.join('\n'), /digest.*content/i);
  const missingFile = { ...corePacket, files: [corePacket.files[0]] };
  const malformed = { ...missingFile, digest: createHash('sha256').update(JSON.stringify(missingFile)).digest('hex') };
  const reports = parallel().map((item) => ({ ...item, packetDigest: malformed.digest }));
  assert.equal(combine(reports, { packet: malformed }).complete, false);
});

test('special-character paths retain exact identity in coverage and report rendering', () => {
  const special = 'odd `name`\n[bracket].js';
  const core = { ...corePacket, manifest: [special], files: [{ path: special, diff: 'Literal path diff', resultingContent: null }] };
  const specialPacket = { ...core, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
  const single = report('single', { reviewedFileIndices: [0], packetDigest: specialPacket.digest });
  const result = combine([single], { packet: specialPacket });
  assert.equal(result.complete, true);
  assert.deepEqual(result.reviewedPaths, [special]);
  assert.match(result.markdown, /odd/);
});

test('absent, null, and non-object responses produce explicit incomplete evidence', () => {
  for (const value of [null, undefined, 'unparsed response', 3]) {
    const reports = parallel();
    reports[1] = value;
    const result = combine(reports);
    assert.equal(result.complete, false);
    assert.match(result.incompleteReasons.join('\n'), /report\[1\]/);
  }
});

test('JSON schema describes every report field and excludes unknown properties', () => {
  const schema = JSON.parse(fs.readFileSync(path.resolve(path.dirname(SCRIPT), '../review-report.schema.json'), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(new Set(schema.required), new Set(Object.keys(report('single'))));
  assert.deepEqual(schema.properties.role.enum, ['detail_a', 'detail_b', 'integration', 'single']);
  for (const field of ['reviewedFileIndices', 'reviewedSections']) {
    assert.equal(schema.properties[field].type, 'array');
    assert.deepEqual(schema.properties[field].items, { type: 'integer', minimum: 0 });
    assert.equal(Object.hasOwn(schema.properties[field], 'uniqueItems'), false);
  }
  assert.equal(Object.hasOwn(schema.properties, 'reviewedPaths'), false);
});

test('CLI combines report files relative to input and rejects unreadable reports without losing findings', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-reviews-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'input.json');
  fs.writeFileSync(path.join(directory, 'single.json'), JSON.stringify(report('single', { findings: [finding] })));
  fs.writeFileSync(input, JSON.stringify({ packet, riskLevel: 'high', transport: 'inline', reports: ['single.json'] }));
  const good = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /\*\*Review complete:\*\* yes/);
  fs.writeFileSync(input, JSON.stringify({ packet, riskLevel: 'high', transport: 'inline', reports: ['single.json', 'missing.json'] }));
  const missing = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /\*\*Review complete:\*\* no/);
  assert.match(missing.stdout, /missing\.json/);
  assert.match(missing.stdout, /A missing account is dereferenced/);
});

test('CLI validates parallel assignment partitions for inline and native evidence', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-reviews-parallel-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'input.json');
  for (const transport of ['inline', 'native']) {
    const source = nativePacket();
    const reviewedSections = transport === 'native' ? indexPacket(source).sections.map((section) => section.index) : [];
    const reports = parallel(Object.fromEntries(Object.keys(assignments)
      .map((role) => [role, { reviewedSections, packetDigest: source.digest }])));
    for (const item of reports) fs.writeFileSync(path.join(directory, `${item.role}.json`), JSON.stringify(item));
    const data = { packet: source, riskLevel: 'high', transport, assignments, reports: reports.map((item) => `${item.role}.json`) };
    fs.writeFileSync(input, JSON.stringify(data));
    const good = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /\*\*Review complete:\*\* yes/);
    assert.match(good.stdout, /\*\*Reviewed files:\*\* 2\/2/);
    assert.match(good.stdout, /Assigned file indices:/);
    fs.writeFileSync(input, JSON.stringify({ ...data, assignments: { ...assignments, detail_b: [0] } }));
    const overlap = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
    assert.equal(overlap.status, 1);
    assert.match(overlap.stdout, /assignments must be disjoint/);
  }
});

test('CLI emits complete parse errors and never presents unreadable input as success', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-reviews-invalid-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'input.json');
  fs.writeFileSync(path.join(directory, 'broken.json'), '{broken');
  fs.writeFileSync(input, JSON.stringify({ packet, riskLevel: 'high', transport: 'inline', reports: ['broken.json'] }));
  const badReport = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
  assert.equal(badReport.status, 1);
  assert.match(badReport.stdout, /broken\.json/);
  assert.match(badReport.stdout, /JSON|property|Unexpected/i);
  const noInput = spawnSync(process.execPath, [SCRIPT, path.join(directory, 'absent.json')], { encoding: 'utf8' });
  assert.equal(noInput.status, 2);
  assert.match(noInput.stderr, /absent\.json/);
});

test('CLI rejects invalid UTF-8 in input and report JSON without replacement or partial success', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-reviews-encoding-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'input.json');
  const reportPath = path.join(directory, 'single.json');
  const response = report('single', { findings: [{ ...finding, problem: 'ENCODING_MARKER' }] });
  const encodeInvalid = (value) => {
    const original = Buffer.from(JSON.stringify(value), 'utf8');
    const offset = original.indexOf('ENCODING_MARKER');
    assert.ok(offset >= 0);
    return Buffer.concat([original.subarray(0, offset), Buffer.from([0xff]), original.subarray(offset + 'ENCODING_MARKER'.length)]);
  };
  fs.writeFileSync(reportPath, encodeInvalid(response));
  fs.writeFileSync(input, JSON.stringify({ packet, riskLevel: 'high', transport: 'inline', reports: ['single.json'] }));
  const badReport = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
  assert.equal(badReport.status, 1);
  assert.match(badReport.stdout, /invalid UTF-8/i);
  assert.match(badReport.stdout, /\*\*Review complete:\*\* no/);
  assert.doesNotMatch(badReport.stdout, /\uFFFD/);
  fs.writeFileSync(input, encodeInvalid({ packet, riskLevel: 'high', transport: 'inline', reports: [response] }));
  const badInput = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
  assert.equal(badInput.status, 2);
  assert.equal(badInput.stdout, '');
  assert.match(badInput.stderr, /invalid UTF-8/i);
  assert.doesNotMatch(badInput.stderr, /\uFFFD/);
});

test('escaped isolated surrogates in any report text make both transports incomplete without output loss', () => {
  for (const malformed of ['\ud800', '\udc00']) {
    const cases = [
      ...['path', 'problem', 'consequence', 'correction'].map((field) => ({ overrides: { findings: [{ ...finding, [field]: malformed }] } })),
      { overrides: { strengths: [malformed] } },
      { overrides: { highRiskSignals: [malformed] } },
      { overrides: { incompleteReasons: [malformed] } },
      { overrides: { priorVerification: [{ finding: 'Earlier blocker', evidence: malformed }] }, priorFindings: ['Earlier blocker'] },
      { overrides: { priorVerification: [{ finding: malformed, evidence: 'The resulting tree addresses it.' }] }, priorFindings: [malformed] },
    ];
    for (const transport of ['native', 'inline']) {
      for (const { overrides, priorFindings = [] } of cases) {
        const response = JSON.parse(JSON.stringify(report('single', {
          reviewedSections: transport === 'native' ? [0] : [],
          ...overrides,
        })));
        const result = combine([response], { transport, priorFindings });
        assert.equal(result.complete, false, JSON.stringify({ transport, overrides }));
        assert.match(result.incompleteReasons.join('\n'), /invalid Unicode/i);
        assert.equal(Buffer.from(result.markdown, 'utf8').toString('utf8'), result.markdown);
        assert.doesNotMatch(result.markdown, /\uFFFD/);
        assert.deepEqual(result.invalidReports, [{ index: 0, report: response }]);
      }
    }
  }
});

test('valid surrogate pairs remain complete and round-trip through both transports', () => {
  const valid = 'Unicode \ud83d\ude00 \ud55c\uae00';
  for (const transport of ['native', 'inline']) {
    const response = JSON.parse(JSON.stringify(report('single', {
      reviewedSections: transport === 'native' ? [0] : [],
      findings: [{ ...finding, problem: valid, consequence: valid, correction: valid }],
      strengths: [valid],
      highRiskSignals: [valid],
      priorVerification: [{ finding: valid, evidence: valid }],
    })));
    const result = combine([response], { transport, priorFindings: [valid] });
    assert.equal(result.complete, true);
    assert.equal(result.findings[0].problem, valid);
    assert.equal(Buffer.from(result.markdown, 'utf8').toString('utf8'), result.markdown);
    assert.ok(result.markdown.includes(valid));
  }
});

test('CLI rejects JSON-escaped isolated surrogates and renders their escapes without replacement', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-reviews-unicode-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'input.json');
  const response = report('single', { findings: [{ ...finding, problem: '\ud800' }], strengths: ['\udc00'] });
  const serialized = JSON.stringify({ packet, riskLevel: 'high', transport: 'inline', reports: [response] });
  assert.equal(Buffer.from(serialized, 'utf8').toString('utf8'), serialized);
  fs.writeFileSync(input, serialized);
  const result = spawnSync(process.execPath, [SCRIPT, input], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\*\*Review complete:\*\* no/);
  assert.match(result.stdout, /invalid Unicode/i);
  assert.match(result.stdout, /ud800/);
  assert.match(result.stdout, /udc00/);
  assert.doesNotMatch(result.stdout, /\uFFFD/);
});
