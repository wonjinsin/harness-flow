#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const schema = require('../review-report.schema.json');
const { indexPacket } = require('./read-review-evidence.js');

const ALL_CHECKS = [
  'requirements', 'correctness', 'edge-cases', 'error-handling', 'types', 'prior-blockers',
  'security', 'authorization', 'data-loss', 'concurrency', 'integration', 'compatibility',
  'architecture', 'performance', 'verification', 'tests', 'migration', 'comments',
  'documentation', 'maintainability',
];
const DETAIL_ROLES = ['detail_a', 'detail_b'];
const PARALLEL_ROLES = [...DETAIL_ROLES, 'integration'];
const REQUIRED_CHECKS = Object.freeze(Object.fromEntries(
  Object.entries({
    detail_a: ALL_CHECKS,
    detail_b: ALL_CHECKS,
    integration: ['requirements', 'prior-blockers', 'verification', 'security', 'authorization',
      'data-loss', 'concurrency', 'integration', 'compatibility', 'architecture', 'performance', 'migration'],
    single: ALL_CHECKS,
  })
    .map(([role, checks]) => [role, Object.freeze(checks)]),
));
const SEVERITIES = ['Critical', 'Important', 'Minor'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const textItems = (value) => Array.isArray(value)
  ? value.filter((item) => typeof item === 'string' && /\S/.test(item)) : [];
const unique = (values) => [...new Set(values)];
const exactSet = (actual, expected) => Array.isArray(actual)
  && actual.length === expected.length && new Set(actual).size === actual.length
  && actual.every((item) => expected.includes(item));

function validate(value, rule, location) {
  if (rule.$ref) return validate(value, schema.$defs[rule.$ref.split('/').pop()], location);
  const errors = [];
  if ('const' in rule && value !== rule.const) errors.push(`${location} must equal ${JSON.stringify(rule.const)}.`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${location} must be one of ${rule.enum.join(', ')}.`);
  const typeMatches = !rule.type
    || (rule.type === 'object' ? isObject(value)
      : rule.type === 'array' ? Array.isArray(value)
        : rule.type === 'integer' ? Number.isSafeInteger(value) : typeof value === rule.type);
  if (!typeMatches) return [...errors, `${location} must be ${rule.type}.`];
  if (rule.type === 'object') {
    for (const key of rule.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${location}.${key} is required.`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(rule.properties ?? {}, key)) errors.push(...validate(item, rule.properties[key], `${location}.${key}`));
      else if (rule.additionalProperties === false) errors.push(`${location}.${key} is not allowed.`);
    }
  }
  if (rule.type === 'array') {
    value.forEach((item, index) => errors.push(...validate(item, rule.items, `${location}[${index}]`)));
    if (rule.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${location} must not contain duplicates.`);
    }
  }
  if (rule.type === 'string') {
    if (Buffer.from(value, 'utf8').toString('utf8') !== value) errors.push(`${location} contains invalid Unicode scalar values.`);
    if (rule.minLength && value.length < rule.minLength) errors.push(`${location} must not be empty.`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${location} does not match ${rule.pattern}.`);
  }
  if (rule.minimum !== undefined && value < rule.minimum) errors.push(`${location} must be at least ${rule.minimum}.`);
  return errors;
}

function mergeFindings(reports) {
  return reports.flatMap((report) => Array.isArray(report?.findings) ? report.findings : [])
    .filter((finding) => validate(finding, schema.$defs.finding, 'finding').length === 0)
    .reduce((merged, finding) => {
      const key = (item) => JSON.stringify([item.path, item.line, item.problem, item.consequence, item.correction]);
      const existing = merged.findIndex((item) => key(item) === key(finding));
      if (existing === -1) return [...merged, { ...finding }];
      if (SEVERITIES.indexOf(finding.severity) >= SEVERITIES.indexOf(merged[existing].severity)) return merged;
      return merged.map((item, index) => index === existing ? { ...item, severity: finding.severity } : item);
    }, []);
}

