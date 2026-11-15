# Adopting the shared handbook

The shared reference is authoring material. The project handbook records how its
rules apply to actual code, subordinate to canonical instructions and accepted
local decisions. Neither copied essays nor translated Go syntax establish adoption.

## 1. Discovery record

Read canonical instructions, accepted architecture records, manifests, module
boundaries and representative HTTP/background/persistence slices. Inspect generated
code markers, errors and actual commands; use available language intelligence for
symbol relationships. Record:

| Area | Required facts |
| --- | --- |
| Structure | Language/framework, module roots, entrypoints, routes, DTO/core/port/adapter ownership, generated code and existing guidance |
| Behavior | Public request/response/error contracts, invariants, identity/tenancy, transactions and external effects |
| Constraints | Database/ORM, async and resource lifetimes, deployment/migration limits and accepted exceptions |
| Evidence | Available commands, implemented tests, representative executable slice, unavailable runtimes and unresolved policies |

Describe current implementation gaps separately from desired rules. Package names,
a generated guide or a passing build do not prove architectural compliance. Inspect
public configuration examples, not secrets; do not modify user-scope instructions
or other repositories.

### Choose delivery before authoring

Resolve storage/loading before writing guidance, rules or pointers. Discovery and
candidate plans may proceed first. Use the native question interface when available,
explain choices in the user's language, and keep delivery separate from architecture:

| Mode | Output | Loading tradeoff |
| --- | --- | --- |
| Claude Code native rules | Substantive rules/examples in `.claude/rules/` | Claude-native startup/path loading; activated detail consumes context; no other reader integration implied |
| Shared handbook plus reader wiring | One authoritative handbook with thin selected-reader pointers | Reusable across tools; ordinary documents do not load automatically |

For shared mode, ask which readers to connect: **Claude Code, Codex, OMP**,
allowing multiple selections. Offer the full set, not just tools with existing
files. No wiring requires explicit handbook-only selection. Reuse approved
choices; never infer them from the active session or file presence. Ask this
dependent question only when needed. Claude-native plus additional readers needs
an explicit mode decision, not duplicated authorities. Verify unfamiliar readers.

Before writing, show mode, readers, concrete paths, always-loaded/path-scoped/fetched
content and shared-entrypoint effects under the project's approval policy. Preserve
that arrangement on refresh; migration needs a new decision. Approval is not proof
of installation or loading, and does not authorize application changes.

## 2. Reference-to-project profile

Map each responsibility to its canonical path, actual target path, owning type/API,
target-language mechanism, disposition and verification. Use concrete names in the
accepted artifact. Read [architecture](go/architecture.md) for the Go tree and
call restrictions and [coding conventions](go/coding-conventions.md) for command
ownership, signatures, entity/value shapes and quality tooling. Missing lint
coverage does not waive a rule.

Classify existing mismatches before changing guidance:

| Mismatch | Action |
| --- | --- |
| Equivalent naming | Record the mapping and use accepted project names. |
| Established exception | Preserve its boundary, rationale and scope. |
| Unapproved architectural departure | Present the conflict and ask which rule governs; do not migrate source silently. |
| Unknown behavior | Inspect the actual API or ask the precise unresolved policy question. |

Layout cleanup does not authorize changing JSON fields, identifiers, pagination,
authentication, errors or side effects. Preserve current contracts pending decisions.

### Language adaptation is semantic

Explain these conversions rather than imposing parallel Go-style packages:

| Go concept | Target contract |
| --- | --- |
| Interfaces/ports | Native interface/protocol boundary; no ORM or transport models in core |
| `context.Context` | Actual cancellation, deadline, task lifetime and transaction scope; `async` alone is not cancellation |
| Wrapped errors | Typed categories/exceptions retaining private causes, with stable safe adapter-owned public mapping |
| Transaction callback | Existing repositories/providers resolve one real ORM transaction/session through a propagated scope or verified request/task-local equivalent; never swap singleton fields |
| DTO/domain/record mapping | Explicit validation/conversion ownership, hydration, loaded-state and serialization semantics without hidden lazy I/O |
| Composition | Supported request/transaction/dependency lifetimes, not assumed singleton safety |

