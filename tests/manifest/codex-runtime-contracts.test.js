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

test('review dispatch documents the Codex direct-call translation', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  for (const text of [review, template]) {
    assert.match(text, /spawn_agent/);
    assert.match(text, /fork_turns[^\n]*none/);
    assert.match(text, /final_review/);
    assert.match(text, /unused-ordinal/i);
    assert.match(text, /TO_SHA-prefix/i);
  }
  assert.match(review, /unique[\s\S]*task_name/i);
});

test('code review is report-only and standalone review has no fix lifecycle', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  assert.match(review, /one invocation returns one report and stops/i);
  assert.match(review, /never fixes code, repeats a review,[\s\S]*finishes a branch/i);
  assert.match(template, /report-only/i);
  assert.match(template, /do not edit[\s\S]*stage[\s\S]*commit[\s\S]*push/i);
  assert.match(template, /do not dispatch a fixer/i);
  assert.match(template, /files, worktree, index, refs,\s+repository config, or remotes/i);
  assert.match(template, /delete, move[\s\S]*restore[\s\S]*stash[\s\S]*clean/i);
});

test('code review preflights an immutable commit range', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  assert.match(review, /git merge-base/);
  assert.match(review, /git symbolic-ref -q HEAD/);
  assert.match(review, /git status --porcelain=v2 --branch --untracked-files=all --ignored=matching/);
  assert.match(review, /git for-each-ref/);
  assert.match(review, /git ls-files --stage --debug/);
  assert.match(review, /git config --local --list/);
  assert.match(review, /git remote -v/);
  assert.match(review, /git diff --quiet/);
  assert.match(review, /exit 1[\s\S]*non-empty diff/i);
  assert.match(review, /dirty[\s\S]*stop/i);
  assert.match(review, /empty[\s\S]*stop/i);
});

test('review report proves coverage with two decision fields', () => {
  const template = read('skills/requesting-code-review/code-reviewer.md');
  assert.match(template, /Stage 1[\s\S]*Requirements compliance/i);
  assert.match(template, /Stage 2[\s\S]*Implementation quality/i);
  assert.match(template, /do not run tests/i);
  assert.match(template, /Review complete:[^\n]*yes[^\n]*no/i);
  assert.match(template, /Blocking findings:[^\n]*none[^\n]*finding list/i);
  assert.match(template, /Reviewed range/);
  assert.match(template, /git diff --name-only/);
  assert.match(template, /each listed path[\s\S]*exactly once/i);
  assert.match(template, /Reviewed files:[^\n]*N\/N/i);
  assert.match(template, /reviewed-file count[\s\S]*changed-file count[\s\S]*Review complete[^\n]*no/i);
  assert.match(template, /do not\s+run an aggregate diff/i);
  assert.doesNotMatch(template, /Finding ID|Gate status|impl-fix|plan-escalate/i);
});

test('code review uses one immutable range contract for initial and incremental review', () => {
  const implement = read('skills/implement/SKILL.md');
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  for (const text of [review, template]) {
    assert.match(text, /FROM_SHA/);
    assert.match(text, /TO_SHA/);
    assert.match(text, /PRIOR_REPORT/);
    assert.doesNotMatch(text, /verify-fix|REVIEWED_HEAD|FIXED_HEAD|RESOLVED_FINDINGS/i);
  }
  assert.match(review, /initial[\s\S]*`BASE_SHA`[\s\S]*`FROM_SHA`/i);
  assert.match(review, /incremental[\s\S]*`LAST_REVIEWED_SHA`[\s\S]*`FROM_SHA`/i);
  assert.match(review, /all earlier complete reports in order/i);
  assert.match(review, /Earlier\s+report N/i);
  assert.match(implement, /append[\s\S]*whole report[\s\S]*`PRIOR_REPORT`/i);
  assert.match(review, /fresh-context[\s\S]*every invocation/i);
  assert.match(template, /prior reports[\s\S]*every earlier blocking finding/i);
  assert.doesNotMatch(review, /resume the same reviewer/i);
});

