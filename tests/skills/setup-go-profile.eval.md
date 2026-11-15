# Setup Go profile evaluations

Use independent fresh consumers with `skills/setup/SKILL.md` and on-demand
references. These are artifact evaluations, not source-text assertions. Keep the
same prompts and criteria for the pre-edit and candidate versions. Consumers
must not read this rubric or earlier outputs. No application edits, installation,
builds, tests, linters, formatters, commits, or reader-activation claims are
allowed while producing their passages.

## A. New catalog handbook

### Consumer prompt

Simulated approved shared-handbook adoption, handbook-only delivery, Go
Chi/Ent/PostgreSQL module `example.com/catalog`. No existing files or reader
wiring changes needed. Read the setup skill and relevant references on demand.
Produce a compact but concrete handbook passage: exact source tree, inbound
create/list/update contracts, outbound data access contracts, service dependency
fields and composition, one five-parameter application operation including ctx,
domain Category plus collection and small Money value, and Go quality-tool
install/local/CI workflow. A CreateCatalog operation changes Catalog and audit
atomically; category lookup is shared with another operation. Show ownership and
allowed/forbidden service dependencies. Return the actual passage and code
fragments, not a self-evaluation, within 1500 words.

### Acceptance

- Persistence is under the real engine (`postgres`), with read-only `provider`,
  write `repository`, reusable `db` mechanics, and adapter-owned DAO/mapping.
  Do not create unused alternative engines or disguise CRUD under `db`.
- Domain use cases live under `service/usecase/<domain>`; reusable application
  stages under cohesive `service/shared/<capability>`; real multi-domain work
  under `service/orchestration/<workflow>`. Neither sibling use cases nor shared
  services nor orchestrations call peers; orchestration does not call use cases.
  Pure eligibility/calculation remains in domain, not shared.
- The application owns one transaction through
  `WithinTransaction(ctx, func(txCtx context.Context) error)`. It calls existing
  injected providers/repositories with txCtx, not a callback repository bundle.
  Persistence privately resolves the same SQL/Ent handle for every participating
  read/write; no outer-context/root-client escape or driver types in core.
- Reuse the common execution mechanism. Owner locking/tenant checks remain
  explicit workflow operations; creation without an owner lock does not require
  a separate runner. Do not require UoW types or per-operation WithX/XTx wrappers.
  A single atomic statement needs no pattern-only wrapper.
- Shared adapters never change fields per transaction. No context scope means
  ordinary base-client I/O; nested, expired or foreign-database scopes must not
  silently fall back or open an independent transaction. db owns lifecycle and
  handle resolution, without importing providers/repositories.
- Entity inputs/results are pointers, their collection is a defined plural slice
  of entity pointers, and small Money remains a value. No pointer to a slice,
  nil entity elements, or successful missing `(nil, nil)` result.
- A total of five parameters including ctx, excluding the receiver, requires a
  named Command/Query; ctx stays first and outside that struct. Four total is
  allowed. No JSON tags or transport DTOs at core boundaries.
- Inbound `*Command` types live in `core/port/in/command`; interfaces, Query and
  result types remain in `core/port/in`. The parent and consumers import the
  child package, never the reverse. Preserve fields and omitted/false semantics,
  migrate callers directly without aliases, and keep transport/outbound inputs
  at their existing boundaries.
- Dependencies expose provider, repository and transaction roles; a UoW suffix
  is not required. Names use Go MixedCaps/initialisms and specific operation
  vocabulary. Do not suffix every method with the dependency's role.
- The quality runner is `golangci-lint`, no gofumpt adoption. Use the project's
  Go-compatible pinned official binary/config in local and CI paths, not a
  floating global installation or application-module tooling dependency.
  `revive.argument-limit` maximum 4 detects declared functions of five or more
  parameters; its actual coverage limits are stated. A blank line between every
  handwritten function remains required, without claiming built-in formatters
  enforce all such spacing. No custom analyzer is silently added.
