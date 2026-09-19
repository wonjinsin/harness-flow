'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('plugin exposes each skill name exactly once', () => {
  const names = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      if (entry.isFile() && entry.name === 'SKILL.md') {
        const match = fs.readFileSync(full, 'utf8').match(/^name:\s*(.+)$/m);
        if (match) names.push({ name: match[1].trim(), full });
      }
    }
  };
  visit(path.join(ROOT, 'skills'));
  const duplicates = names.filter((item, index) =>
    names.findIndex((candidate) => candidate.name === item.name) !== index
  );
  assert.deepEqual(duplicates, []);
});

test('Codex SDD profile templates are removed', () => {
  const legacyProfileDir = ['codex', 'agents'].join('-');
  const profileDir = path.join(ROOT, 'skills/using-harness-flow/references', legacyProfileDir);
  assert.equal(fs.existsSync(profileDir), false);
});

test('entry skill uses harness-neutral wording, not Claude-specific tools', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  assert.match(entry, /harness-neutral/i);
  assert.match(entry, /task tracking/i);
  assert.doesNotMatch(entry, /TodoWrite/);
});

test('skill-only edits route directly to writing-skills', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  assert.match(entry, /skill creation, editing, or verification[\s\S]*writing-skills[^\n]*directly/i);
  assert.match(entry, /skill-only work stays outside[\s\S]*brainstorming[^\n]*implement chain/i);
});

test('skill-only verification outranks generic read-only analysis', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  const brainstorming = read('skills/brainstorming/SKILL.md');
  const description = brainstorming.match(/^description:\s*(.+)$/m)?.[1] ?? '';

  assert.match(entry, /skill-only[\s\S]*takes precedence[\s\S]*generic read-only analysis/i);
  assert.match(description, /skill-only[\s\S]*writing-skills/i);
});

test('caveman starts in lite mode', () => {
  const caveman = read('skills/caveman/SKILL.md');
  assert.match(
    caveman,
    /Supports intensity levels: lite \(default\), full, ultra/,
  );
  assert.match(caveman, /Default: \*\*lite\*\*/);
  assert.doesNotMatch(caveman, /full \(default\)/);
});

test('SessionStart covers Codex resume and Windows hook commands', () => {
  const hooks = read('hooks/hooks.json');
  assert.match(hooks, /startup\|resume\|clear\|compact/);
  assert.match(hooks, /commandWindows/);
});

test('planning hands approved work to implement without leaking review internals', () => {
  const plans = read('skills/writing-plans/SKILL.md');
  const reviews = read('skills/requesting-code-review/SKILL.md');
  assert.doesNotMatch(plans, /review at each group boundary/i);
  assert.match(plans, /There is no\s+group-boundary reviewer/i);
  assert.match(plans, /After the user approves[\s\S]*settled plan[\s\S]*`implement`/i);
  assert.doesNotMatch(plans, /whole-branch|incremental review|reviewer-turn/i);
  assert.match(reviews, /fixed point/i);
});

test('TDD deletion rule preserves pre-existing user code', () => {
  const tdd = read('skills/test-driven-development/SKILL.md');
  assert.match(tdd, /pre-existing user code/i);
  assert.match(tdd, /current TDD cycle/i);
});

test('TDD requires self-explanatory code with bounded comment exceptions', () => {
  const tdd = read('skills/test-driven-development/SKILL.md');
  const commentsPattern = /^## Comments\s+([\s\S]*?)(?=^## |(?![\s\S]))/m;
  const comments = (tdd.match(commentsPattern)?.[1] ?? '').replace(/\s+/g, ' ');
  const finalSection = '## Comments\n\nFinal section content.';
  const finalComments = finalSection.match(commentsPattern)?.[1] ?? '';
  const words = comments.trim().split(/\s+/).filter(Boolean).length;

  assert.equal(finalComments.trim(), 'Final section content.');
  assert.ok(
    words <= 120,
    `comment guidance is ${words} words; expected at most 120`,
  );
  assert.match(comments, /self-explanatory code/i);
  assert.match(comments, /names[\s\S]*types[\s\S]*structure[\s\S]*tests/i);
  assert.match(comments, /do not add[\s\S]*restate[\s\S]*narrate[\s\S]*work history/i);
  assert.match(
    comments,
    /verified rationale[\s\S]*invariant[\s\S]*constraint[\s\S]*trade-off[\s\S]*code cannot express/i,
  );
  assert.match(comments, /explain why, not what/i);
  assert.match(comments, /licenses[\s\S]*directives[\s\S]*API\s+documentation/i);
  assert.match(comments, /before finishing[\s\S]*changed scope/i);
  assert.match(
    comments,
    /ordinary prose-only[\s\S]*behavior[\s\S]*types[\s\S]*directives[\s\S]*generated documentation[\s\S]*licenses/i,
  );
  assert.match(comments, /ordinary prose-only[\s\S]*existing relevant checks/i);
  assert.match(comments, /no new failing behavior test/i);
  assert.match(comments, /exception excludes runtime instructions and executable examples/i);
});

