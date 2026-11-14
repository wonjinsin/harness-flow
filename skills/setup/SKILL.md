---
name: setup
description: Use when a project needs detailed architecture and coding guidelines installed or refreshed from the shared Go blueprint, including adaptation to another language or an existing layout.
---

# Setup

Install a detailed, project-owned architecture handbook and, for Go adoption,
plan project-local golangci-lint tooling. This is an explicitly invoked
setup/adoption skill, not a prerequisite added to every coding request. It does
not implement application features or authorize source migrations. Tool/config/CI
changes require the approved output scope; handbook-only requests stay
documentation-only. Do not commit or push as part of setup.

The default Go profile uses clean/hexagonal layer boundaries and the prescribed
folder structure. Dependency versions are not architectural requirements. Treat
PoC shortcuts as implementation gaps, not best practices. Read
[the reference index](references/index.md), then
[the adoption procedure](references/adoption.md).

## 1. Discover before deciding

Read the target project's supplied canonical instructions, applicable scoped
standards, existing architecture docs, source tree, manifests, and representative
vertical slices. Inspect actual framework APIs and test/build commands rather
than guessing them from a language name. Do not read secrets or user-scope files.

Identify:

- Language, framework, module roots, composition, routes, DTOs, core, ports,
  persistence, generated code, and tests.
- Existing public contracts, deployment constraints, domain invariants, identity
  and tenancy policy, transaction boundaries, and adopted project exceptions.
- Existing guidance locations, their loading mechanisms, and any explicitly
  approved delivery mode or reader targets. Their presence informs the choices;
  it is not permission to select a delivery mode or migrate files silently.
- Whether this is first adoption, a partial adoption, or a refresh of locally
  edited guidance. Treat existing content as human-maintained unless its history
  establishes otherwise.

Use the reference index to select every relevant chapter. Do not read only the
folder diagram and improvise the rest. In particular, a write spanning repositories
requires the data chapter, external effects require reliability, and protected
resources require security. A complete initial handbook considers all chapters,
but materializes only the project's adopted rules and useful examples.

## 2. Let the user choose storage and readers

Before writing guidance or instruction files, resolve the delivery choices in
`references/adoption.md`. Present two distinct modes with their output paths and
loading tradeoffs:

- **Claude Code native rules:** substantive guidance in `.claude/rules/`, with
  common rules loaded at startup and layer rules scoped to actual target paths.
- **Shared handbook plus reader wiring:** one project-owned handbook, with thin
  reading instructions for the tools the user selects.

For shared-handbook mode, ask which tools should read it: Claude Code, Codex,
OMP, or multiple selected tools. An explicit handbook-only request is also valid;
missing reader information is not an implicit no-wiring decision.

Ask only unresolved delivery decisions. A user's explicit request or an already
approved delivery arrangement settles them; do not ask again merely to repeat
that approval. Do not infer intended readers from the active session or choose
`docs/guidelines` just because no guidance exists. Discovery and candidate plans
may precede selection; writing waits for it. If the user requests additional
readers with Claude-native mode, settle the resulting mode change first.

Show the resolved mode, readers, concrete affected paths, loading behavior, and
any shared-entrypoint side effects before writing under the project's review
policy. Keep delivery choices separate from the agreed application architecture.

## 3. Map the reference to the project

Read `references/go/architecture.md`, `references/go/layers.md`,
[coding conventions](references/go/coding-conventions.md), and
[behavior ownership](references/go/behavior-ownership.md). Use Go as the canonical
teaching language, not as a requirement to replace another stack.

Produce a concrete architecture map: source responsibility → actual target path
and owning type/API → target language/framework mechanism → applicable rule →
verification. Keep the canonical Go layout when starting a Go project without
contrary adopted constraints.

The Go baseline separates persistence by actual database engine, then read-only
`provider`, mutation `repository`, reusable `db` mechanics, and adapter-owned DAO
code. Domain-specific use cases live under `service/usecase`, reusable application
stages under `service/shared`, and real composite workflows under
`service/orchestration`. Enforce the architecture chapter's peer-call bans; do not
create empty areas or move pure domain rules into shared services.

Carry the coding chapter's concrete contracts into adopted examples: entity
pointers and defined plural pointer collections, value semantics for small value
objects, named inputs at five total boundary parameters including `ctx` (receiver
excluded), explicit Provider/Repo/UoW dependency roles, Google-based Go naming,
and blank lines between function declarations. Use golangci-lint only as the
added Go quality runner, not gofumpt or a silently added custom analyzer. State
what the selected checks do not enforce; Markdown and passing lint are not proof
of every contract.

For an existing layout or another language, distinguish a harmless naming
adaptation from an architectural departure. Do not silently rename modules,
change API/error semantics, replace the ORM, or move interfaces merely because a
framework tutorial uses a different convention. Describe meaningful conflicts
and ask which rule should govern; preserve the current contract pending that
answer. Never infer business policies, aggregate boundaries, tenant permissions,
or an external provider's idempotency guarantees from the sample User feature.