- Retain safe error taxonomy/cause preservation/transport mapping, existing
  delivery choices, and honest separation of proposed rules from installed code.

## B. Existing inventory refresh

### Consumer prompt

Simulated approved Claude-native Go handbook refresh, rules in
`.claude/rules/backend` and existing scope patterns preserved. Module
`example.com/inventory` uses Chi, `database/sql` PostgreSQL and existing
cause-retaining core errors + HTTP mapper. Current Service covers inventory,
shipment and reservations in one type. Persistence Repository combines reads,
writes, pool creation and transaction callbacks.
`ReserveStock(ctx, actorID, sku, quantity, requestID)` updates stock and records
reservation atomically. Small Money, Quantity value types; Stock and Reservation
entities. Several workflows reuse authorization I/O and pure stock eligibility.
Team proposes one service calling another service for reuse, root-client reads
from inside a transaction, a catch-all common package, and returning SQL errors
directly to HTTP bodies to save work. User authorizes guidance refresh only, no
app refactor, no tooling/global install. Produce replacement handbook passage
with concrete target package paths and API signatures, transaction/error
ownership, naming, quality-tool policy, and applicability decisions. Preserve
public behavior and explain installed-vs-adopted state. Under 1500 words;
artifacts not self-evaluation.

### Acceptance

Apply A's architecture, pointer, input-count and naming criteria. Additionally:

- Turn the five-parameter operation into ctx + ReserveStockCommand, retaining
  trusted actor, SKU, quantity, request ID, and their semantics.
- Reuse authorization I/O through shared application capability; pure stock
  eligibility remains in domain. Reject peer service calls rather than hiding
  them behind interfaces, forwarding facades, or aliases.
- Keep existing error categories/cause/public status policy, not a second error
  system or raw database responses. Unknown internal errors can propagate to the
  existing safe fallback; not every error needs a new business category.
- Show target rules separately from current implementation gaps; do not migrate
  the app, rename current files, install tools, or change native rule scoping.
  Plan pinned project-local golangci-lint setup but respect the explicit no-install
  authorization. Do not infer that file presence proves reader activation.

## C. Fresh confirmation variation

Reserve this case until A/B pass and the changed guidance has been simplified.
If used to repair the candidate, record it as development evidence and reserve
another variation instead.

### Consumer prompt

For a Go/MySQL returns project, write the handbook fragment for
`ApproveReturn(ctx, actorID, returnID, reason)` and
`ScheduleRefund(ctx, actorID, returnID, amount, currency)`. The first operation
loads an owned Return and updates it. The second also stores an accounting entry
atomically, with reuse of an existing shared authorization capability. Return
and Refund are entities; Amount is a small immutable value. Neither use-case
chaining nor extra forwarding layers are wanted. There is no new provider API,
queue or second database. The user approved shared-handbook refresh only and
explicitly excluded additional formatting tools. Show target paths, signatures,
composition/transaction ownership, function spacing, error and quality-tool
policy. Read setup references on demand; no edits or checks. Under 1000 words.

### Acceptance

- Use only `persistence/mysql/{provider,repository,db}` and necessary DAO paths,
  not PostgreSQL-specific SQL or unused engine adapters.
- Four-total-parameter ApproveReturn may stay scalar. Five-total ScheduleRefund
  uses a Command without ctx; approved business semantics remain unchanged.
- Pointer entities/plural pointer collections, value Amount, explicit dependency
  roles, real shared/orchestration responsibilities and no peer calls.
- Same scoped handle for return/refund/accounting work, business rules in domain,
  preserved error taxonomy and safe transport mapping.
- Golangci-lint only, pinned local/CI plan and honest spacing/coverage limits; no
  tool installation or application mutation implied by handbook approval.

## Observed evidence

Baseline source was the pre-edit setup skill and references. A/B each used one
fresh consumer with the prompts above and this rubric fixed before guidance
changes. These are observed artifact decisions, not a reliability estimate.