test('implementation delegates comment work without duplicating TDD policy', () => {
  const implement = read('skills/implement/SKILL.md');
  assert.equal(fs.existsSync(path.join(ROOT, 'skills/test-driven-development/comment-policy.md')), false);
  assert.match(implement, /load `harness-flow:test-driven-development`/i);
  assert.doesNotMatch(
    implement,
    /comment.policy|audit comments|exception evidence|explanatory.comment/i,
  );
});

test('legacy worktree skill is removed from the runtime workflow', () => {
  const worktreePath = path.join(ROOT, 'skills/using-git-worktrees/SKILL.md');
  const plans = read('skills/writing-plans/SKILL.md');
  const agents = read('AGENTS.md');
  const readme = read('README.md');

  assert.equal(fs.existsSync(worktreePath), false);
  for (const activeSurface of [plans, agents, readme]) {
    assert.doesNotMatch(activeSurface, /using-git-worktrees/i);
  }
});

test('implementation commits verified work before review', () => {
  const plans = read('skills/writing-plans/SKILL.md');
  const implement = read('skills/implement/SKILL.md');

  assert.match(plans, /current checkout/i);
  assert.doesNotMatch(plans, /isolated workspace/i);
  assert.match(implement, /Red[^\n]*Green[^\n]*Refactor/i);
  assert.match(implement, /focused tests[\s\S]*formatting[\s\S]*typechecking[\s\S]*full test suite/i);
  assert.match(implement, /every acceptance criterion/i);
  assert.match(implement, /verification commands and results/i);
  assert.match(implement, /when blocked[\s\S]*do not list[\s\S]*Next/i);
  assert.match(implement, /after verification succeeds[\s\S]*Conventional Commit/i);
  assert.doesNotMatch(
    implement,
    /commit SHA|BASE_SHA|TO_SHA|APPROVED_SHA|branch|worktree|finalization/i,
  );
});

test('callers normalize settled work before handing it to implement', () => {
  const brainstorming = read('skills/brainstorming/SKILL.md');
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const plans = read('skills/writing-plans/SKILL.md');
  const implement = read('skills/implement/SKILL.md');

  assert.match(brainstorming, /small[\s\S]*agreed brief[\s\S]*harness-flow:implement/i);
  assert.match(debugging, /confirmed fix[\s\S]*harness-flow:implement/i);
  assert.match(plans, /user approves[\s\S]*hand the settled plan to `implement`/i);
  assert.match(implement, /settled implementation input/i);
  assert.match(
    implement,
    /desired change[\s\S]*scope[\s\S]*acceptance criteria[\s\S]*optional ordered tasks/i,
  );
  assert.doesNotMatch(
    implement,
    /agreed small-change brief|approved implementation plan|confirmed bug-fix brief/i,
  );
});

