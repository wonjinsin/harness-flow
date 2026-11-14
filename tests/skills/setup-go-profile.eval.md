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
- The application owns one transaction. Participating providers/repositories use
  the same scoped SQL/Ent handle; no root-client reads, independent commits, or
  driver types in core. `db` must not import provider/repository to assemble them.
- Operations sharing database, locking/isolation policy and consistency scope
  reuse the common `WithinTransaction` contract. Do not require UoW types or
  per-operation `WithX`/`XTx` wrappers; split only for concrete policy or capability
  differences. A single atomic statement needs no pattern-only wrapper.
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