Opening a session does not bind all I/O. Verify framework APIs; surface conflicts
with active-record or route-owned business logic instead of erasing chosen boundaries.

## 3. Decide applicability before materializing patterns

Assess every chapter, including production risks absent from a PoC. Record scope
and rationale for each disposition:

- **Adopted:** required project rule with concrete paths/examples.
- **Deferred:** relevant but intentionally later or blocked; name the trigger or
  decision and do not claim compliance.
- **Not applicable:** no corresponding guarantee/mechanism; state why and revisit
  when risk changes.
- **Open:** code and accepted requirements do not establish the policy.

One-insert CRUD needs constraints, not a broker. An all-or-nothing multi-write needs
one transaction now; reliable post-commit publication needs an outbox/equivalent,
not merely an inline HTTP call. Do not invent tenants for a tenantless project.
For atomic work read [the transaction contract](go/data-and-transactions.md#2-application-owned-atomicity-without-a-root-client-escape),
including existing-adapter binding, workflow-owned locks and the single-statement
exception. Optional mechanisms are not mandatory dependencies or future-proofing layers.

### Go tooling output and execution scope

Include a concrete project-local golangci-lint plan: compatible fixed official
version, ignored binary location, actual module-root `.golangci.yml`, existing
runner commands and CI job. Merge existing quality configuration. Apply
[coding conventions](go/coding-conventions.md) for checksum/version/config checks
and limitations; no gofumpt, duplicate standalone linters or unrequested analyzer.

Show non-handbook paths/actions before execution. Respect handbook-only, no-install
and no-CI-edit scope; document deferred steps without re-asking settled choices.
Handbook approval does not permit source moves, global installs, application
`go.mod` changes, broad formatting or `--fix`.

## 4. Output contract

Use accepted locations compatible with the selected plan. Do not silently move
guidance, place durable rules in ignored plans/specs, or force-add ignored artifacts.

**Claude Code native rules:** use `.claude/rules/architecture.md` as the concise
common profile/path/reading-map entrypoint. Put detailed layer rules/examples in
focused files, such as `domain.md`, `http.md` and `persistence.md`, with actual
names resolved in the plan. Rules without `paths` load at startup; scoped rules
activate on matching reads/writes/edits. Derive patterns from real paths and retain
planning-critical rules in the common surface before a scoped trigger. Do not load
the encyclopedia unconditionally or discard detail to meet a length quota. No shared
handbook mirror, extra root pointer or additional reader is implied.

**Shared handbook:** preserve its accepted location. Only after shared mode is
selected, if none exists, propose `docs/guidelines/index.md` and adjacent pages.
Reader files contain approved reading instructions, not independent copies. Stop
before output creation if reader/no-wiring selection remains unresolved.

Either entrypoint must record:

- Approved profile, exact responsibility/path map and authority beneath canonical
  instructions; local exceptions and reasons.
- Mode/readers, output/wiring paths, loading conditions, shared-entrypoint effects
  and proposed/approved/verified status.
- Adopted/deferred/not-applicable/open ledger, separating rules from implemented state.
- Task-to-chapter retrieval for planning, implementation, review and setup refresh.
- Exercised verification and limits; do not fossilize historical logs into rules.

Cover architecture/layers, coding/tooling, domain, data/transactions, reliability,
security/operations and testing/evolution as applicable. Merge/split pages for the
project, not a mandatory file count; a long page is not a reason to omit a guarantee.

### Required depth of an adopted section

For each substantial rule give its applicability, boundary rationale, actual owner
and paths, correct target-language code with failure paths, a plausible violation
and its consequence, behavioral/boundary/error checks with required runtimes, and
related decisions/revisit triggers. Keep the index short, not the handbook's substance;
"follow SOLID" or "add transactions" is insufficient. Repeated boilerplate adds no depth.

Include one complete slice: real entry adapter → handler/DTO → inbound contract →
service/domain → outbound contract → concrete adapter/mapping → composition, with
success and negative behavior. For Go command placement/imports/caller migration,
apply [coding conventions §2](go/coding-conventions.md#2-five-total-boundary-parameters-require-an-input-struct).

Apply [behavior ownership](go/behavior-ownership.md): trace an actual compound
decision, collection calculation and representation conversion to named owners,
show before/after calls and direct checks. Include read models and application
inputs/results, not only constructors; state absent behavior rather than inventing
it. Domain owns business rules, DTO/handwritten DAO owns representation, and services
retain sequencing, scoped I/O and transactions. Private service helpers, trivial
forwarders and "thin service" slogans do not satisfy the contract.

Scoped fragments must name their surrounding types/assumptions and not masquerade
as runnable apps. No placeholders or `TODO` in accepted examples. Verify unfamiliar
APIs or name the blocked example rather than publish guessed code.

## 5. Reader wiring and canonical authority

Preserve one canonical instruction surface and existing thin imports; do not create
independently authoritative `CLAUDE.md` and `AGENTS.md` copies. Follow local update
and human-approval policy, including `harness-flow:llm-md-revise` where established.
Claude-native mode uses its selected rules directly. Shared mode uses:

| Reader | Reading-contract surface | Constraint |
| --- | --- | --- |
| Claude Code | Accepted `CLAUDE.md` or thin `.claude/rules/architecture.md` bridge | Preserve imports; scope narrower bridges with actual `paths` where appropriate |
| Codex | Accepted `AGENTS.md` chain | Verify the chain for the actual working directory |
| OMP | Actually supplied canonical instructions, commonly `AGENTS.md` | Do not invent config paths or modify global settings |

Reuse shared entrypoints. Disclose effects on unselected readers and obtain applicable
approval; selection is not access-control isolation. Leave unselected tool-specific
files untouched. A shared pointer should require:

> Before planning, implementing or reviewing, read the project handbook entrypoint
> and task-selected chapters. Follow the adopted path map and conditional rules;
> carry them into plans, acceptance checks and independent review briefs. Surface
> conflicts instead of silently inventing another architecture.

Replace the generic entrypoint with its real path. Verify each selected runtime
through instruction diagnostics or actual read traces, including representative
planning/direct-implementation/review retrieval. Check matching and nonmatching
paths for scoped bridges, common rules before path triggers, and retrieval of the
handbook/chapter rather than only its link. Supplied-text evaluation is not native
loading evidence. An unavailable runtime stays unverified, not active; finish
independent authoring. Hard boundaries require existing/approved architecture
checks or CI, not a claim that Markdown prevents invalid imports.

## 6. First adoption and refresh behavior

First adoption asks only unresolved artifact-changing choices, not renewed approval
of an accepted profile. Write authorized, conflict-free guidance under project
review policy; instruction changes retain their approval requirements.

For refresh, read current index/chapters/examples/exceptions first. Compare shared
changes with available history, distinguishing local decisions and human edits;
revision records or source citations are not prerequisites. Propose narrow merged
changes preserving examples/exceptions unless the user selects replacements. Ask
about genuine API/architecture/policy conflicts, not unchanged prose. Verify changed
examples and record only actually adopted changes.

Without a previous snapshot, treat all current content as locally maintained;
"generated" is not overwrite permission. Do not invent a three-way merge, template
engine or schema-versioning system. Refresh alone authorizes no app refactor,
framework replacement, regeneration, broad formatting or deletion of user files.

## 7. Validation and truthful completion

Use actual target commands to exercise a representative slice and negative path;
check mappings/imports and links. Run a small real target-framework example for
unfamiliar semantics. For authorized Go tooling, verify pinned binary/config and
local/CI consistency, accepted four-total/rejected five-total declarations and
Command correction. Inspect typing, role names, peer-call direction and function
spacing where lint is silent.

Match each claim to evidence: domain tests do not prove database constraints;
service mocks do not prove rollback/isolation/driver cancellation; SQLite does not
prove Ent/PostgreSQL; broker acknowledgment does not prove consumer commit; a build
does not prove authorization, isolation, recovery, shutdown or public HTTP behavior.

Resolve tool/file-reachable facts first. Name unavailable runtimes and exact blocked
guarantees, finish independent pages, and never mark unexecuted claims or full
activation verified. Report entrypoint, adopted profile/deviations, actual checks,
remaining decisions and reading-contract status. Planned tooling, installed binary,
executed checks and active readers are distinct states. Setup ends here; application
implementation, review and project-memory revision remain separate workflows.