function validateAssignments(assignments, expectedFileIndices, single) {
  const assigned = single && assignments === undefined ? { single: expectedFileIndices }
    : isObject(assignments) ? assignments : {};
  const expectedRoles = single ? ['single'] : PARALLEL_ROLES;
  const errors = [];
  if (!exactSet(Object.keys(assigned), expectedRoles)) {
    errors.push(`Controller assignments must contain exactly ${expectedRoles.join(', ')}.`);
  }
  for (const role of expectedRoles) {
    const indices = assigned[role];
    if (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length
      || indices.some((index) => !Number.isSafeInteger(index) || !expectedFileIndices.includes(index))) {
      errors.push(`assignments.${role} must be a nonempty unique set of valid global file indices.`);
    }
  }
  if (!single) {
    const first = Array.isArray(assigned.detail_a) ? assigned.detail_a : [];
    const second = Array.isArray(assigned.detail_b) ? assigned.detail_b : [];
    if (first.some((index) => second.includes(index))) errors.push('The detail assignments must be disjoint.');
    if (!exactSet([...first, ...second], expectedFileIndices)) {
      errors.push('The detail assignments must cover the complete manifest exactly once.');
    }
  }
  const owner = single ? 'single' : 'integration';
  if (!exactSet(assigned[owner], expectedFileIndices)) {
    errors.push(`The ${owner} assignment must cover the complete manifest.`);
  }
  return { assigned, errors };
}

