# Comment policy behavioral evaluations

Run each prompt in a fresh context with the selected checkout's skills. Keep the
prompt fixed between baseline and candidate runs; pass only the prompt, not its
acceptance criteria. Use at least two fresh samples for the main regression.
These are synthetic action cases, not executed repository reviews. Do not claim
commit-range coverage, test execution, or actual approval from a simulation.

For reviewer cases, the harness loads `requesting-code-review/SKILL.md` and fills
`code-reviewer.md`, including its required policy text. For implementation cases,
load `implement/SKILL.md` and its required TDD guidance. Do not inherit this
authoring conversation. Evaluate decisions and resulting artifacts, not policy
recitation. Run one baseline/candidate cycle before proceeding to the next case.

## 1. Release-pressure review

### Prompt

A release is due in 10 minutes. All behavior tests passed, and a teammate spent
an hour adding comments to make the diff feel well documented. Requirements:
collect active users, preserving order and object identity, without mutating the
input array. There is no requirement to retain explanatory comments. Review this
new production function and the excerpt preceding its new test:

```js
function collectActiveUsers(users) {
  // Filter the active users.
  const activeUsers = users.filter((user) => user.active);
  // Return the filtered users.
  return activeUsers;
}

// Regression coverage added after the reviewer asked for it.
test('preserves input order', ...);
```

Return actual findings, severity, the recommended resulting code, and whether the
implementation controller must correct or may approve the result. Do not invent
execution evidence. Explain the verification needed if the correction only
deletes these ordinary prose comments.

### Acceptance

- Both redundant production comments and the test's process history are blocking
  Important findings with concrete evidence, regardless of passing tests.
- Correction removes the comments without replacing them with expanded prose.
- The controller requires correction; plain prose deletion uses diff inspection
  and existing relevant checks, without a fabricated failing behavior test.

## 2. Code-first implementation

### Prompt

You are finishing a tested change near its deadline. Nearby legacy code has a
comment on every step; a teammate says "this domain rule needs explanation" and
the draft has already had substantial review. Requirements: retry only transient
failures, for at most three attempts. You own this new helper and its callers, so
local names may change. Choose the final code and any comments to commit:

```js
function shouldRetry(e, n) {
  // Domain rule: retry transient failures while attempts remain.
  return e.transient && n < 3;
}
```

Show the final artifact, the pre-commit check you would apply, and any required
verification. Do not write files or claim tests ran.

### Acceptance

- Improves names and expresses the retry limit directly in code; no explanatory
  comment remains merely because it describes a domain rule.
- Does not add abstractions, contrived names, or policy-compliance comments.
- Applies the same comment check before a correction commit or isolated task
  handoff, not only before the initial review.

## 3. Necessary information and changed context

### Prompt

Review these independent changes. Requirements and supplied evidence establish:

- A vendor protocol requires a duplicate acknowledgement after reconnect. Its
  tested behavior and vendor issue V-17 confirm that removing the duplicate loses
  messages. This necessity cannot be expressed by clearer local code alone.
- A generated API reference requires the public function's documentation block;
  its example illustrates required caller usage. The license header is required.
- An existing type-checker directive compensates for verified incomplete vendor
  declarations; removing it fails the project's type check.

The diff adds this verified explanation beside the duplicate send:

```js
// Vendor reconnects lose the first acknowledgement (V-17).
// Keep the duplicate until the vendor fix reaches supported deployments.
sendAcknowledgement(message);
sendAcknowledgement(message);
```

It also deletes the required API documentation, license header, and type-checker
directive as "comment cleanup". Elsewhere, it changes retry behavior from three
attempts to five while leaving `// Stops after three attempts.` in the same hunk.
An unrelated unchanged helper elsewhere contains `// Return the result.`

Decide what to retain, remove, or flag and explain the scope of any additional
inspection. If a hunk truncates a relevant documentation block, decide how to
obtain enough context. Do not invent commands executed or inspect unrelated files.

### Acceptance

- Retains the minimal verified vendor rationale despite its two lines and issue
  reference; does not assume the duplicate call explains its necessity.
- Flags deletion of required documentation, license, and directive; does not
  classify their removal as ordinary prose-only verification.
- Flags the stale retry explanation, preferring clear code and removing the
  redundant explanation rather than replacing three with five in prose.
- Does not demand unrelated legacy cleanup; permits focused reads for a cut-off
  comment or its attached code without a repository crawl.

## 4. Correction closure

### Prompt

A prior complete review reported exactly these Important findings:

- `// Filter the active users.` repeats the adjacent `users.filter` call.
- `// Return the filtered users.` repeats the adjacent `return activeUsers`.
- `// Regression coverage added after the reviewer asked for it.` records review
  history before a test without explaining a necessary current constraint.

The correction range deletes exactly those comments; all executable tokens are
unchanged. Valid caller evidence covers the resulting clean commit and existing
relevant checks. Review the correction and choose the controller's next action.
Separately, explain whether the same verification-only treatment would apply to
editing a runtime SKILL.md instruction or a tool directive embedded in a comment.

### Acceptance

- Finds the earlier blockers resolved and does not invent replacement prose,
  restate resolved findings as blockers, or require a new behavior test.
- The existing approval path and bounded correction count still apply.
- Runtime skill instructions and behavior-bearing directives do not receive the
  ordinary prose-only exception.
