# Adopting the shared handbook

The shared Go reference expresses a chosen architecture. The project handbook
expresses how that architecture applies to one actual codebase. Setup must make
that translation explicit and reviewable; copying a directory of generic essays
or translating Go syntax is not sufficient.

## 1. Discovery record

Start with the target project's canonical instructions and accepted architecture
records. Inspect build manifests, module boundaries, framework entrypoints,
representative HTTP/background paths, persistence code, generated-code markers,
error conventions, and test commands. Use available language intelligence for
symbol relationships. Read actual code before describing the stack.

Capture enough facts to ground the profile:

| Area | Facts to establish |
| --- | --- |
| Structure | Language/module roots, entrypoints, routes, DTOs, application/domain/ports/adapters, generated code, existing handbook |
| Behavior | Existing public request/response/error contracts, use cases, invariants, identity/tenancy, atomicity and external effects |
| Constraints | Database/ORM, async model, transaction semantics, deployment and migration constraints, existing exceptions |
| Evidence | Commands available, tests actually present, executable representative slice, inaccessible runtime or unresolved decisions |

Do not infer a mature architecture from package names alone. A package named
`domain` may contain ORM entities; a repository named `Repository` may use an
unrelated root database client inside a supposed transaction. Describe the
observed mismatch separately from the desired rule. Do not claim compliance just
because the generated guide now says the right thing.

Do not collect secrets. Configuration names and public example files can establish
required settings without reading credential-bearing files. Do not modify
user-scope agent instructions or other repositories.

### Choose delivery before authoring

Architecture and delivery are separate decisions. Changing where guidance lives
must not change the agreed application layout, language, framework, or public
contract. Resolve delivery before writing guidance, native rules, or pointers.
Read-only discovery and showing candidate plans are allowed before selection.

Ask **how the project should store and load its guidance**, using the runtime's
native question interface when available:

| Mode | Proposed structure | Loading tradeoff |
| --- | --- | --- |
| Claude Code native rules | Substantive rules and examples in `.claude/rules/` | Native Claude loading; detailed matching rules consume context when activated; other tools are not automatically integrated |
| Shared handbook plus reader wiring | One project-owned handbook and thin tool-specific reading instructions | Reusable across selected tools; ordinary documents are not automatically loaded |

For shared-handbook mode, ask which readers to connect: **Claude Code, Codex,
OMP**, with multiple selections allowed. Ask this dependent question only when
needed; Claude-native mode already identifies Claude Code. Accept no wiring only
when the user explicitly requests handbook-only output. Never infer target tools
from the current session or interpret missing targets as permission to skip them.

Explain the choices in the user's language. Project facts can support a
recommendation, not an unasked selection. A mode/reader combination explicitly
requested by the user or already approved for the project does not need to be
asked again. The mere existence of files is not proof of that approval.

Claude-native mode does not also promise Codex or OMP loading. If the user asks
for additional readers, ask whether to switch to shared-handbook mode rather than
silently copying rules into multiple authoritative locations. For an unfamiliar
reader, establish its actual instruction mechanism before promising a bridge.

Summarize the selected mode, readers, concrete output paths, always-loaded versus
path-scoped versus explicitly fetched material, and shared-entrypoint effects.
Use the project's existing approval policy, not a new general design gate.
On refresh, preserve that accepted choice; a mode/reader migration needs a new
explicit decision. Selection alone is not evidence that files are installed or
that any runtime loaded them.

## 2. Reference-to-project profile

For each architectural responsibility, identify the canonical Go path, the actual
target path, its target-language construct, and the disposition. Use concrete
names, not `path/to/service` in the accepted artifact.

For a new Go project, preserve the selected layer-first baseline:

- Composition in `cmd/api`; domain in `internal/core/domain`.
- Input contracts in `internal/core/port/in`; output contracts in
  `internal/core/port/out`; domain-specific use cases in
  `internal/core/service/usecase/<domain>`.
