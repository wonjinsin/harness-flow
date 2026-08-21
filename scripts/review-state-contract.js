'use strict';

const fs = require('node:fs');

const FINDING_SEVERITIES = new Set(['Critical', 'Important', 'Minor']);
const ACTIVE_STATUSES = new Set(['Resolved', 'Unresolved', 'Not-verifiable']);

function verdict(state, reason) {
  return { state, reason };
}

function classifyReviewResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return verdict('MALFORMED', 'review result must be an object');
  }

  if (input.snapshot === 'mutated') {
    return verdict('CONTRACT', 'reviewer mutated repository state');
  }
  if (input.snapshot !== 'unchanged') {
    return verdict('MALFORMED', 'snapshot state is missing or invalid');
  }

  if (input.transport === 'timeout' || input.transport === 'empty') {
    return verdict('OPERATIONAL', `review transport returned ${input.transport}`);
  }
  if (input.transport !== 'ok') {
    return verdict('MALFORMED', 'transport state is missing or invalid');
  }

  if (input.schemaComplete !== true) {
    return verdict('MALFORMED', 'required report fields are missing');
  }
  if (!['full-review', 'verify-fix'].includes(input.mode)) {
    return verdict('MALFORMED', 'review mode is missing or invalid');
  }
  if (!['Complete', 'Incomplete'].includes(input.execution)) {
    return verdict('MALFORMED', 'review execution field is missing or invalid');
  }
  for (const field of ['rangeMatches', 'filesComplete', 'evidenceCurrent']) {
    if (typeof input[field] !== 'boolean') {
      return verdict('MALFORMED', `${field} must be boolean`);
    }
  }
  if (!Array.isArray(input.findings) || input.findings.some((item) => !FINDING_SEVERITIES.has(item))) {
    return verdict('MALFORMED', 'finding severity is missing or invalid');
  }

  if (
    input.execution !== 'Complete'
    || !input.rangeMatches
    || !input.filesComplete
    || !input.evidenceCurrent
  ) {
    return verdict('CONTRACT', 'execution, range, file coverage, or evidence contract failed');
  }

  const hasBlockingFinding = input.findings.some(
    (severity) => severity === 'Critical' || severity === 'Important',
  );

  if (input.mode === 'full-review') {
    if (!['Yes', 'No'].includes(input.readyToMerge)) {
      return verdict('MALFORMED', 'Ready to merge must be Yes or No');
    }
    if (hasBlockingFinding && input.readyToMerge === 'No') {
      return verdict('ACTIONABLE', 'complete review has blocking findings');
    }
    if (!hasBlockingFinding && input.readyToMerge === 'Yes') {
      return verdict('PASS', 'complete review has no blocking findings and approves merge');
    }
    return verdict('CONTRACT', 'full-review findings contradict Ready to merge');
  }

  if (!Array.isArray(input.expectedActiveIds) || input.expectedActiveIds.some(
    (id) => typeof id !== 'string' || id.trim().length === 0,
  )) {
    return verdict('MALFORMED', 'expected active finding IDs are missing or invalid');
  }
  if (!Array.isArray(input.reportedActiveFindings) || input.reportedActiveFindings.some(
    (item) => !item
      || typeof item !== 'object'
      || Array.isArray(item)
      || typeof item.id !== 'string'
      || item.id.trim().length === 0
      || !ACTIVE_STATUSES.has(item.status),
  )) {
    return verdict('MALFORMED', 'reported active finding ID or status is missing or invalid');
  }
  if (!['Yes', 'No'].includes(input.fixesVerified)) {
    return verdict('MALFORMED', 'Fixes verified must be Yes or No');
  }

  const expectedIds = input.expectedActiveIds;
  const reportedIds = input.reportedActiveFindings.map((item) => item.id);
  const expectedSet = new Set(expectedIds);
  const reportedSet = new Set(reportedIds);
  const exactIds = expectedSet.size === expectedIds.length
    && reportedSet.size === reportedIds.length
    && expectedSet.size === reportedSet.size
    && expectedIds.every((id) => reportedSet.has(id));
  if (!exactIds) {
    return verdict('CONTRACT', 'reported active finding IDs do not exactly match the expected set');
  }

  const hasActiveProblem = hasBlockingFinding
    || input.reportedActiveFindings.some((item) => item.status !== 'Resolved');
  if (hasActiveProblem && input.fixesVerified === 'No') {
    return verdict('ACTIONABLE', 'verification has unresolved, not-verifiable, or new blocking findings');
  }
  if (!hasActiveProblem && input.fixesVerified === 'Yes') {
    return verdict('PASS', 'all active findings are resolved with no new blocking findings');
  }
  return verdict('CONTRACT', 'verify-fix statuses contradict Fixes verified');
}

function evaluateReviewStateFixtures(fixturePath) {
  let fixtures;
  try {
    fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    return { count: 0, errors: [`cannot load review-state fixtures: ${error.message}`] };
  }
  if (!Array.isArray(fixtures)) {
    return { count: 0, errors: ['review-state fixtures must be an array'] };
  }

  const errors = [];
  for (const fixture of fixtures) {
    const actual = classifyReviewResult(fixture.input);
    if (actual.state !== fixture.expected) {
      errors.push(
        `${fixture.name || '<unnamed fixture>'}: expected ${fixture.expected}, got ${actual.state} (${actual.reason})`,
      );
    }
  }
  return { count: fixtures.length, errors };
}

module.exports = { classifyReviewResult, evaluateReviewStateFixtures };
