'use strict';

const fs = require('node:fs');

function routeRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'UNRESOLVED';
  }

  if (input.technicalIssue === true) return 'systematic-debugging';
  if (input.reviewArtifact === true) return 'requesting-code-review';
  if (input.approvedTaskPlan === true) return 'implement';
  if (input.approvedDesignOrSpec === true || input.explicitPlanRequest === true) {
    return 'writing-plans';
  }
  if (
    input.readOnlyCodebase === true
    || input.changeIntent === true
    || input.explicitSpecRequest === true
  ) {
    return 'brainstorming';
  }
  if (input.generalKnowledge === true) return 'ANSWER_DIRECTLY';
  return 'UNRESOLVED';
}

function evaluateRoutingFixtures(fixturePath) {
  let fixtures;
  try {
    fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    return { count: 0, errors: [`cannot load routing fixtures: ${error.message}`] };
  }
  if (!Array.isArray(fixtures)) {
    return { count: 0, errors: ['routing fixtures must be an array'] };
  }

  const errors = [];
  for (const fixture of fixtures) {
    const actual = routeRequest(fixture.input);
    if (actual !== fixture.expected) {
      errors.push(
        `${fixture.name || '<unnamed fixture>'}: expected ${fixture.expected}, got ${actual}`,
      );
    }
  }
  return { count: fixtures.length, errors };
}

module.exports = { evaluateRoutingFixtures, routeRequest };