- **Baseline A:** emitted flat `service/catalog_service.go` and
  `persistence/{db.go,catalog_repo.go,...}` paths; `type Categories []Category`;
  value Category input/results; and a scalar CreateCatalog with five parameters
  including ctx. Its statement was "CreateCatalog deliberately demonstrates five
  parameters including ctx." It installed standalone Staticcheck/govulncheck
  rather than proposing the selected golangci-lint runner. These failed the new
  placement, entity collection, threshold and tooling criteria.
- **Baseline B:** kept flat `service/*_service.go` and `persistence/db.go`, put
  authorization reuse in a flat service file, and combined transactional stock
  reads with writes in StockReservationWriter. It did propose ReserveStockCommand
  and retained same-transaction access, safe existing errors, native scoping and
  no-install restrictions. Those passing behaviors did not need repair.

- **Candidate A/B:** fresh consumers produced engine-scoped provider/repository/db
  placement, entity pointers and defined plural pointer collections, value Money
  and Quantity, ctx-inclusive Command conversion, explicit dependency roles,
  peer-call bans and transaction-scoped access. A reused a direct provider rather
  than adding a forwarding service; B placed actual authorization I/O under
  shared and pure eligibility in domain. Both selected golangci-lint only and
  retained scope, existing safe errors and honest enforcement limits.
- **Simplification:** removed the new coding chapter's final restatement of
  pointer/spacing/error review requirements; those requirements already had
  owners in earlier sections and the setup verification step. Independent final
  A/B consumers still applied the same contracts. A's shared lookup coordinated
  multiple category reads rather than forwarding one call; B retained explicit
  current-versus-target distinctions and no-install scope.
- **Fresh C:** an independent MySQL consumer used only the actual engine,
  preserved the four-total ApproveReturn signature and converted five-total
  ScheduleRefund to a Command. It kept Amount as a value, entities/collections as
  pointers, reused authorization without use-case chaining, and put the atomic
  refund/accounting operation in orchestration with one scoped handle. It
  retained existing errors, no-install scope and the golangci-only limitations.

Each stage used one fresh consumer per scenario. These observed artifacts
satisfied the declared profile criteria, not an estimated reliability rate or
proof of native automatic loading.

Executable verification was separate:

- The current shipped YAML was extracted verbatim and accepted by official
  golangci-lint 2.15.0 (built with Go 1.27.0), downloaded into an isolated temporary
  directory. Its archive SHA-256 matched the release metadata before extraction.
  Four-total arguments passed, five-total arguments produced revive's
  argument-limit diagnostic, and the Command correction passed. Adjacent
  functions were also accepted, directly demonstrating the documented spacing
  limitation rather than pretending it is an automatic gate.
- Exact current User entity/port/use-case fragments, with their documented
  imports, compiled and ran in an isolated module. Normalization, invalid input,
  pointer collection identity, invalid query bounds and empty/lookahead page
  behavior passed.
- An initial throwaway SQLite harness for the PostgreSQL reference failed:
  SQLite binds named $N placeholders by occurrence, not PostgreSQL numeric
  position. A focused SELECT/UPDATE observation established that mismatch.
  The reference SQL was not changed to accommodate the wrong engine.
- Exact SQL lifecycle, repository scope, domain and orchestration fragments then
  ran with the documented DDL against disposable PostgreSQL 17.11. A successful
  quantity-3 reservation left stock 7 and one reservation; a later duplicate
  insert rolled back its stock decrement. Insufficient stock, pre-dispatch
  cancellation and invalid domain input retained their expected errors.
- Running the same config against the teaching example exposed five unchecked
  lifecycle errors and three oversized response/test-helper signatures. The
  example now retains cleanup/serve causes, reuses its transaction lifecycle for
  schema initialization, and groups response/request/expected-count inputs.
  The unchanged config then reported zero issues, without suppressions or
  exclusions; the race suite and rebuilt-process walkthrough passed again.
- The migrated SQLite teaching example passed `CGO_ENABLED=1 go test -race ./...`.
  Its built process served health/create/get/duplicate/invalid/missing responses
  with statuses 200/201/200/409/400/404, retained one user and one audit after
  rejected requests, and exited successfully on SIGTERM.