test('managed review loop batches fixes over bounded incremental ranges', () => {
  const implement = read('skills/implement/SKILL.md');
  const brainstorm = read('skills/brainstorming/SKILL.md');
  assert.match(implement, /initial[\s\S]*`BASE_SHA` as `FROM_SHA`[\s\S]*current `HEAD` as `TO_SHA`/i);
  assert.match(implement, /`Review complete: no`[\s\S]*stop/i);
  assert.match(implement, /blocking findings[\s\S]*batch[\s\S]*TDD[\s\S]*full suite[\s\S]*commit/i);
  assert.match(implement, /`LAST_REVIEWED_SHA`[\s\S]*`FROM_SHA`[\s\S]*`PRIOR_REPORT`/i);
  assert.match(implement, /at most two correction review turns/i);
  assert.match(implement, /blocking findings[^\n]*none[\s\S]*`APPROVED_SHA`[\s\S]*`TO_SHA`/i);
  assert.doesNotMatch(implement, /verify-fix|Gate status|finding ledger|semantic expansion/i);
  assert.doesNotMatch(brainstorm, /verify-fix|Gate status|post-fix reviewer/i);
});

test('reviewer fallback discloses limits and invalidates detected mutation', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  assert.match(review, /after the reviewer returns[\s\S]*repeat every snapshot check[\s\S]*compare/i);
  assert.match(review, /native[\s\S]*read-only[\s\S]*when available/i);
  assert.match(review, /otherwise[\s\S]*snapshot[\s\S]*detection[\s\S]*not fail-closed/i);
  assert.match(review, /ignored-file[\s\S]*contents[\s\S]*not covered/i);
  assert.match(review, /snapshot[\s\S]*(?:command|pipeline)[\s\S]*(?:failure|error)[\s\S]*stop/i);
  assert.match(review, /requires\s+fail-closed[\s\S]*do not\s+dispatch/i);
  assert.doesNotMatch(review, /Tool-level read-only protection is mandatory/i);
  assert.doesNotMatch(review, /no write-capable access to the active checkout/i);
  assert.match(review, /timeout[\s\S]*empty[\s\S]*malformed[\s\S]*not approval/i);
  assert.match(review, /Review complete: no[\s\S]*plain-language explanation/i);
  assert.match(review, /state changed[\s\S]*invalid[\s\S]*never\s+revert/i);
});

test('review packages inline requirements and always uses fresh context', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');

  assert.match(review, /`REQUIREMENTS`[\s\S]*copied inline/i);
  assert.doesNotMatch(template, /plan file path/i);
  assert.match(template, /requirements text copied into this prompt/i);
  assert.match(review, /fresh-context on\s+every invocation/i);
  assert.match(review, /do not resume a previous reviewer/i);
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
  assert.match(reviews, /one immutable commit range/i);
});