- Actual reused application stages in `service/shared/<capability>`; real
  composite workflows in `service/orchestration/<workflow>`. No sibling
  use-case/service calls, orchestration-to-use-case calls, or empty packages.
- HTTP routes, handlers, middleware, and DTO mapping under
  `internal/adapter/in/http`.
- Storage under `internal/adapter/out/persistence/<actual-engine>/`, with
  read-only `provider`, write `repository`, reusable `db` mechanics and
  adapter-owned `dao` schema/generated/mapping code. The default engine is
  PostgreSQL; an existing MySQL/SQLite choice is an explicit adaptation.

Adopt [coding conventions](go/coding-conventions.md) alongside structure: entity
pointer/plural-collection contracts, small value-type exceptions, named inputs
at five total boundary parameters including context (receiver excluded), explicit
dependency roles, naming, declaration spacing and golangci-lint-only tooling.
Do not interpret missing enforcement as permission to omit the rule or claim a
passing linter enforces it.

For an existing project, a mismatch is not permission for an automatic source-code
migration. Classify it:

1. **Equivalent naming:** different names preserve the same dependency boundary.
   Record the mapping; use the project's accepted names in generated examples.
2. **Established exception:** the project deliberately chose a different boundary
   for a documented reason. Preserve it and record its scope.
3. **Unapproved architectural departure:** a dependency or layout contradicts the
   chosen baseline without an accepted reason. Show the conflict and ask about
   adoption or migration; do not silently rewrite the application.
4. **Unknown behavior:** file inspection cannot establish a policy or framework
   guarantee. Ask the precise settling question or verify the actual API.

Keep API compatibility separate from internal layout. A move to cleaner handlers
does not authorize changing JSON fields, numeric identifiers, pagination,
authentication, error codes, or side-effect semantics.

### Language adaptation is semantic

A target-language profile must explain at least these conversions:

- Go interfaces → the target's explicit interface/protocol/abstract boundary,
  without exporting ORM or transport models into core.
- Go `context.Context` → request cancellation, task lifetime, deadline and
  transaction context in that framework. An async keyword is not cancellation.
- Go error wrapping → typed errors/exceptions and retained causes, with stable
  safe public mapping at the adapter boundary.
- Transaction callback → a scoped context passed to existing repositories and
  providers, which resolve one real target-ORM transaction/session internally.
  Use the target framework's supported request/task-local equivalent when needed;
  never mutate singleton adapter fields or assume opening a session binds all I/O.
- DTO/domain/record mapping → explicit transformations and validation ownership,
  including lazy ORM state, serialization, and hydration constraints.
- Composition → dependency lifetime and transaction/request scope supported by
  the target framework; no assumption that singleton injection is always safe.

Do not add a parallel Go-style package convention to another language without
showing how the project will use it. Conversely, do not erase the user's chosen
boundaries because a framework encourages active-record models or route-level
business logic. Surface that architectural decision.

## 3. Decide applicability before materializing patterns

Assess every shared chapter, including production topics missing from the PoC.
Use an adoption ledger with explicit scope and rationale:

- **Adopted:** a required project rule with concrete paths and examples.
- **Deferred:** relevant, but blocked by a named decision or intentionally later
  behavior. Record the trigger for revisiting it and do not claim compliance.
- **Not applicable:** the application has no corresponding guarantee or mechanism;
  state why. This is not permission to ignore a newly introduced risk later.
- **Open:** the code and accepted requirements cannot determine the policy.

Examples:

A CRUD service with one insert does not need an event broker. It still needs a
unique constraint for a concurrent uniqueness invariant. Creating two rows with
an all-or-nothing promise requires both writes to use the same transaction now,
even if the service is called a PoC. Sending a webhook reliably after a commit introduces
an outbox/equivalent decision; it must not be described as solved by an inline
HTTP call. A service without tenants should not acquire a fictional tenant
model, but adding tenant-owned resources reopens authorization and data scoping.
Reuse `WithinTransaction(ctx, func(txCtx context.Context) error)` and call the
existing repositories/providers with `txCtx`; do not introduce callback repository
bundles or per-operation `WithX`/`XTx`/UoW contracts. Keep owner/tenant checks and
lock ordering in the workflow, not separate execution contracts merely because
creation has no existing owner to lock. Do not wrap a single atomic statement
solely to satisfy a pattern; retain its constraints and concurrency requirements.

