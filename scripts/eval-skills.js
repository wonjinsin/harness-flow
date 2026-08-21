'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { evaluateReviewStateFixtures } = require('./review-state-contract.js');
const { evaluateRoutingFixtures } = require('./routing-contract.js');

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function evaluateFixtures(root = process.cwd(), fixturePath = path.join(root, 'tests', 'skills', 'eval-fixtures.json')) {
  const errors = [];
  let fixtures;
  try {
    fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    return { count: 0, errors: [`cannot load fixtures: ${error.message}`] };
  }
  if (!Array.isArray(fixtures)) return { count: 0, errors: ['fixtures must be an array'] };

  for (const fixture of fixtures) {
    const label = fixture.name || '<unnamed fixture>';
    const absoluteFile = path.resolve(root, fixture.file || '');
    if (!fs.existsSync(absoluteFile)) {
      errors.push(`${label}: missing file ${fixture.file || '<empty>'}`);
      continue;
    }
    const text = normalize(fs.readFileSync(absoluteFile, 'utf8'));

    for (const required of fixture.required || []) {
      if (!text.includes(normalize(required))) {
        errors.push(`${label}: missing required text ${JSON.stringify(required)}`);
      }
    }
    for (const forbidden of fixture.forbidden || []) {
      if (text.includes(normalize(forbidden))) {
        errors.push(`${label}: contains forbidden text ${JSON.stringify(forbidden)}`);
      }
    }

    let cursor = 0;
    for (const ordered of fixture.ordered || []) {
      const expected = normalize(ordered);
      const index = text.indexOf(expected, cursor);
      if (index === -1) {
        errors.push(`${label}: ordered text appears out of order or is missing: ${JSON.stringify(ordered)}`);
        break;
      }
      cursor = index + expected.length;
    }
  }

  return { count: fixtures.length, errors };
}

function evaluateAll(root = process.cwd()) {
  const workflows = evaluateFixtures(root);
  const routing = evaluateRoutingFixtures(
    path.join(root, 'tests', 'skills', 'routing-state-fixtures.json'),
  );
  const reviewStates = evaluateReviewStateFixtures(
    path.join(root, 'tests', 'skills', 'review-state-fixtures.json'),
  );
  return {
    workflowCount: workflows.count,
    routingCount: routing.count,
    reviewStateCount: reviewStates.count,
    errors: [...workflows.errors, ...routing.errors, ...reviewStates.errors],
  };
}

if (require.main === module) {
  const result = evaluateAll(process.cwd());
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Evaluated ${result.workflowCount} workflow fixtures, ${result.routingCount} routing fixtures, and ${result.reviewStateCount} review-state fixtures.`,
    );
  }
}

module.exports = { evaluateAll, evaluateFixtures };