- `node --test` passed all 216 repository tests with no failures or skips.
  Setup metadata/entry size and 146 relative Markdown links were valid.

The temporary harnesses, binary and database were removed after execution.
No ledger migration, installed-plugin update, global quality-tool install,
commit, publication, Ent/PostgreSQL generated-adapter execution or native
Claude/Codex/OMP reader activation was performed or claimed.

## Command-package separation evaluation

The focused consumer task supplied `SaveCategoryCommand` with `OwnerID`,
`CategoryID`, `Name`, `ParentID`, and `Archived *bool`, alongside
`ListCategoriesQuery`, `CategoryPage`, and `CatalogUseCase`. It asked for concrete
paths, signatures, dependency direction, and migration steps without changing
behavior or adding CQRS infrastructure.

- **Baseline:** the pre-edit coding chapter produced “Keep SaveCategoryCommand,
  ListCategoriesQuery, CategoryPage, and CatalogUseCase in core/port/in/catalog.go.”
  This failed the requested independent command-package ownership.
- **Candidate and final:** fresh consumers moved only the command to
  `core/port/in/command`, kept Query/result/interface ownership, preserved
  nil/false semantics, and migrated callers without aliases. The final run used
  both the setup entry and coding chapter after removing a redundant entry-level
  warning already covered by the chapter.
- **Fresh variation:** a worker/HTTP `UpdateRuleCommand` with `Enabled *bool` and
  `Version` rejected a parent-package alias, moving queries/results, and a
  `command → in` dependency. It retained optional-value and version semantics.
- **Executable evidence:** the migrated Go example passed `go test -race ./...`
  (three tested packages), and changed Go files passed `gofmt -l`. Its built
  process returned health/create/get/duplicate/invalid/unknown-field statuses
  200/201/200/409/400/400, persisted one user and one `audit_events` row, and
  shut down cleanly. An initial smoke query used the wrong audit table name;
  correcting the harness to the actual schema made the complete smoke pass.
  `node --test` passed all 216 tests.

These are focused consumer and local executable checks, not plugin installation
or native reader-activation evidence. Temporary binaries/databases were removed.

## Shared transaction execution evaluation

The focused prompt described category/rule operations with the same database,
tenant lock, isolation, atomicity boundary, and required provider/repository set.
It requested concrete contract/call shapes and a decision about per-operation
UoW/Tx/WithX types, while preserving independent single-statement writes.

- **Baseline:** the existing handbook already chose a shared runner for that
  matching-scope case. No behavioral failure is claimed. The authorized change
  makes sharing the explicit default and removes mandatory UoW naming and
  operation-specific teaching examples.
- **Candidate and final:** fresh consumers reused the common WithinTransaction
  contract, rejected redundant per-operation wrappers, preserved typed
  transaction-bound capabilities, and kept independent atomic statements direct.
  The final run followed removal of repeated split/naming detail from the coding
  chapter in favor of its link to the transaction chapter.
- **Fresh variation:** inventory operations shared a runner; billing with a
  different database and Serializable policy retained a distinct boundary.
  A single settings UPDATE needed no wrapper. The consumer rejected an injected
  root provider inside the callback, preserved error/cancellation/panic cleanup,
  and treated an uncertain commit as requiring reconciliation rather than proof
  of rollback or permission for blind replay.
- **Executable evidence:** the common Transactor/Transaction Go example passed
  `go test -race ./...` (three tested packages); changed Go files passed
  `gofmt -l`. A built server created/read a user and audit, then a temporary
  database trigger rejected the next audit insert. HTTP returned a generic 500
  and an independent connection confirmed no partial user or audit. Removing
  the trigger allowed the same create to succeed; duplicate/invalid requests
  returned 409/400, final row counts were 2/2, and shutdown succeeded.
  `node --test` passed all 216 tests.

The SQL/Ent reference examples were updated consistently, but this execution
used the SQLite teaching adapter, not a PostgreSQL/Ent runtime. No Ledger source,
installed plugin, native reader activation, commit, or publication was changed.