Do not turn every optional section into a library dependency or future-proofing
layer. The handbook should make a mechanism available when needed, not force
its premature implementation.

### Go tooling output and execution scope

For Go adoption/refresh, include a concrete project-owned golangci-lint plan:
compatible fixed official binary version, ignored local binary location, actual
module-root `.golangci.yml`, existing Makefile/task-runner commands and existing
CI job. Merge current quality configuration instead of installing a competing
one. Follow the [coding chapter](go/coding-conventions.md) for configuration,
checksum/version verification and limitations; do not add gofumpt, standalone
duplicate linters or an unrequested custom analyzer.

Show these non-handbook files and installation actions with the proposed output
paths before executing them. An approved setup scope can include local tooling;
handbook-only, no-install and no-CI-edit constraints must remain effective.
Document the exact deferred step when execution is outside scope; do not ask
again when the user's explicit scope already resolves it. A handbook approval
does not itself authorize application source moves, global installation,
application `go.mod` changes, broad formatting or `--fix`.

## 4. Output contract

Write the selected delivery plan, not a fixed directory template. Use existing
accepted locations when compatible with that plan. Do not silently migrate
them. Keep durable guidance out of ignored plans/specs directories and do not
force-add ignored artifacts.

**Claude Code native rules**

- Use `.claude/rules/architecture.md` as a concise common entrypoint for the
  approved architecture, path map, delivery decision, and topic reading map.
- Put substantive layer guidance and examples in focused native rule files,
  such as `.claude/rules/domain.md`, `http.md`, and `persistence.md`. Resolve
  actual names in the output plan; this is not a mandatory file count.
- Rules without `paths` frontmatter load at startup. Scope layer-specific
  rules with `paths` patterns derived from the project's actual code paths.
  Scoped rules activate when matching files are read, written, or edited;
  do not rely on them alone for rules needed before those actions.
- Do not make the entire encyclopedia unconditional or discard detailed
  examples to meet an arbitrary rule-file length. Explain context cost and
  keep globally necessary constraints in the common rule.
- Do not also create a `docs/guidelines` mirror or an extra root pointer unless
  the selected plan needs it. No other reader integration is implied.

**Shared handbook plus reader wiring**

- Use the accepted handbook location. If none exists, propose
  `docs/guidelines/index.md` and adjacent pages **only after this mode is chosen**.
- Keep one authoritative body of guidance. Native reader files contain only the
  reading contract and applicable topic references, not independent copies.
- Add wiring only for selected readers, using the mechanisms below. Without an
  explicit reader/no-wiring decision, stop before creating the output files.

The selected entrypoint, whether a native common rule or a handbook index, must state:

- The approved architecture and stack profile, exact responsibility-to-path map,
  and the local handbook's authority relative to canonical project instructions.
- The selected delivery mode and readers, actual output and wiring paths, loading
  conditions, shared-entrypoint effects, and proposed/approved/verified status.
- The adopted/deferred/not-applicable/open ledger, local exceptions and reasons,
  and the distinction between an accepted rule and implemented application state.
- A task-to-chapter reading map and entrypoints for planning, implementation,
  review, and later setup refreshes.
- Verification actually exercised and precise limits. Keep historical command
  output out of normative rules when it would become stale.

A complete handbook normally has architecture/layers, coding conventions and
quality tooling, domain, data/transactions, reliability/events, security/operations,
and testing/evolution pages. It may merge or split files to match the project.
The organization is not a hardcoded file count. It must not silently omit
relevant behavior because one page is long.