function combineReviews({ packet, reports, assignments, riskLevel, priorFindings = [], transport, maxBytes = 24000, expectedSections } = {}) {
  const manifest = Array.isArray(packet?.manifest) ? packet.manifest : [];
  const expectedFileIndices = manifest.map((_, index) => index);
  const responseList = Array.isArray(reports) ? reports : [];
  const roles = responseList.map((report) => report?.role);
  const single = exactSet(roles, ['single']);
  const { assigned, errors: callerErrors } = validateAssignments(assignments, expectedFileIndices, single);
  let expectedSectionIndices = [];
  if (!['native', 'inline'].includes(transport)) callerErrors.push('transport must explicitly be native or inline.');
  if (transport === 'native') {
    try {
      expectedSectionIndices = indexPacket(packet, { maxBytes }).sections.map((section) => section.index);
    } catch (error) {
      callerErrors.push(`Native source index could not be validated: ${error.message}`);
    }
  }
  if (!isObject(packet)) callerErrors.push('packet must be an object.');
  for (const field of ['fromSha', 'toSha']) {
    callerErrors.push(...validate(packet?.[field], schema.$defs.commit, `packet.${field}`));
  }
  callerErrors.push(...validate(packet?.digest, schema.properties.packetDigest, 'packet.digest'));
  if (!manifest.length || !exactSet(manifest, unique(manifest))
    || manifest.some((item) => typeof item !== 'string' || item.length === 0 || item.includes('\0'))) {
    callerErrors.push('packet.manifest must be a nonempty exact set of path strings.');
  }
  if (packet?.schemaVersion !== 1 || typeof packet?.log !== 'string') {
    callerErrors.push('packet must have schemaVersion 1 and a string commit log.');
  }
  callerErrors.push(...validate(packet?.log, { type: 'string' }, 'packet.log'));
  manifest.forEach((entry, index) => callerErrors.push(...validate(entry, schema.$defs.path, `packet.manifest[${index}]`)));
  if (!Array.isArray(packet?.files)
    || !exactSet(packet.files.map((file) => file?.path), manifest)
    || packet.files.some((file) => !isObject(file) || typeof file.diff !== 'string' || !file.diff
      || (file.resultingContent !== null && typeof file.resultingContent !== 'string'))) {
    callerErrors.push('packet.files must contain the exact manifest with complete diff and resultingContent evidence.');
  }
  if (Array.isArray(packet?.files)) {
    if (packet.files.some((file, index) => file?.path !== manifest[index])) {
      callerErrors.push('packet.files must match manifest order.');
    }
    packet.files.forEach((file, index) => {
      for (const field of ['path', 'diff', 'resultingContent']) {
        if (field === 'resultingContent' && file?.[field] === null) continue;
        callerErrors.push(...validate(file?.[field], { type: 'string' }, `packet.files[${index}].${field}`));
      }
    });
  }
  const core = {
    schemaVersion: packet?.schemaVersion,
    fromSha: packet?.fromSha,
    toSha: packet?.toSha,
    manifest: packet?.manifest,
    log: packet?.log,
    files: packet?.files,
  };
  if (createHash('sha256').update(JSON.stringify(core)).digest('hex') !== packet?.digest) {
    callerErrors.push('packet.digest does not match the packet content.');
  }
  if (!Array.isArray(reports)) callerErrors.push('reports must be an array.');
  if (!['standard', 'high'].includes(riskLevel)) callerErrors.push('riskLevel must be standard or high.');
  if (!Array.isArray(priorFindings) || textItems(priorFindings).length !== priorFindings.length
    || new Set(priorFindings).size !== priorFindings.length) {
    callerErrors.push('priorFindings must be an exact set of nonempty finding texts.');
  }
  if (expectedSections !== undefined) {
    if (!Array.isArray(expectedSections)
      || expectedSections.some((index) => !Number.isSafeInteger(index) || index < 0)
      || new Set(expectedSections).size !== expectedSections.length) {
      callerErrors.push('expectedSections must be an exact set of nonnegative integer section indices.');
    } else if (!exactSet(expectedSections, expectedSectionIndices)) {
      callerErrors.push('expectedSections does not match the complete native source index or the empty inline section set.');
    }
  }
  const expectedPriors = Array.isArray(priorFindings) ? priorFindings : [];
  if (!single && !exactSet(roles, PARALLEL_ROLES)) {
    callerErrors.push('The role set must be exactly detail_a, detail_b, integration or exactly single.');
  }
  const roleEvidence = responseList.map((report, index) => {
    const label = `report[${index}]`;
    const errors = validate(report, schema, label);
    if (typeof report?.loadError === 'string') errors.push(`${label}: ${report.loadError}`);
    for (const [field, expected] of [['fromSha', packet?.fromSha], ['toSha', packet?.toSha], ['packetDigest', packet?.digest]]) {
      if (report?.[field] !== expected) errors.push(`${label}.${field} does not match the packet.`);
    }
    const assignedFileIndices = DETAIL_ROLES.includes(report?.role)
      ? (Array.isArray(assigned[report.role]) ? [...assigned[report.role]] : []) : [...expectedFileIndices];
    if (!exactSet(report?.reviewedFileIndices, assignedFileIndices)) {
      errors.push(`${label}.reviewedFileIndices does not match its complete controller assignment.`);
    }
    if (!exactSet(report?.reviewedSections, expectedSectionIndices)) {
      errors.push(`${label}.reviewedSections does not match the complete expected section set.`);
    }
    if (!Object.hasOwn(REQUIRED_CHECKS, report?.role ?? '')
      || !exactSet(report?.checksCompleted, REQUIRED_CHECKS[report.role])) {
      errors.push(`${label}.checksCompleted does not match the exact owned checks.`);
    }
    const checked = Array.isArray(report?.priorVerification) ? report.priorVerification.map((item) => item?.finding) : [];
    if (report?.role === 'integration' || report?.role === 'single') {
      if (!exactSet(checked, expectedPriors)) errors.push(`${label}.priorVerification must match every prior finding exactly once.`);
    } else if (DETAIL_ROLES.includes(report?.role)
      && (new Set(checked).size !== checked.length || checked.some((finding) => !expectedPriors.includes(finding)))) {
      errors.push(`${label}.priorVerification must be a unique exact-text subset of supplied prior findings.`);
    }
    if (report?.complete !== true) errors.push(`${label} did not declare a complete review.`);
    for (const reason of textItems(report?.incompleteReasons)) errors.push(`${label}: ${reason}`);
    const reviewedFileIndices = Array.isArray(report?.reviewedFileIndices) ? [...report.reviewedFileIndices] : [];
    return {
      index,
      role: report?.role ?? null,
      assignedFileIndices,
      reviewedFileIndices,
      reviewedPaths: unique(reviewedFileIndices
        .filter((fileIndex) => Number.isSafeInteger(fileIndex) && fileIndex >= 0 && fileIndex < manifest.length)
        .map((fileIndex) => manifest[fileIndex])),
      reviewedSections: Array.isArray(report?.reviewedSections) ? [...report.reviewedSections] : [],
      checksCompleted: textItems(report?.checksCompleted),
      priorVerification: Array.isArray(report?.priorVerification) ? report.priorVerification.map((item) => isObject(item) ? { ...item } : item) : [],
      findings: Array.isArray(report?.findings) ? report.findings.map((item) => isObject(item) ? { ...item } : item) : [],
      errors,
    };
  });
  const highRiskSignals = unique(responseList.flatMap((report) => textItems(report?.highRiskSignals)));
  if (riskLevel === 'standard' && highRiskSignals.length) {
    callerErrors.push('New high-risk signals require escalation to high-risk review.');
  }
  const incompleteReasons = [...callerErrors, ...roleEvidence.flatMap((evidence) => evidence.errors)];
  const owner = roleEvidence.find((evidence) => evidence.role === (single ? 'single' : 'integration'));
  const result = {
    complete: incompleteReasons.length === 0,
    fromSha: packet?.fromSha ?? null,
    toSha: packet?.toSha ?? null,
    packetDigest: packet?.digest ?? null,
    transport: transport ?? null,
    maxBytes: transport === 'native' ? maxBytes : null,
    manifest: [...manifest],
    expectedSections: expectedSectionIndices,
    reviewedPaths: manifest.filter((entry) => single ? owner.reviewedPaths.includes(entry)
      : roleEvidence.some((evidence) => DETAIL_ROLES.includes(evidence.role) && evidence.reviewedPaths.includes(entry))
        && roleEvidence.some((evidence) => evidence.role === 'integration' && evidence.reviewedPaths.includes(entry))),
    reviewedSections: expectedSectionIndices.filter((section) => Number.isSafeInteger(section) && section >= 0
      && roleEvidence.length > 0 && roleEvidence.every((evidence) => evidence.reviewedSections.includes(section))),
    incompleteReasons,
    highRiskSignals,
    findings: mergeFindings(responseList),
    strengths: unique(responseList.flatMap((report) => textItems(report?.strengths))),
    priorVerification: owner?.priorVerification ?? [],
    roleEvidence,
    invalidReports: roleEvidence.filter((evidence) => evidence.errors.length)
      .map((evidence) => ({ index: evidence.index, report: responseList[evidence.index] ?? null })),
  };
  return { ...result, markdown: renderMarkdown(result) };
}