## Context-carried transaction adoption

### Consumer prompt

Adopt the supplied setup guidance for a Go service with injected categoryRepo
and ruleRepo. Saving a rule must insert a category then save the rule atomically;
ordinary independent reads also use those existing adapters. Account creation
has no owner row to lock; changes to an existing account must lock that owner
before other rows. Show the outbound transaction contract, service call, and
persistence binding design you would put in the handbook. Explain how the
account cases share or split execution and how single-statement writes work.
Include cancellation/rollback and concurrent-request behavior. Output concrete
Go fragments and concise rules, not a plan.

### Acceptance

- The port is `WithinTransaction(context.Context, func(context.Context) error) error`.
- Service callbacks call their existing injected repositories/providers with the
  callback context. No `OwnerTx`/`Transaction` repository bundle or new per-use-case
  runner substitutes for this calling convention.
- A private adapter-owned context key resolves one transaction for all
  participating reads/writes; an ordinary context uses the base client.
  No SQL/Ent handle crosses into core and no shared adapter fields change.
- Account creation and owner-locked updates share execution. Existing-account
  changes acquire the required owner lock before other dependent operations;
  creation does not pretend to lock a nonexistent row. Tenant checks remain.
- Callback failure, panic and cancellation attempt rollback; commit errors
  propagate, successful results wait for commit, and unknown outcomes are not
  claimed aborted. Nested, expired and foreign-database scopes cannot silently
  escape to a base connection or a new independent transaction.
- Independent atomic statements stay direct when no wider lock/consistency
  requirement applies. Do not add retries, outboxes or distributed atomicity.

### Observed baseline

One fresh consumer given the pre-edit setup skill and transaction chapter
produced `WithinTransaction(context.Context, func(Transaction) error) error`
with repository accessors. It explicitly said injected repositories “must not
be used inside the transaction callback.” This fails the first two criteria.
It preserved locking, cancellation and rollback concerns; those are not failures.

The real SQLite baseline regression
`TestRepositoryRemainsReusableAfterContextTransactionRollback` performed two
writes with one adapter, rolled back after the duplicate insert, then reused
that adapter for an ordinary write. It failed with:
`same repository cannot perform an ordinary write after rollback: insert user: sql: transaction has already been committed or rolled back`.
This exposes the old adapter's transaction-bound lifetime; the migrated case
must preserve rollback while using the same injected adapter inside and outside
the callback.

### Candidate, simplification, and fresh variation

- **Candidate: 1/1 passed.** With the same prompt and rubric, a fresh consumer
  produced the context callback, called the existing category/rule adapters with
  `txCtx`, and kept ordinary reads direct. Creation and owner-locked updates used
  one runner with explicit workflow locking. Private context binding, immutable
  adapters, scope rejection and lifecycle errors remained present.
- **Simplification: 1/1 passed.** Removed repeated bundle/lifetime prose from the
  transaction chapter's port explanation, retaining the entry rule and concrete
  binding implementation. A fresh consumer of the simplified guidance passed
  the unchanged case with the same call shape and boundary behavior.
- **Reserved variation: 1/1 passed.** The Ent inventory case decremented stock,
  inserted a reservation and read remaining availability through existing
  adapters with one `txCtx`. It left an independent read and guarded settings
  UPDATE direct, rejected nested execution and foreign billing-client binding,
  and prohibited retained contexts without inventing distributed transactions.
- **Evaluation boundary:** these were stateless consumers supplied the setup
  skill and transaction chapter, not native discovery/on-demand-loading tests.
  An initial JavaScript evaluation wait timed out and lost its handle; it was
  excluded from behavioral scoring. The successful baseline above used a fresh
  Python-hosted consumer.

### Executable evidence

- `go test -race ./...` passed all three tested packages in the runnable example,
  including the migrated failing-before regression, same-context reads,
  cancellation, panic/commit failures, expired/nested/foreign scopes and
  concurrent ordinary-call isolation.