### Required depth of an adopted section

For every substantial adopted rule, provide:

1. The exact rule and the condition under which it applies.
2. Why violating it breaks a boundary or consumer-visible guarantee.
3. Actual file paths and the layer that owns the decision.
4. Correct target-language code, including the important failure path.
5. A plausible wrong implementation and its specific failure.
6. Verification of behavior, boundaries, and errors. Identify any real runtime
   needed to prove the claim.
7. Related decisions and the point at which this rule must be revisited.

The index may be short. The substantive pages must not be reduced to generic
phrases such as "follow SOLID", "use repositories", "handle errors", or "add
transactions". Do not add repeated boilerplate merely to make them longer.

Include a complete representative vertical slice: route → handler and DTO mapping
→ inbound command/interface → application service → domain → outbound interface
→ concrete adapter and mapping → composition, with success and negative behavior.
When the project does not use HTTP, use its real entry adapter instead.
For Go, place inbound `*Command` inputs in `core/port/in/command`; keep
interfaces, Query and result types in `core/port/in`. Show imports flowing from
the parent port and consumers to `command`, never back to the parent or a service.
Migrate every command caller without compatibility aliases; retain transport DTOs
and outbound-specific inputs at their existing boundaries.

The slice must read naturally from top to bottom, with business steps at a
consistent level of abstraction. Apply [behavior ownership](go/behavior-ownership.md):
show an actual compound decision, collection calculation, and representation
conversion before and after assigning each to a named type/package/API and
direct behavioral check. Include read models and application commands/results,
not only entity constructors. If a behavior is absent, state that rather than
inventing it. Pure business rules belong in domain; DTOs and handwritten DAO
mappers own representation behavior, not use-case execution. Services retain
sequencing, scoped I/O and transactions. Private service helpers, trivial
forwarders, or \"thin service\" slogans alone do not satisfy this contract.

Do not leave placeholders or `TODO` code in an accepted example. A scoped fragment
is fine when its surrounding types and assumptions are explicit; label it as a
fragment, not a runnable application. If a framework API is unknown, verify it or
state the blocked example instead of publishing guessed code as a standard.

## 5. Reader wiring and canonical authority

Preserve the project's single canonical instruction surface and existing thin
imports. Do not create both an authoritative `CLAUDE.md` and an authoritative
`AGENTS.md` with independently maintained copies. Follow its instruction-update
and human-approval policy; in a harness-flow project, existing instruction-file
revisions use `harness-flow:llm-md-revise`.

In Claude-native mode, the selected native rules are the loading surface.
Do not create a separate shared handbook or duplicate its authority by default.
In shared-handbook mode, choose a reliable surface for each selected reader:

| Selected reader | Reading-contract surface | Boundary |
| --- | --- | --- |
| Claude Code | Existing accepted `CLAUDE.md` surface or a thin `.claude/rules/architecture.md` bridge | Preserve existing imports; use `paths` for narrower bridges when appropriate |
| Codex | The project's accepted `AGENTS.md` instruction chain | Verify the chain for the actual working directory; do not invent automatic loading of ordinary docs |
| OMP | The canonical project instructions actually supplied/loaded by OMP, commonly `AGENTS.md` | Inspect the established surface; do not invent a new config path or change global settings |

Reuse a shared instruction entrypoint when selected tools already share it.
One pointer can serve Codex and OMP; do not create competing copies. If changing
that entrypoint also affects an unselected tool, disclose the effect in the plan
and obtain the applicable approval. Reader selection defines intended support,
not an access-control guarantee. Do not promise isolation that a shared file
cannot provide. Leave unselected tool-specific instruction files untouched.

For shared-handbook mode, propose a small pointer whose meaning is:

> Before planning, implementing, or reviewing a change, read the project handbook
> entrypoint and the chapters selected by its task map. Follow the adopted
> responsibility/path map and conditional rules. Carry relevant constraints into
> the plan, implementation acceptance checks, and independent review briefs. If a
> requirement conflicts with an adopted rule, surface the conflict instead of
> silently inventing a new structure.

