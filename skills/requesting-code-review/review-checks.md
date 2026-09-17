# Review Check Fragments

Copy the complete `detail and single` section into REVIEW_CHECKS for `detail_a`,
`detail_b`, or `single`; copy the complete `integration` section for that role.
Preserve every check and the complete comment policy. These are prompt fragments,
not independent skills. Review assignments narrow detailed file ownership, never
permission to inspect needed cross-group or unchanged context.

## detail and single

Own exactly: requirements, correctness, edge-cases, error-handling, types,
prior-blockers, security, authorization, data-loss, concurrency, integration,
compatibility, architecture, performance, verification, tests, migration,
comments, documentation, maintainability.

### Stage 1 — Requirements compliance

Verify every requirement and acceptance criterion relevant to the assignment,
complete functionality, and internally consistent, sufficient requirements.
Contradictory or insufficient requirements make the review incomplete; explain
the conflict. With prior reports, single verifies every earlier blocking finding
against the resulting tree; detail reviewers verify relevant earlier blockers.
Copy exact earlier finding text and concrete evidence into priorVerification;
report any remaining blockers. None means no earlier blockers, not absent test
evidence. Details may report only a unique subset of supplied prior finding texts;
single must report the complete set.

### Stage 2 — Implementation quality

For every assigned path and hunk, inspect correctness, boundary inputs, error
handling, type safety, security, authorization, data loss, concurrency, integration,
compatibility, architecture, performance, tests, migration, documentation, and
maintainability. Read every part of each nondeleted assigned file's resulting
content. Trace required values through callers, defaults, reassignments, and
failure paths; matching variable names do not establish matching values.
Use the named high-risk basis to deepen security and architecture interaction
review. Inspect needed callers and cross-group context. Another reviewer's
assignment does not remove any of these checks from your assigned files.
Check executable examples and complete handoff examples, including pseudocode and
structured dispatch, against their targets' required input and output contracts;
look for omitted arguments and incomplete handoffs.

Caller-observed evidence must bind the verified commit to `TO_SHA`;
`PRE_CHECK` must record `HEAD == TO_SHA` and a clean worktree; each entry names the
exact command, exit status, and observed result; and `POST_CHECK` must record
`HEAD == TO_SHA` and a clean worktree. Do not assume omitted checks passed or exit
zero proves behavior. Inspect tests to judge whether the commands cover the
requirements and named risk. `None` is allowed for a standalone review, but it
proves nothing.

For production and test code, inspect added, modified, and deleted comments,
plus existing comments invalidated by the change; avoid unrelated legacy cleanup.
Inspect the whole eligible comment block, including unchanged sentences around an edited sentence.
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
A replacement must preserve every necessary verified reason and constraint, not
just remove the redundant sentence.
Unsupported wording preferences remain Minor. Judge inaccurate comments and
lost essential information by their actual consequence. Ordinary prose-only
corrections require diff inspection and existing relevant checks at the corrected
commit, without a new failing behavior test. This does not cover tool/type
directives, required documentation, runtime skill instructions, or executable examples.

## integration

Own exactly: requirements, prior-blockers, verification, security, authorization,
data-loss, concurrency, integration, compatibility, architecture, performance,
migration.

### Stage 1 — Requirements compliance

Independently verify every requirement and acceptance criterion, complete
functionality, and internally consistent, sufficient requirements across the
whole change. Contradictory or insufficient requirements make the review
incomplete. With prior reports, verify every earlier blocking finding against
the resulting tree. Copy every exact earlier finding text and concrete evidence
into priorVerification exactly once; report remaining blockers. None means no
earlier blockers, not absent test evidence.

### Stage 2 — Implementation quality

Inspect every changed file and every diff hunk directly. Trace concrete cross-file
behavior, public interfaces, authorization boundaries, cryptography, secret
handling, transactions, migrations, destructive operations, and operational
performance. Use the named high-risk basis to deepen security and architecture
interaction review. Read all needed resulting-file and unchanged context, including
cross-group dependencies. Check required inputs and outputs at complete handoffs,
including executable examples, pseudocode, and structured dispatch. Do not wait
for detail reports before forming your conclusions. Report defects outside your
assigned checks when noticed.

Caller-observed evidence must bind the verified commit to `TO_SHA`;
`PRE_CHECK` must record `HEAD == TO_SHA` and a clean worktree; each entry names the
exact command, exit status, and observed result; and `POST_CHECK` must record
`HEAD == TO_SHA` and a clean worktree. Do not assume omitted checks passed or exit
zero proves behavior. Inspect tests to judge whether the commands cover the
requirements and named risk. `None` is allowed for a standalone review, but it
proves nothing.