- A built HTTP server returned health/create/read 200/201/200. A real SQLite
  trigger rejected the audit write; HTTP returned a safe 500 and an independent
  connection found no partial user/audit. Removing the trigger allowed the same
  create to return 201; duplicate/invalid requests returned 409/400. Final row
  counts were 2 users and 2 audits. SIGTERM exited cleanly.
- Extracted SQL and Ent chapter fragments compiled with the documented domain,
  ports and schemas against generated Ent v0.14.5. The generated Ent adapters
  executed on SQLite: commit/read-own-writes, duplicate-insert rollback, panic
  rollback, cancellation, expired scope and nested rejection passed. Exactly
  one reservation committed and stock decreased from 20 to 18.
- The temporary generator harness required a parent Go package and canonical
  macOS temporary-directory paths. An attempted PostgreSQL SQL-fragment smoke
  on SQLite was excluded: SQLite binds `$n` placeholders by first appearance,
  not PostgreSQL's numeric positions. No shipped SQL was changed to satisfy
  that incompatible harness. PostgreSQL SQL runtime/isolation remains unverified.
- `node --test` passed all 216 tests. All 148 local links in the touched
  documentation resolved, including anchors; setup metadata and its 225-line
  entry file were valid. Temporary binaries, databases, generated code and smoke
  programs were removed.

No Ledger source/rules, installed plugin cache, native reader activation,
commit, push or publication was changed. SQLite Ent execution does not establish
PostgreSQL constraint, locking, isolation or network-failure behavior.

## Entry/router diet, first pass — 2026-11-15

Frozen baseline: `44f37d791c06470183619bb0c3fb15bde136c96b`. The authorized goal
was smaller setup guidance with preserved outcomes, not new architecture rules.
Two parallel Standards/Spec reviews identified repeated entry/adoption/index
summaries as consolidation candidates. Technical chapters and the executable
example remained byte-identical to baseline; installation and commits were excluded.

### Comparison

Fresh independent consumers started from each version's `SKILL.md`, retrieving
references on demand without rubrics, history or earlier outputs. Inputs and
acceptance stayed fixed:

- Profile A/B above: new catalog adoption and protected inventory refresh.
- Ownership A/B in `setup-behavior-ownership.eval.md`: composed review assessment
  and representation/query ownership.
- The context-carried transaction prompt and acceptance above.
- Delivery boundary: an existing Go/Chi/Ent/PostgreSQL project has Claude/Codex
  entrypoints but no delivery approval. Produce the next response and proposed
  outputs. Require mode/loading tradeoffs and unresolved reader selection before
  writing; existing files must not imply consent.
- Semantic adaptation: approved handbook-only `docs/architecture` refresh for
  FastAPI/SQLAlchemy async, accepted feature layout/error-envelope exceptions,
  human edits without a previous snapshot, long-lived repositories, atomic
  Stock/Reservation writes followed by payment, no tenant/idempotency policy and
  no available project/reader runtime. Require preserved authority/scope, same
  transaction session without singleton mutation, cancellation and mapping/error
  ownership, external-effect uncertainty and precise unverified claims.

The seven baseline cases passed their artifact criteria. The first reduced
candidate failed one additional contract: its representation passage declared
`List(context.Context, string, int, int)`, called those four parameters five,
and incorrectly required an input struct. The failure was retained, not scored
away. Restoring the entry's short four/five-total cue produced two independent
correction samples without that miscount. One kept the four-argument scalar
signature; the other chose a permitted selection object without claiming the
threshold required it. Lower-count named inputs remain allowed for ambiguity.

After removing the index's repeated authoring instruction, all seven cases ran
again with fresh consumers. The final independent Spec review judged all seven
baseline/final pairs passing. The ownership output proposed a coordinated
entity-pointer cutover rather than retaining baseline's internal value shapes;
it preserved supplied assessment semantics and required complete caller migration.
This is artifact-level behavior preservation, not proof of an implemented migration.