Replace "project handbook entrypoint" with the actual path in the adopted
project. The pointer is a loading contract, not a second copy of the entire
handbook. A link alone does not prove that an agent loaded the destination;
exercise a representative planning/direct-implementation/review task to verify
retrieval where that integration is claimed.

Verify loading in every selected runtime using its available instruction
diagnostics or an actual read trace. For path-scoped rules/bridges, check a
matching file and a nonmatching file; common architecture rules must be available
when planning before any path-specific trigger. Confirm that a shared-handbook
reader retrieves the entrypoint and relevant chapter rather than only its link.
A supplied-text model exercise can check interpretation, not native startup
loading. If a runtime is unavailable, finish independent authoring but mark that
reader integration unverified and do not claim it is active.

Instructions are not mechanical enforcement. If the project requires a hard
import or dependency boundary, adopt its existing architecture test/linter/CI
mechanism or approve a suitable one. Do not claim that a Markdown rule blocks
an invalid import at runtime.

## 6. First adoption and refresh behavior

For first adoption, do not reopen an already approved profile. Ask only unresolved
choices that change the artifact. If writing new docs is authorized and there is
no material conflict, write them and present the result under the project's
review policy. Existing instruction changes still follow their approval rules.

For a refresh:

1. Read the current project index, chapters, exceptions, and examples first.
2. Compare the current handbook with the shared guidance and any reliable
   available history; do not require source citations or revision records.
3. Separately identify shared-guidance changes, existing local decisions, and
   human edits. A "generated" heading is not permission to discard the file.
4. Propose narrow merged changes. Preserve current examples and deliberate
   exceptions unless the user selects a replacement.
5. Ask about genuine conflicts, not every unchanged sentence. Do not silently
   resolve an API/architecture/business-policy conflict in favor of the latest
   shared text.
6. Verify changed examples and record only changes actually adopted.

Without a previous snapshot, you cannot reliably distinguish a template line
from a human edit. Treat current content as locally maintained; show proposed
changes without inventing an automatic three-way merge. Do not build a new
configuration, templating, or schema-versioning engine for this workflow.

A documentation refresh never implicitly authorizes application refactors,
framework replacement, generated-code regeneration, repository-wide formatting,
or deletion of obsolete-looking user files.

## 7. Validation and truthful completion

Use the target's actual commands. At minimum, exercise a representative adopted
slice and a negative path, inspect boundary mapping and imports, and verify
all referenced files/links. For unfamiliar target-framework behavior, run a
small real example instead of trusting translated syntax.

For authorized Go tooling, verify the actual pinned binary and configuration,
exercise accepted four-total and rejected five-total parameter declarations and
the Command-based correction, and check local/CI version consistency. Inspect
entity/value and collection shapes, role names, peer-call direction and function
spacing separately when the runner does not cover them. Report a planned tool,
installed binary, executed check and active reader as distinct states.

Claims require matching evidence:

- Domain tests prove selected invariants, not database constraints.
- Mocked services do not prove transaction atomicity, isolation, or driver
  cancellation. Use the actual database/ORM for those claims.
- A local SQLite teaching example does not prove Ent/PostgreSQL behavior.
- Broker acknowledgments do not prove a consumer's inbox/business transaction.
- A successful build does not prove authorization, tenant isolation, recovery,
  graceful shutdown, or externally visible HTTP behavior.

If the environment cannot execute a required claim, name the unavailable runtime
and the exact unverified guarantee. Complete independent pages, but do not mark
that claim verified or activation complete. Resolve information reachable through
files/tools before asking the user.

The completion report names the project entrypoint, adopted profile/deviations,
actual verification, remaining decisions, and whether the canonical reading
contract was activated. Setup ends there; application feature implementation,
code review, and project-memory revision remain their own workflows.