Ask only questions that materially change the guidelines. Batch related choices
when the runtime supports it. Do not ask for facts available in files. An approved
profile does not require another round of general design approval.

## 4. Author the handbook, not an outline

Follow `references/adoption.md` for the full output and review contract. Write
project-specific, detailed pages with:

- Exact folders, allowed dependencies, responsibilities, and ownership.
- Correct target-language examples, realistic wrong examples, and the correction.
- Relevant failure paths, boundary conditions, and executable verification.
- Explicit applicability: required baseline, required under a named condition,
  optional, or a project decision. Distinguish a required rule from a mechanism
  that is not yet implemented in the application.
- Concrete project-local golangci-lint version/install, config and local/CI paths
  for Go, with the authorized execution scope and any explicit no-install
  constraint. Preserve existing quality configuration instead of replacing it.

Keep the entry index short; do not shorten the substantive handbook into slogans.
Include at least one complete vertical slice across the project's actual layers.
Make top-to-bottom, book-like readability an explicit baseline: orchestration
tells the operation's story; named behavior on domain values/collections,
application inputs/results, DTOs, and handwritten persistence mappers owns the
details appropriate to each. Trace a real compound condition, collection
calculation, and representation conversion to their owners, showing before/after
calls and direct behavioral checks. Calling primitive validators while composing
the rule inline is still a gap. Do not satisfy this by moving business rules into
DTOs/DAOs, private service helpers, or trivial forwarding layers.

Adapt cancellation, error/cause propagation, ORM transactions, async execution,
and mapping semantics, not only syntax and filenames. Validate unfamiliar APIs
against the actual installed framework or official documentation. Do not invent
compilable-looking code around unknown APIs.

Cover the relevant production extensions even if the current application is a
PoC: transactions and concurrency, data constraints and migrations, deadlines and
resource lifetimes, idempotency and irreversible effects, domain boundaries,
security and tenancy, safe errors/observability, operations and testing. State
which extensions are unnecessary now and which unanswered decisions block their
examples. Do not mandate queues, caches, microservices, full DDD, or outboxes for
ordinary CRUD.

Use [the executable Go example](examples/go/README.md) for an explicitly scoped
SQL-backed illustration. It uses SQLite and standard-library HTTP instead of the
canonical Chi/Ent/PostgreSQL profile; it is not proof that a target ORM or
production deployment behaves identically.

## 5. Adopt without overwriting local authority

The shared reference is authoring material. The project's accepted handbook is
operational authority, subordinate to its canonical instructions and explicit
current requirements. Record approved deviations and their reasons in its index.

Follow the selected delivery plan and show a reviewable diff. Use the project's
instruction-update and approval policy; use `harness-flow:llm-md-revise` when that
is its existing workflow. Claude-native mode adopts native rules directly;
shared-handbook mode adds only approved reader-specific pointers, not copies of
the whole handbook. Preserve existing canonical instructions and thin imports.
Do not add redundant root pointers, unselected tool adapters, or changes to other
workflow skills. Do not claim activation before required approvals and loading
verification complete.

On refresh, read the current handbook first. Separate reference changes from
local decisions; preserve human edits and accepted exceptions. If no previous
snapshot is available, do not guess which prose can be regenerated. Propose the
specific merged changes and obtain decisions for conflicts. No automatic
reference-update overwrite, source-code migration, or generated-file deletion.

## 6. Verify the actual target

Exercise one representative adopted slice in the target language/framework and
its negative path. Check links, paths, dependency direction, imports, documented
commands, public error behavior, and any transaction claim against the real
adapter. A generic Go example cannot validate a Python transaction scope or an
Ent/PostgreSQL isolation guarantee.

Exercise the extracted decision or transformation directly with supplied values
and a negative/boundary case, without booting its orchestrator or infrastructure.
Then read the resulting orchestration top to bottom to verify its operation
sequence is clear without reconstructing helper internals.

For authorized Go tooling, verify the installed binary/config and exercise the
four/five-total-parameter boundary and Command-based correction. Check entity
pointer/collection contracts, role names, peer-call direction and function
spacing separately where built-in lint is silent. Do not claim complete spacing
enforcement, install tools into a documentation-only target, or run broad fixes
as part of a guidance refresh.

Verify loading for each selected reader as well as the example behavior. Check
actual loaded instructions or read traces, including matching/nonmatching paths
for scoped rules. Merely naming a file in a proposal is not loading evidence.
If the selected runtime is unavailable, report that integration as unverified.
If a runtime or a domain decision is unavailable, finish the independent pages,
name the precise blocked claim, and do not present its example as verified or
mark the handbook fully activated. Do not fill gaps with made-up invariants,
placeholder implementations, or claims that a mock proves database atomicity.

## Finish

Report the handbook entrypoint, adopted profile and exceptions, verification
actually exercised, remaining decisions if any, and whether its reading contract
is active. Report tooling as planned, installed or verified separately. Keep any
reading requirements in the target project's approved instructions; do not modify
other workflow skills to install the handbook.