test('spec and plan artifacts have concrete, non-overlapping routes', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  const brainstorming = read('skills/brainstorming/SKILL.md');
  const plans = read('skills/writing-plans/SKILL.md');
  const implement = read('skills/implement/SKILL.md');
  const agents = read('AGENTS.md');
  const readme = read('README.md');

  assert.match(entry, /explicit spec request[\s\S]*brainstorming/i);
  assert.match(entry, /explicit implementation plan request[\s\S]*writing-plans/i);
  assert.match(entry, /approved spec[\s\S]*writing-plans/i);
  assert.match(entry, /approved plan[\s\S]*implement/i);
  assert.match(brainstorming, /approved spec[\s\S]*writing-plans[\s\S]*approved plan[\s\S]*implement/i);
  assert.match(brainstorming, /explicit spec request[\s\S]*save the spec[\s\S]*stop/i);
  assert.doesNotMatch(brainstorming, /Spec \(only for the large exit\)/i);
  assert.doesNotMatch(implement, /approved (?:implementation )?plan or spec/i);
  assert.match(implement, /settled implementation input/i);
  assert.match(implement, /desired change[\s\S]*scope and constraints[\s\S]*acceptance criteria/i);
  assert.match(plans, /Source:.*spec path.*Inline approved design/i);
  assert.match(plans, /durable summary[\s\S]*session boundary/i);
  assert.doesNotMatch(plans, /Agreed design in current conversation/i);
  assert.match(plans, /Constraints:.*or "none"/i);
  assert.match(plans, /every source requirement[\s\S]*maps to[\s\S]*task/i);
  assert.match(plans, /never invent[\s\S]*spec path/i);
  assert.doesNotMatch(plans, /^Spec:/m);
  for (const overview of [agents, readme]) {
    assert.doesNotMatch(overview, /approved plan\/spec/i);
  }
});

test('implementation exposes review then memory revision as ordered next actions', () => {
  const implement = read('skills/implement/SKILL.md');
  const next = implement.indexOf('## Next');
  const review = implement.indexOf('harness-flow:requesting-code-review', next);
  const revise = implement.indexOf('harness-flow:llm-md-revise', next);

  assert.notEqual(next, -1, 'Next section must exist');
  assert.ok(next < review, 'review must be listed under Next');
  assert.ok(review < revise, 'memory revision must follow review');
  assert.match(implement, /separate next actions/i);
  assert.doesNotMatch(implement, /always invoke|bounded review|correction review|review loop/i);
  assert.equal(fs.existsSync(path.join(ROOT, 'skills/implement/finish-reviewed-change.md')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'skills/implement/task-isolation.md')), false);
});