A reserved SQLite-worker variation also passed: four-total `EnableRule` stayed
scalar; five-total `ChangeRule` used a Command preserving `Enabled *bool` and
expected version. It retained nil-versus-false, owner-before-rule/audit sequencing,
shared execution without an owner lock for creation, the independent-statement
exception, separate databases, scope rejection and honest durability limits.

Each baseline/candidate/final case used one fresh sample; the correction used
two. These are observed outcomes, not a reliability estimate or a guarantee of
identical wording. Final Standards and Spec reviews separately reported zero
patch-introduced findings.

### Execution and structural evidence

- Exact final-consumer fragments executed in standalone Go: `EnabledAfter`
  passed four nil/true/false transitions; `OptionalLabel` decoding/application
  conversion passed seven omitted/empty/nonempty/null/type-error cases.
- The unchanged teaching example passed `go test -race ./...` in three tested
  packages. Its built process returned health/create/get 200/201/200. A real
  SQLite trigger rejected audit insertion: HTTP returned safe 500 and independent
  queries retained one user/one audit. Removing the trigger allowed the same
  create (201); duplicate/invalid/missing requests returned 409/400/404. Final
  counts were two users/two audits; SIGTERM exited 0.
- `node --test`: 216 passed, zero failures/skips. All 168 setup-local Markdown
  links, including anchors, resolved; frontmatter remained valid.
- Runtime-guidance reduction: entry 225→109 lines, index 162→70, adoption 404→383;
  791→562 lines across those three files. The reduction removed 12,093 bytes;
  detailed technical chapters and executable examples were not shortened.

Temporary binaries, databases and fragment smoke programs were removed. No
installed-plugin update, global tooling, application migration, commit, push,
native Claude/Codex/OMP loading, or Ent/PostgreSQL deployment validation occurred.

## Whole-library diet — 2026-11-15

The follow-on scope includes every setup reference and the runnable example's
documentation, source and tests, not just entry/navigation. Freeze the first-pass
library as the whole-scope baseline; reuse its seven observed final artifacts.
Four additional baseline/candidate tasks exercise the remaining chapters:

- **Domain:** existing Go feature layout; active/released Reservation with one-time
  release no earlier than creation; Basket-owned mutable entries; signed-int64
  Money overflow; historical hydration without new identity/time/admission;
  undecided email policy and a separate Allocation bounded context.
- **Data:** Go/Ent/PostgreSQL stock decrement, reservation insert, expected-version
  aggregate update and remaining-stock read in one transaction; tenant-qualified
  SKU/foreign keys; duplicate rollback; SQL/Ent scope ownership/expiry; bounded
  pagination, stale-fill cache races and a rolling required-column migration.
- **Reliability:** command idempotency, outbox/inbox, key/fingerprint contention
  and replay; stale leases, publication crash windows, poison/order/schema/retention;
  ambiguous payments and bounded safe retries without invented compensation.
- **Security/operations:** trusted JWT versus untrusted tenant header, raw database
  errors and duplicate logging, webhook/URL input, SSRF, health/worker/migration
  lifecycles, scoped authorization, secrets and isolated recovery.

Each task requests concrete handbook fragments, not a self-assessment; no source
changes, commands, installs or native activation are authorized. Compare exact
paired prompts with fresh consumers starting from each frozen `SKILL.md` and
retrieving chapters on demand. Preserve substantive decisions, not identical prose.
Baseline reliability's proposed numerical settings are not approved requirements.

### Observed refinement

Independent paired grading accepted nine of eleven initial whole-diet artifacts.
Two failures were retained:

1. Delivery offered Claude/Codex but omitted OMP. Clarifying the existing instruction
   to offer all three readers, regardless of files present, produced a fresh
   corrected response with all choices, no-wiring and shared-surface effects.
2. Inventory showed writes but omitted authorization/load/eligibility calls from
   its concrete callback. A first clarification recovered the sequence in prose,
   not code. The final instruction requires target-language orchestration code
   and preserves protected steps under word limits. A fresh result shows shared
   authorization, scoped Stock load, domain eligibility and both writes inside
   the same callback, with failure guards and success only after commit.

