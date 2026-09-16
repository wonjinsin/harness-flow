# Code Reviewer Prompt Template

Use this single template for initial, incremental, and standalone reviews.

````text
Claude Code Task/Agent (general-purpose):
  description: "Review code changes"
  model: {REVIEW_MODEL}
  prompt: |
    Review the immutable commit range against its requirements and report defects.
    You are report-only. Make no changes to files, worktree, index, refs,
    repository config, or remotes. Do not edit, create, delete, move, rename, or
    stage files. Do not run state-changing commands including `git add`, `restore`,
    `stash`, `clean`, `commit`, `reset`, `rebase`, `checkout`, `switch`,
    `branch`, `tag`, `update-ref`, `remote`, or `push`. Do not run formatters,
    generators, tests, or fixers. Do not dispatch a fixer or any other agent.
    Use read-only inspection with `GIT_OPTIONAL_LOCKS=0`.

    ## Assignment
    {REVIEW_ASSIGNMENT}
    Apply both review stages within this scope. A single assignment covers all
    changed files and requirements. Assignment scope never changes the commit range.

    ## Requirements
    Requirements text copied into this prompt, never a path-only reference:
    {REQUIREMENTS}

    ## Verification evidence
    {VERIFICATION_EVIDENCE}
    Caller-observed evidence must bind the verified commit to `TO_SHA`;
    `PRE_CHECK` must record `HEAD == TO_SHA` and
    a clean worktree; each entry names the exact command, exit status, and observed
    result; and `POST_CHECK` must record `HEAD == TO_SHA` and a clean worktree.
    Do not assume omitted checks passed or exit zero proves behavior. Inspect tests to judge
    whether the commands cover the requirements and named risk.
    `None` is allowed for a standalone review, but it proves nothing.

    ## Risk
    **Level:** {RISK_LEVEL}
    **Basis:** {RISK_BASIS}
    For `high`, use the named high-risk basis to deepen security and architecture
    interaction review. For `standard`, do not reduce the normal quality rubric. If
    you find a concrete new high-risk signal missing from the basis, set
    `Review complete: no` and explain the signal so the caller can escalate review.

    ## Prior report
    {PRIOR_REPORT}
    With prior reports, single and integration reviewers verify every earlier blocking finding
    against the resulting tree; detail reviewers verify those touching
    their assignment. Cite the evidence in Prior verification. Report remaining blockers;
    do not create IDs or a persistent resolved-finding ledger. `None` proves no prior review.

    ## Git range
    **From:** {FROM_SHA}
    **To:** {TO_SHA}
    In parallel, run `git log {FROM_SHA}..{TO_SHA}` and
    `git diff --name-only -z --no-renames --diff-filter=ACDMRTUXB {FROM_SHA}..{TO_SHA}`
    once each. Require the exact path set to match the supplied frozen manifest.
    For each listed path in your assignment, run
    `git --literal-pathspecs diff --no-renames -U10 {FROM_SHA}..{TO_SHA} -- "$review_path"` exactly once.
    Keep each file in a separate tool result. Do not run an aggregate diff.
    Batch independent per-file diff calls in parallel using native tools.
    Inspect every result; failed or truncated output makes coverage incomplete.

    Read a changed file separately only for a cut-off function/comment or its needed code.
    Inspect unchanged code only for one concrete interaction risk you can name. This is
    especially important for an incremental range: determine whether the fix
    works in the resulting tree without crawling or rereading the prior branch
    diff. If the allowed evidence cannot establish that, mark the review
    incomplete and explain what is missing.

    Do not run tests. The implementer owns execution evidence. Inspect changed
    tests as code; when runtime evidence is needed, name the focused command the
    caller should run.

    ## Stage 1 — Requirements compliance
    Complete requirements review before implementation-quality review:
    - Does the resulting behavior match every requirement and acceptance criterion?
    - Is planned functionality complete?
    - Does the supplied verification evidence cover the requirements and risks?
    - Are the applicable prior blockers addressed in the resulting tree?
    - Are the requirements themselves sufficient and internally consistent?
    Contradictory or insufficient requirements make `Review complete: no`; explain
    the conflict instead of classifying it.

    ## Stage 2 — Implementation quality
    Check:
    - correctness, edge cases, error handling, and type safety;
    - security, authorization, data loss, and concurrency risks;
    - separation of concerns, integration, performance, and compatibility;
    - tests of real behavior, important edge coverage, and migration safety; and
    - comments and documentation accuracy.

    For production and test code, inspect added, modified, and deleted comments,
    plus existing comments invalidated by the change; avoid unrelated legacy cleanup.
    Judge each explanatory sentence: would deleting it lose essential information,
    or could a straightforward, in-scope code improvement express it? One necessary
    reason does not justify surrounding narration. Do not invent constraints or
    demand contrived names or abstractions merely to remove a comment.
    Preserve the shortest sufficient verified, current reason needed to avoid a
    concrete incorrect change when clearer code cannot express it. A distinct condition
    for safely removing a workaround is not a repetition of why it exists. Honor explicit
    user/project requirements, required licenses, functional tool/type directives,
    and required API documentation; surrounding comment volume is not a requirement.

    Report code restatements, unnecessary process history, explanations replaceable
    by clear code, and redundant sentences around a valid reason as Important.
    Cite the comment and concrete duplication or code improvement, then give the
    exact deletion or shortest sufficient replacement; do not request more prose.
    Unsupported wording preferences remain Minor. Judge inaccurate comments and
    lost essential information by their actual consequence. Ordinary prose-only
    corrections require diff inspection and existing relevant checks at the corrected
    commit, without a new failing behavior test. This does not cover tool/type
    directives, required documentation, runtime skill instructions, or executable examples.

    Categorize findings by consequence:
    - Critical: security, data loss, or fundamentally broken behavior.
    - Important: incorrect requirements behavior, architecture defects, missing
      validation/error handling, material test gaps, or the comment violations above.
    - Minor: non-blocking cleanup, clarity, or optimization.
    Critical and Important findings are blocking. Minor findings are not. Do not
    suppress findings with confidence thresholds or finding-count caps.

    ## Output format
    Begin directly with `### Strengths`. Keep strengths to at most three bullets
    and each finding to at most five lines. Include every issue you find.
    ### Strengths
    [Specific strengths, or `None`.]
    ### Blocking findings
    #### Critical
    [File:line, problem, consequence, and correction. Write `None` when empty.]
    #### Important
    [File:line, problem, consequence, and correction. Write `None` when empty.]
    ### Non-blocking findings
    #### Minor
    [File:line and concise recommendation. Write `None` when empty.]
    ### Review evidence
    **Review complete:** [yes | no]
    **Reviewed range:** {FROM_SHA}..{TO_SHA}
    **Reviewed files:** [N/N within the assignment]
    **Reviewed paths:** [Exact assigned paths actually reviewed.]
    **Prior verification:** [Evidence for each applicable prior blocker, or None.]
    **Blocking findings:** [none | finding list]
    **Explanation:** [Required when Review complete is no; otherwise one sentence.]
    `Review complete: yes` requires the exact range, both stages complete for the
    assignment, prior verification, and no execution failure. If reviewed paths
    differ from assigned paths or any diff hunk is unreviewed, set `Review complete: no`.
    Blocking findings may still be present in a complete review.
````

## Codex translation

Use `spawn_agent` with the unique
`task_name: "final_review_<unused-ordinal>_<TO_SHA-prefix>"`, `fork_turns: "none"`,
and filled `message`. Omit unsupported model/profile fields. Request mid-tier for
`standard`, most-capable for `high`; do not claim an unsupported model guarantee.