test('PR creation states compact outcome contracts instead of shell recipes', () => {
  const prCreator = read('skills/pr-creator/SKILL.md');

  assert.ok(prCreator.split(/\r?\n/).length <= 50);
  assert.doesNotMatch(prCreator, /git status --short|git branch --show-current/);
  assert.doesNotMatch(prCreator, /git rev-parse|git merge-base|git ls-remote/);
  assert.doesNotMatch(prCreator, /## Quick Reference|## Common Mistakes/);
  assert.match(prCreator, /uncommitted changes[\s\S]*stop[\s\S]*ask the user/i);
  assert.match(prCreator, /named branch[\s\S]*base branch/i);
  assert.match(prCreator, /actual diff[\s\S]*source of truth/i);
  assert.match(prCreator, /repository(?:'s)? PR template/i);
  assert.match(prCreator, /complete change set[\s\S]*PR[\s\S]*display/i);
  assert.match(prCreator, /multiple[\s\S]*templates[\s\S]*ask/i);
  assert.match(prCreator, /preserve[\s\S]*headings[\s\S]*order/i);
  assert.match(prCreator, /only[\s\S]*verification[\s\S]*run[\s\S]*observed/i);
  assert.match(prCreator, /normal,?\s*non-forced push/i);
  assert.match(prCreator, /publish[\s\S]*exact[\s\S]*publication snapshot/i);
  assert.match(
    prCreator,
    /remote branch (?:head|tip)[\s\S]*publication snapshot[\s\S]*before PR creation/i,
  );
  assert.match(prCreator, /working tree or\s*`HEAD` changes[\s\S]*stop/i);
  assert.match(prCreator, /PR[\s\S]*head[\s\S]*base[\s\S]*URL/i);
});

test('legacy finishing skill is removed from the runtime workflow', () => {
  const prCreator = read('skills/pr-creator/SKILL.md');
  const finishingPath = path.join(ROOT, 'skills/finishing-a-development-branch/SKILL.md');

  assert.equal(fs.existsSync(finishingPath), false);
  assert.doesNotMatch(prCreator, /finishing-a-development-branch/);
});

test('project memory follows the existing canonical instruction surface safely', () => {
  const memory = read('skills/llm-md-revise/SKILL.md');

  assert.match(memory, /existing canonical instruction surface/i);
  assert.match(memory, /if none exists[\s\S]*active harness[\s\S]*uncertain[\s\S]*ask/i);
  assert.match(memory, /thin import[\s\S]*real source file/i);
  assert.match(memory, /active harness\s+reliably loads/i);
  assert.match(memory, /never persist a secret|Secret \/ PII/i);
  assert.doesNotMatch(memory, /\.codex|\.claude\/projects|\.jsonl/);
});

test('mechanical changes stay on canonical routing', () => {
  const readme = read('README.md');
  const entry = read('skills/using-harness-flow/SKILL.md');
  const tdd = read('skills/test-driven-development/SKILL.md');

  assert.doesNotMatch(readme, /agent may skip `brainstorming` and TDD/i);
  assert.match(readme, /mechanical work is not a routing exception/i);
  assert.match(readme, /explicit user approval/i);
  assert.match(entry, /skip a skill's workflow only when the user explicitly tells you to/i);
  assert.match(tdd, /behavior-preserving[\s\S]*(?:move|rename)[\s\S]*ask first/i);
});

test('bug requests cannot auto-route through brainstorming', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  const brainstorming = read('skills/brainstorming/SKILL.md');
  const description = brainstorming.match(/^description:\s*(.+)$/m)?.[1] ?? '';

  assert.doesNotMatch(description, /\bfix\b/i);
  assert.match(description, /bugs?[\s\S]*systematic-debugging/i);
  assert.match(entry, /Bug \/ test failure \/ unexpected behavior[\s\S]*systematic-debugging/i);
});

test('invalidated bug fixes return evidence to systematic debugging', () => {
  const implement = read('skills/implement/SKILL.md');

  assert.match(implement, /invalidated root-cause hypothesis[\s\S]*systematic-debugging/i);
  assert.doesNotMatch(implement, /revert|reset|rebase|amend/i);
});

test('systematic debugging keeps diagnosis mutation-free', () => {
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const tracing = read('skills/systematic-debugging/root-cause-tracing.md');

  assert.ok(debugging.split(/\r?\n/).length <= 55, 'systematic-debugging must stay compact');
  assert.match(debugging, /not\s+reproducible[\s\S]*gather[\s\S]*evidence[\s\S]*report[\s\S]*gap/i);
  assert.match(debugging, /smallest non-mutating observation/i);
  assert.match(debugging, /retry[\s\S]*bug-fix brief[\s\S]*do not implement it here/i);
  assert.match(
    debugging,
    /implementation or verification fails[\s\S]*stop[\s\S]*count[\s\S]*return here/i,
  );
  assert.doesNotMatch(debugging, /```bash|~95%|wrong architecture/i);
  assert.doesNotMatch(debugging, /test it with the \*smallest\*\s*change/i);
  assert.doesNotMatch(debugging, /codesign --sign/i);
  assert.doesNotMatch(tracing, /console\.error/);
});

test('project-memory candidates keep compact evidence and approval rules', () => {
  const memory = read('skills/llm-md-revise/SKILL.md');

  assert.doesNotMatch(memory, /claude-md-improver/i);
  assert.match(memory, /current session[\s\S]*branch diff/i);
  assert.match(memory, /code-derivable[\s\S]*one-off[\s\S]*duplicate/i);
  assert.match(memory, /ID \| durable reason \| target \| exact diff/i);
  assert.match(memory, /apply only[\s\S]*selected/i);
  assert.doesNotMatch(memory, /systematic-debugging`? Phase 4 verified/i);
});

test('project memory bounds root growth without implicit cleanup', () => {
  const memory = read('skills/llm-md-revise/SKILL.md');

  assert.match(memory, /resulting line count/i);
  assert.match(memory, /200 lines or fewer[\s\S]*root/i);
  assert.match(memory, /above 200 lines[\s\S]*new additions/i);
  assert.match(memory, /smallest coherent\s+existing block[\s\S]*separate approval/i);
  assert.match(memory, /reliable loading[\s\S]*priority/i);
  assert.match(memory, /never reorganize unrelated existing instructions/i);
});

test('writing-skills has one cross-harness authoring contract', () => {
  const writing = read('skills/writing-skills/SKILL.md');
  const official = read('skills/writing-skills/anthropic-best-practices.md');
  const testing = read('skills/writing-skills/testing-skills-with-subagents.md');
  const persuasion = read('skills/writing-skills/persuasion-principles.md');

  assert.match(writing, /local policy[\s\S]*overrides[\s\S]*what \+ when/i);
  assert.match(official, /harness-flow override[\s\S]*triggering conditions only/i);
  assert.doesNotMatch(testing, /Don't test:\s*\n- Pure reference skills/i);
  assert.match(testing, /pure reference skills[\s\S]*retrieval[\s\S]*application[\s\S]*gap/i);
  assert.match(writing, /Reference skill evaluation[\s\S]*retrieval[\s\S]*application[\s\S]*gap/i);
  assert.match(writing, /future agents/i);
  assert.doesNotMatch(
    writing,
    /future Claude|Claude (?:reads|may|correctly|will)|words Claude/i,
  );
  for (const text of [writing, persuasion]) {
    assert.doesNotMatch(text, /TodoWrite/);
    assert.match(text, /native task-tracking/i);
  }
});

test('writing-skills stays compact and defines one local metadata contract', () => {
  const writing = read('skills/writing-skills/SKILL.md');
  const official = read('skills/writing-skills/anthropic-best-practices.md');

  assert.ok(writing.split(/\r?\n/).length <= 500);
  assert.match(writing, /`name`[^\n]*64 characters/i);
  assert.match(writing, /`description`[^\n]*1024 characters/i);
  assert.doesNotMatch(writing, /max 1024 characters total/i);
  assert.match(writing, /start with `Use when/i);
  assert.doesNotMatch(writing, /description[^\n]*third-person/i);
  assert.match(official, /non-normative[\s\S]*third-person/i);
});

test('all local skill descriptions use the trigger-only entry form', () => {
  const skillDirs = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((dir) => fs.existsSync(path.join(ROOT, 'skills', dir, 'SKILL.md')));
  for (const dir of skillDirs) {
    const skill = read(`skills/${dir}/SKILL.md`);
    assert.match(skill, /^description:\s*"?Use when\b/im, dir);
  }
});

test('skill evaluation form is selected by skill type', () => {
  const writing = read('skills/writing-skills/SKILL.md');
  const testing = read('skills/writing-skills/testing-skills-with-subagents.md');

  for (const text of [writing, testing]) {
    assert.match(text, /discipline[\s\S]*pressure/i);
    assert.match(text, /technique[\s\S]*application[\s\S]*variation/i);
    assert.match(text, /pattern[\s\S]*recognition[\s\S]*counter/i);
    assert.match(text, /reference[\s\S]*retrieval[\s\S]*application[\s\S]*gap/i);
  }
  assert.match(testing, /discipline-only pressure evaluation/i);
  assert.doesNotMatch(writing, /\*\*Test case\*\*\s*\|\s*Pressure scenario/i);
});

test('skill edits preserve baseline content and publishing needs separate approval', () => {
  const writing = read('skills/writing-skills/SKILL.md');

  assert.match(writing, /existing skill edit[\s\S]*pre-edit version/i);
  assert.match(writing, /discard only[\s\S]*current-cycle[\s\S]*agent-authored/i);
  assert.match(writing, /never delete or revert[\s\S]*pre-existing user/i);
  assert.match(writing, /commit[\s\S]*explicit user approval/i);
  assert.match(writing, /push[\s\S]*separate explicit user approval/i);
  assert.doesNotMatch(writing, /commit skill to git and push/i);
});

test('caveman frontmatter contains triggers only', () => {
  const caveman = read('skills/caveman/SKILL.md');
  const frontmatter = caveman.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';

  assert.match(frontmatter, /description:[\s\S]*Use when/i);
  assert.doesNotMatch(frontmatter, /Ultra-compressed|Cuts token usage|Supports intensity/i);
});

test('condition waiting accepts valid falsy generic values', () => {
  const waiting = read('skills/systematic-debugging/condition-based-waiting.md');

  assert.match(waiting, /result !== undefined/);
  assert.doesNotMatch(waiting, /if\s*\(result\)\s*return result/);
  assert.match(waiting, /0[\s\S]*empty string[\s\S]*false/i);
  assert.match(waiting, /waitFor\(\(\) => getResult\(\), 'result available'\)/);
  assert.match(waiting, /'DONE event'[\s\S]*'ready state'[\s\S]*'path exists'/);
});

test('post-review memory suggestion and canonical docs stay aligned', () => {
  const memory = read('skills/llm-md-revise/SKILL.md');
  const description = memory.match(/^description:\s*(.+)$/m)?.[1] ?? '';
  const agents = read('AGENTS.md');
  const readme = read('README.md');
  const claude = read('CLAUDE.md');
  const placementPath = path.join(ROOT, 'skills/llm-md-revise/references/placement-decision.md');
  const examplesPath = path.join(ROOT, 'skills/llm-md-revise/references/examples.md');

  assert.match(description, /^Use when the user chooses project-memory revision after a code review;/);
  assert.doesNotMatch(description, /^Use when a code review is complete;/);
  assert.match(memory, /after a completed code review[\s\S]*branch diff/i);
  assert.match(memory, /if no candidates remain[\s\S]*report[\s\S]*stop/i);
  assert.match(agents, /Next[^\n]*requesting-code-review[^\n]*llm-md-revise/i);
  assert.match(readme, /IMPL -. "Next 1" .-> REVIEW/);
  assert.match(readme, /REVIEW -. "Next 2" .-> LMR/);
  assert.doesNotMatch(memory, /before[^\n]*review range|approved edits enter the branch before review/i);
  assert.equal(claude.trim(), '@AGENTS.md');
  assert.ok(memory.split(/\r?\n/).length <= 80, 'llm-md-revise must stay at or below 80 lines');
  assert.equal(fs.existsSync(placementPath), false);
  assert.equal(fs.existsSync(examplesPath), false);
});

test('caveman lite keeps articles while stronger modes may drop them', () => {
  const caveman = read('skills/caveman/SKILL.md');

  assert.doesNotMatch(caveman, /Drop: articles/);
  assert.match(caveman, /lite[^\n]*Keep articles/i);
  assert.match(caveman, /full[^\n]*Drop articles/i);
  assert.match(caveman, /ultra[^\n]*Drop articles/i);
});

test('routing gives unconfirmed bugs priority over explicit plan requests', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const plans = read('skills/writing-plans/SKILL.md');
  const agents = read('AGENTS.md');

  assert.match(entry, /first matching route/i);
  assert.match(
    entry,
    /unconfirmed bug[\s\S]*including an explicit implementation plan request[\s\S]*systematic-debugging/i,
  );
  assert.match(
    debugging,
    /explicitly requested an implementation plan[\s\S]*writing-plans/i,
  );
  assert.match(plans, /confirmed bug-fix brief/i);
  assert.match(
    agents,
    /Phase 4[\s\S]{0,260}explicit implementation plan[\s\S]{0,120}writing-plans[\s\S]{0,120}otherwise[\s\S]{0,80}implement/i,
  );
});

test('skill evaluations run one RED GREEN cycle per case', () => {
  const writing = read('skills/writing-skills/SKILL.md');
  const testing = read('skills/writing-skills/testing-skills-with-subagents.md');

  for (const text of [writing, testing]) {
    assert.match(text, /one case per RED[^\n]*GREEN cycle/i);
  }
  assert.match(
    testing,
    /application[\s\S]*RED[^\n]*GREEN[\s\S]*variation[\s\S]*RED[^\n]*GREEN/i,
  );
  assert.match(
    testing,
    /retrieval[\s\S]*RED[^\n]*GREEN[\s\S]*application[\s\S]*RED[^\n]*GREEN[\s\S]*gap[\s\S]*RED[^\n]*GREEN/i,
  );
});

test('project-specific schemas stay in project documentation, not skills', () => {
  const writing = read('skills/writing-skills/SKILL.md');
  const official = read('skills/writing-skills/anthropic-best-practices.md');

  assert.match(writing, /project-specific fact[\s\S]*project documentation/i);
  assert.match(
    official,
    /Harness-flow note[\s\S]*project-specific[\s\S]*project documentation/i,
  );
  assert.doesNotMatch(official, /Create a Skill[\s\S]{0,200}Include the table schemas/i);
});