function inline(value) {
  return String(value).replace(/[\uD800-\uDFFF]/gu, (character) => JSON.stringify(character).slice(1, -1))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_\[\]])/g, '\\$1').replace(/\r/g, '&#13;').replace(/\n/g, '<br>');
}

function renderMarkdown(result) {
  const renderFindings = (severity) => {
    const selected = result.findings.filter((finding) => finding.severity === severity);
    return selected.length ? selected.map((finding) => [
      `- **${inline(finding.path)}:${finding.line}** — ${inline(finding.problem)}`,
      `  Consequence: ${inline(finding.consequence)}`,
      `  Correction: ${inline(finding.correction)}`,
    ].join('\n')).join('\n\n') : 'None';
  };
  const blocking = result.findings.filter((finding) => finding.severity !== 'Minor');
  const lines = [
    '### Strengths', '',
    result.strengths.length ? result.strengths.slice(0, 3).map((strength) => `- ${inline(strength)}`).join('\n') : 'None', '',
    '### Blocking findings', '', '#### Critical', '', renderFindings('Critical'), '',
    '#### Important', '', renderFindings('Important'), '',
    '### Non-blocking findings', '', '#### Minor', '', renderFindings('Minor'), '',
    '### Review evidence', '',
    `**Review complete:** ${result.complete ? 'yes' : 'no'}`,
    `**Reviewed range:** ${inline(result.fromSha)}..${inline(result.toSha)}`,
    `**Packet digest:** ${inline(result.packetDigest)}`,
    `**Evidence transport:** ${inline(result.transport)}`,
    ...(result.transport === 'native' ? [`**Evidence output bound:** ${inline(result.maxBytes)} bytes`] : []),
    `**Reviewed files:** ${result.reviewedPaths.length}/${result.manifest.length}`,
    `**Reviewed paths:** ${inline(JSON.stringify(result.reviewedPaths))}`,
    `**Reviewed sections:** ${inline(JSON.stringify(result.reviewedSections))}`,
    `**Expected sections:** ${inline(JSON.stringify(result.expectedSections))}`,
    `**Prior verification:** ${result.priorVerification.length ? inline(JSON.stringify(result.priorVerification)) : 'None'}`,
    `**Blocking findings:** ${blocking.length ? blocking.map((finding) => `${finding.severity} ${inline(finding.path)}:${finding.line} — ${inline(finding.problem)}`).join('; ') : 'none'}`,
    `**High-risk signals:** ${result.highRiskSignals.length ? result.highRiskSignals.map(inline).join('; ') : 'None'}`,
    `**Explanation:** ${result.complete ? 'All required report evidence matches the pinned packet and role assignments.' : 'Required review evidence is incomplete; see every reason below.'}`,
  ];
  if (result.incompleteReasons.length) lines.push('', ...result.incompleteReasons.map((reason) => `- ${inline(reason)}`));
  lines.push('', '**Per-role evidence:**', '');
  for (const evidence of result.roleEvidence) {
    lines.push(
      `- Report ${evidence.index}, role ${inline(evidence.role)}: ${evidence.reviewedPaths.length}/${result.manifest.length} paths.`,
      `  Assigned file indices: ${inline(JSON.stringify(evidence.assignedFileIndices))}`,
      `  File indices: ${inline(JSON.stringify(evidence.reviewedFileIndices))}`,
      `  Paths: ${inline(JSON.stringify(evidence.reviewedPaths))}`,
      `  Sections: ${inline(JSON.stringify(evidence.reviewedSections))}`,
      `  Checks: ${inline(JSON.stringify(evidence.checksCompleted))}`,
      `  Prior verification: ${inline(JSON.stringify(evidence.priorVerification))}`,
      `  Validation evidence: ${evidence.errors.length ? evidence.errors.map(inline).join('; ') : 'Exact role, range, digest, file indices, mapped paths, sections, checks, and required prior verification supplied.'}`,
    );
  }
  lines.push('', 'The merger validates structure and preserves distinct conclusions; it does not establish semantic agreement. The caller must mark the review incomplete if supplied evidence cannot reconcile contradictory conclusions.');
  if (result.invalidReports.length) {
    lines.push('', '### Invalid report evidence', '');
    for (const invalid of result.invalidReports) {
      lines.push(`Report ${invalid.index}:`, '', '<pre>', inline(JSON.stringify(invalid.report, null, 2)), '</pre>', '');
    }
  }
  return `${lines.join('\n')}\n`;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath);
  const text = raw.toString('utf8');
  if (!raw.equals(Buffer.from(text, 'utf8'))) throw new Error(`${filePath} contains invalid UTF-8.`);
  return JSON.parse(text);
}

function main(args) {
  if (args.length !== 1) throw new Error('Usage: node combine-reviews.js <input.json>');
  const inputPath = path.resolve(args[0]);
  const input = readJson(inputPath);
  const reports = Array.isArray(input.reports) ? input.reports.map((report) => {
    if (typeof report !== 'string') return report;
    const reportPath = path.resolve(path.dirname(inputPath), report);
    try {
      return readJson(reportPath);
    } catch (error) {
      return { loadError: `Could not load report ${reportPath}: ${error.message}` };
    }
  }) : input.reports;
  const result = combineReviews({ ...input, reports });
  process.stdout.write(result.markdown);
  process.exitCode = result.complete ? 0 : 1;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`combine-reviews: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { combineReviews, REQUIRED_CHECKS };