Ownership and representation were repeated during refinement. Ownership retained
independent counters, prior values, ordered/repeated duplicate IDs, response-only
status and fresh locked confirmation. One representation repeat mislabeled a
three-parameter read as four in prose, while retaining the correct five-parameter
threshold and four-parameter List decision. A final fresh repeat counted List's
four parameters explicitly and preserved the original update/null/pagination
contracts. These intermediate defects were not erased or used to claim perfect
model reliability.

The reserved Go/MySQL shipping-worker task specified a 45-second lease, 14-day
replay horizon and persistent 30-minute automatic-retry ceiling, unknown carrier
idempotency/cancellation guarantees, mutable Order items, historical hydration,
and shared Codex/OMP instructions also imported by Claude. Its artifact retained
those distinct limits, unknown-effect reconciliation, stale-worker fencing limits,
scope/lifecycle ownership and honest runtime boundaries. It counted four/five
parameters correctly and named the child command target, but preserved the
prompt's established-public-contract restriction rather than claiming an approved
signature migration. This checks compatibility handling, not an executed cutover.

Final accepted artifacts cover all eleven paired scenarios; the worker is an
additional confirmation. Each stage uses fresh single samples, not a statistical
guarantee, native-runtime proof or assurance of identical generated wording.

Final review also caught an error-path regression in the simplified concurrent
test: `Fatalf` could stop result collection before all workers finished. Use
`Errorf` while draining all eight outcomes, then retain the post-drain fatal
winner/count checks. A controlled failure-path harness observed one/eight workers
complete at cleanup before correction and eight/eight afterward. Both deliberately
injected-error runs still failed their Go test, as required; the corrected real
example's full race suite passed again. No permanent meta-test or harness was added.
Separate final Standards and Spec reviews cleared that finding and reported no
remaining actionable findings.

### Executed checks and reduction

- `node --test`: 216 passed, zero failures/skips.
- Example `go test -race -count=1 ./...`: three tested packages passed; nine had
  no tests. macOS linking emitted `LC_DYSYMTAB` warnings without failing the suite.
  `gofmt -d` for the changed test was empty.
- The built HTTP/SQLite process again produced 200/201/200 for health/create/read;
  real audit-trigger failure produced safe 500 and retained one user/one audit.
  Removing the trigger allowed the same request; duplicate/invalid/missing gave
  409/400/404; durable counts ended at two/two and SIGTERM exited zero.
- Exact candidate domain fragments executed: release/history, timestamp and Basket
  ownership, signed money overflow/currency boundaries. Candidate label mapping
  passed eight cases; the final decoder passed the same eight and its nullable-time
  helpers passed five absence/presence/round-trip/ownership cases.
- All 186 setup-relative links/anchors resolved. Technical chapter headings remain;
  domain/data/reliability/security fenced code stayed byte-identical to the
  whole-scope baseline. Testing references existing executable cases rather than
  duplicating their fixtures. Production example Go source is unchanged; existing
  test names/assertions remain, with shared fixed-time fixtures and no redundant
  WaitGroup/channel closure when receiving the known eight outcomes.

| Shipped area | Original fixed-point bytes | Final bytes |
| --- | ---: | ---: |
| Entry, index, adoption | 46,451 | 26,519 |
| Nine technical reference chapters | 379,577 | 265,481 |
| Example documentation, source and tests | 64,770 | 55,008 |
| Total setup library | 490,798 | 347,008 |

The whole-library pass itself reduced 478,705 to 347,008 bytes (27.5%); including
the first pass, reduction is 29.3%. Example README fell 20,780→11,455 bytes;
fixture simplification saved 437 bytes without removing cases. No content was
hidden in new shipped files. Temporary execution harnesses/binaries/databases were
removed. No commit, push, plugin installation, application migration or global
change occurred. Native reader loading, real Ent/PostgreSQL/MySQL, broker/provider
failure guarantees and full generated applications remain outside executed evidence.