test('TDD deletion rule preserves pre-existing user code', () => {
  const tdd = read('skills/test-driven-development/SKILL.md');
  assert.match(tdd, /pre-existing user code/i);
  assert.match(tdd, /current TDD cycle/i);
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

test('implementation preflights the current checkout without creating isolation', () => {
  const plans = read('skills/writing-plans/SKILL.md');
  const implement = read('skills/implement/SKILL.md');

  assert.match(plans, /current checkout/i);
  assert.doesNotMatch(plans, /isolated workspace/i);
  assert.match(implement, /before the first code change[\s\S]*git status/i);
  assert.match(implement, /pre-existing[\s\S]*uncommitted[\s\S]*stop[\s\S]*user direction/i);
  assert.match(implement, /BASE_SHA[\s\S]*before[\s\S]*first code\s+change/i);
  assert.match(implement, /unexpected baseline failure[\s\S]*stop[\s\S]*systematic-debugging/i);
  assert.match(implement, /base branch[\s\S]*before[\s\S]*editing/i);
  assert.match(implement, /before the integration choice[\s\S]*do not create or switch[\s\S]*branch[\s\S]*worktree/i);
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

test('instruction revision is committed before review and finalization is lazy', () => {
  const implement = read('skills/implement/SKILL.md');
  const revision = read('skills/llm-md-revise/SKILL.md');
  const agents = read('AGENTS.md');
  const finish = read('skills/implement/finish-reviewed-change.md');
  const prCreator = read('skills/pr-creator/SKILL.md');
  const readme = read('README.md');

  const completeness = implement.indexOf('## Before the final review: completeness check');
  const revise = implement.indexOf('harness-flow:llm-md-revise');
  const review = implement.indexOf('## Bounded review loop');
  const finishHandoff = implement.indexOf('## Finish');

  for (const [name, position] of Object.entries({ completeness, revise, review, finishHandoff })) {
    assert.notEqual(position, -1, `${name} marker must exist`);
  }
  assert.ok(completeness < revise, 'revision must follow the completeness check');
  assert.ok(revise < review, 'revision must precede the review range');
  assert.ok(review < finishHandoff, 'review must precede finalization');
  assert.match(implement, /approved\s+instruction edits must be committed[\s\S]*final review includes them/i);
  assert.match(implement, /`APPROVED_SHA`[\s\S]*finish-reviewed-change\.md/i);
  assert.match(finish, /do not invoke instruction revision again/i);
  assert.match(finish, /immediately after the user chooses[\s\S]*`HEAD == APPROVED_SHA`/i);
  assert.match(finish, /pr-creator[\s\S]*same `APPROVED_SHA`/i);
  assert.match(prCreator, /managed handoff[\s\S]*`APPROVED_SHA`[\s\S]*`PUBLISH_HEAD`[\s\S]*immediately before[\s\S]*push/i);
  assert.match(
    prCreator,
    /immediately before any push and again immediately before `gh pr create`, repeat\s*`git status --short` and resolve `HEAD`\. Stop if the tree is dirty or `HEAD`\s*differs from `PUBLISH_HEAD`/i,
  );
  assert.match(prCreator, /git ls-remote/i);
  assert.match(prCreator, /remote branch tip[\s\S]*equal `PUBLISH_HEAD`/i);
  assert.match(prCreator, /after[\s\S]*creation[\s\S]*`headRefOid`[\s\S]*equal[\s\S]*`PUBLISH_HEAD`/i);
  assert.deepEqual(prCreator.match(/^git push .*$/gm), [
    'git push origin "<PUBLISH_HEAD>:refs/heads/<branch>"',
  ]);
  assert.doesNotMatch(prCreator, /\$PUBLISH_HEAD:/);
  assert.doesNotMatch(prCreator, /git push -u/);
  assert.match(prCreator, /replace `<PUBLISH_HEAD>`[\s\S]*verified commit SHA/i);
  assert.doesNotMatch(prCreator, /only if the branch isn't already pushed/i);
  assert.match(revision, /before[\s\S]*review range[\s\S]*pinned/i);
  assert.match(agents, /llm-md-revise[\s\S]*review range[\s\S]*commit/i);
  assert.match(readme, /IMPL -- "durable candidates" --> LMR/);
  assert.match(readme, /IMPL -- "no candidates" --> REVIEW/);
  assert.match(readme, /LMR[^\n]*--> REVIEW/);
  assert.doesNotMatch(readme, /REVIEW[^\n]*--> LMR/);
  assert.match(finish, /pull request[\s\S]*base[\s\S]*branch/i);
  assert.doesNotMatch(implement, /finishing-a-development-branch/);
});

test('legacy finishing skill is removed from the runtime workflow', () => {
  const prCreator = read('skills/pr-creator/SKILL.md');
  const finishingPath = path.join(ROOT, 'skills/finishing-a-development-branch/SKILL.md');

  assert.equal(fs.existsSync(finishingPath), false);
  assert.doesNotMatch(prCreator, /finishing-a-development-branch/);
});

test('project memory is platform-aware', () => {
  const memory = read('skills/llm-md-revise/SKILL.md');
  assert.match(memory, /Codex[\s\S]*AGENTS\.md/);
  assert.match(memory, /do not scan them by guessed path/i);
  // Codex nested-file loading is launch-cwd dependent, not subtree/on-demand
  assert.match(memory, /launch(ed)?[\s\S]*director/i);
  // never persist secrets/credentials/PII into instruction files
  assert.match(memory, /never persist a secret|Secret \/ PII/i);
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

test('implementation reaches review with a named branch and clean committed output', () => {
  const implement = read('skills/implement/SKILL.md');
  const detachedGuard = implement.indexOf('git symbolic-ref -q --short HEAD');
  const firstChange = implement.indexOf('## Default: implement inline');

  assert.notEqual(detachedGuard, -1, 'detached-HEAD preflight must exist');
  assert.ok(detachedGuard < firstChange, 'detached-HEAD preflight must run before editing');
  assert.match(implement, /detached HEAD[\s\S]*before the first code change[\s\S]*stop/i);
  assert.match(implement, /formatter[\s\S]*before[\s\S]*(?:task|brief)[\s\S]*commit/i);
  assert.match(implement, /full suite[\s\S]*format check[\s\S]*typecheck/i);
  assert.match(implement, /formatter[\s\S]*writes[\s\S]*test[\s\S]*commit[\s\S]*clean/i);
});

test('reviewed change finalization is lazy-loaded and pins one approved SHA', () => {
  const implement = read('skills/implement/SKILL.md');
  const finishPath = path.join(ROOT, 'skills/implement/finish-reviewed-change.md');
  const pr = read('skills/pr-creator/SKILL.md');

  assert.equal(fs.existsSync(finishPath), true);
  const finish = fs.readFileSync(finishPath, 'utf8');
  assert.match(implement, /after[\s\S]*`APPROVED_SHA`[\s\S]*read[\s\S]*finish-reviewed-change\.md/i);
  assert.doesNotMatch(implement, /`SOURCE_BRANCH`|git merge --abort|harness-flow:pr-creator/i);
  assert.match(finish, /clean[\s\S]*`HEAD == APPROVED_SHA`/i);
  assert.match(finish, /pull request[\s\S]*merge into[\s\S]*base\s+branch/i);
  assert.match(finish, /pr-creator[\s\S]*same `APPROVED_SHA`/i);
  assert.match(finish, /merge exactly `APPROVED_SHA`/i);
  assert.match(finish, /merge result[\s\S]*descends from `APPROVED_SHA`/i);
  assert.match(finish, /conflict[\s\S]*git merge --abort[\s\S]*clean[\s\S]*new review/i);
  assert.match(pr, /managed handoff[\s\S]*`APPROVED_SHA`[\s\S]*`PUBLISH_HEAD`/i);
  assert.match(pr, /standalone[\s\S]*current `HEAD`[\s\S]*`PUBLISH_HEAD`/i);
  assert.match(pr, /remote branch tip[\s\S]*`PUBLISH_HEAD`[\s\S]*`headRefOid`[\s\S]*`PUBLISH_HEAD`/i);
});

test('implementation task isolation is lazy-loaded from one internal reference', () => {
  const implement = read('skills/implement/SKILL.md');
  const isolationPath = path.join(ROOT, 'skills/implement/task-isolation.md');
  const agents = read('AGENTS.md');

  assert.equal(fs.existsSync(isolationPath), true);
  const isolation = fs.readFileSync(isolationPath, 'utf8');
  assert.match(implement, /only when[\s\S]*task isolation[\s\S]*read[\s\S]*task-isolation\.md/i);
  assert.doesNotMatch(implement, /`EXPECTED_HEAD`|model tier|wrong-checkout commit/i);
  assert.match(isolation, /git rev-parse --show-toplevel/);
  assert.match(isolation, /git rev-parse --git-dir/);
  assert.match(isolation, /immediately before dispatch[\s\S]*`EXPECTED_HEAD`/i);
  assert.match(isolation, /compare[\s\S]*HEAD[\s\S]*`EXPECTED_HEAD`/i);
  assert.match(isolation, /checkout identity[\s\S]*mismatch[\s\S]*stop/i);
  assert.match(isolation, /wrong-checkout commit[\s\S]*user direction/i);
  assert.doesNotMatch(isolation, /starting commit for any subagent identity check/i);
  assert.doesNotMatch(agents, /cherry-pick[\s\S]*git reset/i);
  assert.match(agents, /wrong checkout[\s\S]*report[\s\S]*user direction/i);
});

test('failed bug attempts are neutralized before another hypothesis', () => {
  const implement = read('skills/implement/SKILL.md');

  assert.match(implement, /`ATTEMPT_BASE`[\s\S]*failed root-cause correction[\s\S]*revert commit/i);
  assert.match(implement, /never reset, rebase, or amend/i);
  assert.match(implement, /clean worktree[\s\S]*systematic-debugging/i);
});

test('systematic debugging keeps diagnosis mutation-free', () => {
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const tracing = read('skills/systematic-debugging/root-cause-tracing.md');

  assert.match(debugging, /smallest non-mutating observation/i);
  assert.match(debugging, /retry[\s\S]*bug-fix brief[\s\S]*do not implement it here/i);
  assert.doesNotMatch(debugging, /test it with the \*smallest\*\s*change/i);
  assert.doesNotMatch(debugging, /codesign --sign/i);
  assert.doesNotMatch(tracing, /console\.error/);
});

test('project-memory candidates use available routes and source-aware evidence', () => {
  const memory = read('skills/llm-md-revise/SKILL.md');
  const placement = read('skills/llm-md-revise/references/placement-decision.md');

  for (const text of [memory, placement]) {
    assert.doesNotMatch(text, /claude-md-improver/i);
  }
  assert.match(memory, /Evidence source:[\s\S]*user[\s\S]*diff[\s\S]*external/i);
  assert.match(memory, /diff[\s\S]*path[\s\S]*durable/i);
  assert.doesNotMatch(memory, /systematic-debugging`? Phase 4 verified/i);
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

test('optional revision and canonical docs stay aligned', () => {
  const readme = read('README.md');
  const claude = read('CLAUDE.md');
  const examples = read('skills/llm-md-revise/references/examples.md');

  assert.match(readme, /IMPL -- "durable candidates" --> LMR/);
  assert.match(readme, /IMPL -- "no candidates" --> REVIEW/);
  assert.equal(claude.trim(), '@AGENTS.md');
  assert.match(examples, /Four calibration scenarios/);
  assert.equal([...examples.matchAll(/^## \d+\./gm)].length, 4);
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

test('managed reviews preserve the caller-pinned commit range', () => {
  const implement = read('skills/implement/SKILL.md');
  const review = read('skills/requesting-code-review/SKILL.md');

  assert.match(
    implement,
    /immutable\s+`BASE_SHA` as `FROM_SHA`[\s\S]*current `HEAD` as `TO_SHA`/i,
  );
  assert.match(
    review,
    /never recompute a caller-supplied range/i,
  );
  assert.match(
    review,
    /current `HEAD == TO_SHA`/i,
  );
});

test('workflow starts with the whole change and bounds later delta reviews', () => {
  const plans = read('skills/writing-plans/SKILL.md');
  const implement = read('skills/implement/SKILL.md');
  const review = read('skills/requesting-code-review/SKILL.md');

  assert.doesNotMatch(plans, /whole-branch|delta review|correction review/i);
  assert.match(implement, /initial range covers the settled branch/i);
  assert.match(implement, /later ranges cover only committed corrections/i);
  assert.match(implement, /at most two correction review turns/i);
  assert.match(review, /initial[\s\S]*`BASE_SHA`[\s\S]*`FROM_SHA`/i);
  assert.match(review, /incremental[\s\S]*`LAST_REVIEWED_SHA`[\s\S]*`FROM_SHA`/i);
});

test('review reports expose only two decision fields', () => {
  const implement = read('skills/implement/SKILL.md');
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');

  for (const text of [implement, review, template]) {
    assert.match(text, /Review complete:/i);
    assert.match(text, /Blocking findings:/i);
    assert.doesNotMatch(
      text,
      /Gate status|impl-fix|plan-escalate|invalid-package|mutation-detected|coverage-incomplete|finding-not-verifiable|scope-expanded|malformed-report/i,
    );
  }
  assert.match(template, /Review complete:[^\n]*yes[^\n]*no/i);
  assert.match(template, /Blocking findings:[^\n]*none[^\n]*finding list/i);
});

test('default implementation and review contract stays compact', () => {
  const defaultFiles = [
    'skills/implement/SKILL.md',
    'skills/requesting-code-review/SKILL.md',
    'skills/requesting-code-review/code-reviewer.md',
  ];
  const lines = defaultFiles.reduce(
    (total, file) => total + read(file).split(/\r?\n/).length,
    0,
  );
  assert.ok(lines <= 350, `default contract is ${lines} lines; expected at most 350`);
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
