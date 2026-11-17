# Go architecture: canonical structure and growth

This chapter is the placement and dependency contract for the Go profile. Read [layer examples](layers.md) when implementing a use case, [domain modeling](domain.md) for invariants, and [data and transactions](data-and-transactions.md) before coordinating writes. The shared handbook becomes project policy only through [project adoption](../adoption.md); it is not permission to rename an existing repository or create a second instruction authority.

## 1. What is canonical, and what is portable?

**Default profile:** Go, Chi, Ent, PostgreSQL, Zerolog, with `core/port/in`, `core/port/out`, and adapter-local mapping. Another stack is an explicit adaptation. Preserve an existing database and compatible stack under its real `persistence/<engine>/` name; handbook adoption does not authorize migration. Respect the target module's dependency versions.

**Portable principle:** core does not depend on delivery/storage frameworks. HTTP requests and Ent rows are adapter representations, permitting CLI/worker/storage alternatives without rewriting domain rules. This requires neither an interface per function nor a service per table.

Requirement labels used throughout the handbook:

- **Required baseline:** applies to ordinary request-driven applications adopting this profile: inward dependencies, explicit composition, context propagation, bounded input, safe errors, and tested invariants.
- **Required when a condition applies:** a mechanism follows a real guarantee. For example, an invariant across multiple database writes requires an application transaction; reliable database-to-message publication requires a durable delivery design.
- **Optional:** useful only when a concrete cost justifies it, such as a cache, rich value objects, a dedicated read model, or asynchronous delivery.
- **Needs project decision:** business semantics or externally visible compatibility cannot be inferred from a folder tree. Examples are email equivalence, tenancy, authorization policy, pagination consistency, and retry/idempotency promises.

Optional mechanisms are not CRUD prerequisites; PoC omissions are not safe defaults.

## 2. The canonical tree

This ownership map is not a folder-creation checklist: add `shared` and `orchestration` only for implemented behavior, never empty forwarding scaffolds. Service areas are packages; their domain/capability/workflow owners are files, not per-type subpackages. `*` marks generated Ent output. Tests normally sit beside their owners; root `test/` holds integration fixtures.

```text
cmd/
  api/
    main.go                         # Process composition and lifecycle
  migrate/
    main.go                         # Existing migration entry point
internal/
  core/
    domain/
      user.go                       # User state, construction, domain rules
    port/
      in/
        user.go                     # UserUseCase, user queries/results, input errors
        command/
          user.go                   # CreateUserCommand and other user write inputs
      out/
        user.go                     # Read-only UserProvider; write-only UserRepository
    service/
      usecase/
        user.go                     # UserUseCase and NewUserUseCase
      shared/
        <capability>.go             # Conditional named <Capability>Service
      orchestration/
        <workflow>.go               # Conditional named <Workflow>Orchestrator
  adapter/
    in/
      http/
        router.go                   # Chi routes and middleware registration
        handler/
          user.go                   # HTTP controller; invokes inbound port
          health.go                 # HTTP health endpoint
        dto/
          user.go                   # HTTP request/response representations
          user_mapper.go            # Request -> command; domain/result -> response
          response.go               # Endpoint-specific response DTOs, when needed
        middleware/
          http_logger.go            # Execution ID/context and access log
          recovery.go               # Safe JSON recovery before response commitment
          cors.go                   # Transport policy
      grpc/                         # Only when gRPC is an implemented transport
    out/
      persistence/
        postgres/                   # Real engine name; adapt for an existing engine
          provider/
            user_provider.go        # Read-only Ent queries; implements UserProvider
          repository/
            user_repo.go            # Ent writes; implements UserRepository
          db/
            client.go               # Pool/client lifecycle and generic tx mechanics
          dao/
            user_mapper.go          # Handwritten domain <-> Ent conversion
            user_error.go           # Shared adapter-local storage error classification
            schema/
              user.go               # Handwritten Ent schema declarations
            ent/
              client.go             # Generated Ent client *
              user.go               # Generated row/entity representation *
              ...                   # Other generated builders/predicates/migration assets *
      ai/<vendor>/                  # e.g. claude/, jev/, only when used
      auth/<vendor>/                # e.g. supabase/
      storage/<vendor>/             # e.g. supabase/
      document/<format>/            # e.g. pdf/, xls/, xlsx/
  config/
    config.go                       # Environment/config loading and validation
  pkg/
    constants/                      # Genuinely shared constants, not all business policy
    errors/                         # Shared error machinery, if needed
    logger/                         # Logging construction/context integration
    utils/                          # Small cohesive helpers; not an alternative service layer
  mock/                             # Existing generated core-contract mocks
test/
  integration/                      # Database/transport integration tests and fixtures
  mocks/                            # Existing test-support location
```

Partition **all inbound/outbound adapters** by their concrete protocol, engine, vendor or format, as in the tree. Even one implementation belongs under its real name; add no unused alternatives or redundant `http/http` level. Keep handlers, DTOs, mappings and client details within that implementation. Common contracts stay implementation-neutral; a multi-format dispatcher may compose readers without introducing parent/child import cycles. `core/port/in` and `core/port/out` remain capability contracts, not vendor/format packages.

Retain the existing ownership of `internal/mock` and root `test/mocks`; do not duplicate mocks. Directory names do not prove tests exist.

The `in` and `out` package names are legal Go but ambiguous in imports. In handbook examples, use:

```go
import (
    inport "example.com/app/internal/core/port/in"
    "example.com/app/internal/core/port/in/command"
    outport "example.com/app/internal/core/port/out"
)
```

Replace `example.com/app` with the actual module. Import `command` directly as `command.XCommand`, retaining `*Command` names without parent-`in` aliases/re-exports. Its structs express write intent; interfaces, queries/results, and `ErrInvalidInput` stay in parent `in`, HTTP DTOs in the adapter.

## 3. Dependency direction is about imports, not execution order

The ordinary execution path is:

```text
HTTP middleware -> router-selected handler -> inbound port -> application service
    -> outbound port -> persistence implementation -> generated Ent -> database
```

Responses travel back through the same call stack. Imports point differently:

```text
cmd/api -----------------> config, logger, adapters, service
HTTP router/handler -----> inbound port, command as needed, DTOs, domain/result types as needed
HTTP DTO mapper ---------> inbound command package, parent inbound result types, domain
service areas -----------> inbound/outbound ports, inbound command package, domain; see call rules below
inbound port ------------> inbound command package, domain, standard-library types
inbound command package -> domain, standard-library types only
outbound port -----------> domain, standard-library types
provider/repository -----> outbound port, domain, dao, Ent/driver; db mechanics as needed
dao mapper/helpers ------> domain, outbound error contracts, generated Ent/driver
db ----------------------> config, Ent/driver; never provider/repository
Ent schema/output -------> Ent/driver packages, not application service
```

**Required baseline:** no import from `internal/core` to `internal/adapter`, `net/http`, Chi, generated Ent, or a database driver. No inbound port signature accepts an HTTP DTO; no outbound port signature returns `*ent.User`, `*ent.Client`, a SQL transaction, or a query builder. Domain should not import either port package: orchestration depends on domain, not the reverse.

`core/port/in/command` must not import its parent `in` package, service packages, transport packages, or ORM packages. The parent imports `command` for operation signatures, never the reverse. Domain imports neither. Moving existing commands changes placement and references only: preserve every field, pointer/collection shape, nil-versus-empty and false-versus-omitted semantics, validation, and behavior. Keep `ctx` first and outside command structs.

The compiler rejects cycles, not every forbidden import. Inspect signatures/imports; `internal/pkg/utils` must not hide framework coupling.

### Runtime dependency inversion

Controllers depend on `inport.UserUseCase`; use cases receive separate `outport.UserProvider` reads and `outport.UserRepository` writes. Composition supplies implementations through Go's implicit interfaces, without registries or DI containers.

Core owns these application boundary contracts by default. Keep them small and consumer-driven rather than mirroring concrete adapters; that portable Go principle does not move this profile's ports into handlers or persistence.

### Service areas and exact call restrictions

- `service/usecase/<domain>.go` owns domain-scoped inbound operations. Declare the concrete `CatalogUseCase` or `LedgerUseCase` and its `NewCatalogUseCase` or `NewLedgerUseCase` constructor in package `usecase`; inbound interfaces remain in `port/in`. Do not hide a generic `UseCase` behind a domain package.
- `service/shared/<capability>.go` is conditional reusable application coordination or I/O, with a named `<Capability>Service` and constructor. Analysis reuses budget reservation/settlement through injected `shared.AccountingService`, not a peer orchestrator. Pure calculations, matching, eligibility, summaries, and collection rules remain in domain.
- `service/orchestration/<workflow>.go` owns an independently entered multi-domain workflow. Declare `AnalysisOrchestrator`, `ConfirmationOrchestrator`, or an independently entered `AccountingOrchestrator` with matching `New...Orchestrator` constructors in package `orchestration`, not generic `Orchestrator` types in per-workflow folders.
- Peer operation/service calls are forbidden, including calls to another inbound operation on the same use-case implementation, usecase-to-usecase calls across domains, shared-to-shared calls, and orchestration-to-orchestration calls. Hiding a peer dependency behind an interface, an inbound port, a callback, or a forwarding facade does not make it allowed. Shared capabilities must not call use cases or orchestration. Use cases must not call orchestration; orchestration must not call use cases. Extract reusable pure behavior into domain, or a genuine reusable application/I/O capability into shared, instead of chaining peer operations.
- All service areas access persistence/external I/O only through outbound ports. They never import concrete adapters, DAO, or `db`. Composition may connect usecase/orchestration to narrow shared contracts; do not invent a second forwarding service/DAO layer.

When declaring boundary types/signatures or configuring quality tooling, read [coding conventions](coding-conventions.md); it owns pointer/value exceptions, input thresholds, naming, spacing, and lint coverage.

## 4. Exact responsibility and file decisions

| Concern or change | Canonical owner | What must not move there |
| --- | --- | --- |
| New route, route group, middleware order | `adapter/in/http/router.go` | SQL, domain transitions, use-case orchestration |
| Request ID, access log, CORS, authentication extraction | `adapter/in/http/middleware/` | Creating users, committing transactions, deciding domain eligibility |
| Parse ID/body/query, select HTTP status and headers | `adapter/in/http/handler/user.go` | Ent builders, duplicate domain rules, environment loading |
| JSON fields, compatibility envelope, transport validation | `adapter/in/http/dto/user.go`, `response.go` | Persistence constraints or use-case execution |
| Request-to-command and result-to-response conversion | `adapter/in/http/dto/user_mapper.go` | Repository calls or business side effects |
| HTTP-independent domain operation, query/result, input error | `core/port/in/user.go` (`UserUseCase`, `ErrInvalidInput`) | Command declarations, JSON tags, HTTP status, framework request/context types |
| Inbound write intent (`*Command` structs) | `core/port/in/command/user.go` | Queries/results, interfaces, generic parameters, HTTP DTOs, parent `in` imports, service/transport/ORM dependencies |
| Domain-scoped coordination, clock usage, authorization, atomic unit | `core/service/usecase/user.go`: `UserUseCase` | Per-domain service folders, peer operation calls, HTTP/SQL/Ent, inline business calculations |
| Reusable application/I/O capability; independent multi-domain workflow | Conditional `core/service/shared/<capability>.go`; `core/service/orchestration/<workflow>.go` | Per-type folders, pure business rules in shared, peer calls, orchestration calling use cases |
| Entity behavior, composed rules, business summaries and matching over values/collections | `core/domain/` | Database clients, network calls, response envelopes |
| Read/write persistence capabilities needed by service | `core/port/out/user.go` (`UserProvider` / `UserRepository`) | Mixed read/write repository, ORM predicates, vendor response types |
| Read queries; writes through existing context-aware adapters | `adapter/out/persistence/postgres/provider/`; `postgres/repository/` | Peer adapter forwarding or deciding a business transition |
| Domain-to-write fields, persisted-to-domain mapping, shared storage error classification | `adapter/out/persistence/postgres/dao/user_mapper.go`, `user_error.go` | HTTP mapping, hidden association queries, a second forwarding DAO |
| Connection, pool, dialect, client options, transaction lifecycle and context-handle resolution | `adapter/out/persistence/postgres/db/` | Business SQL, domain mapping, imports of provider/repository |
| Columns, indexes, uniqueness, relationships | `adapter/out/persistence/postgres/dao/schema/user.go` plus project migrations | Domain workflow implementation |
| Generated clients, entities, query builders | `adapter/out/persistence/postgres/dao/ent/` | Handwritten business logic or manual generated-code patches |
| Parse/validate process configuration | `internal/config/config.go` | Creating a hidden global repository |
| Shared logger/error/helper mechanics | The existing cohesive `internal/pkg` package | An untyped application-wide bag of business methods |
| Select implementations, construct graph, shutdown | `cmd/api/main.go` | Request-specific decisions or schema mutation on ordinary startup |

**Default HTTP contract:** the routes are `GET /healthz`, `POST /users/`, `GET /users/`, and `GET /users/{id}`. Preserve those slash/method choices unless the project intentionally changes its compatibility policy; redirect or slash-normalization behavior is not implicit.

Every ordinary JSON API response has exactly four top-level fields:

| Field | Contract |
| --- | --- |
| `transaction_id` | String identifying this inbound execution, shared with its logs; generation and propagation belong to [security and operations §6](security-and-operations.md#6-logging-traces-metrics-and-audit-have-different-jobs). |
| `response_code` | Four-digit **string**, zero-padded from the actual HTTP status: `"0200"`, `"0201"`, `"0400"`, `"0404"`, `"0409"`, `"0500"`, `"0503"`. Never replace the real HTTP status with an always-200 response. |
| `message` | Safe, human-readable string for success or failure; never raw private causes. |
| `result` | Any JSON value: object, array, string, number, boolean or `null`. Always present, including empty/false/zero/null; no `omitempty`. Nested application data is allowed here, unlike flat log fields. |

```json
{"transaction_id":"20261116201353364a7K2m","response_code":"0201","message":"User created","result":{"id":123}}
{"transaction_id":"20261116201353364a7K2m","response_code":"0503","message":"Service temporarily unavailable","result":null}
```

These are alternative outcomes, not different executions sharing an ID. Use the same renderer for validation/authentication/authorization errors, router 404/405, recovery and pre-header serialization failure, retaining the original ID. No legacy `trid`/`code` aliases or nested `result.msg` error wrapper. Existing published contracts require an approved migration, not a silent rename during setup.

**Protocol exceptions:** HEAD and HTTP 204/304 cannot carry this JSON body. New ordinary empty-success endpoints use 200 with `result:null`, not 204. Explicit file/download/stream/SSE and existing bodyless endpoint contracts remain separate; document them rather than wrapping bytes or buffering unbounded streams. A disconnected client or already-committed response cannot be promised a replacement envelope.

The shared envelope/renderer lives in `internal/pkg/utils/http.go`; [layers](layers.md#classify-errors-once-serialize-once) supplies the concrete fragment. Retain an existing accepted helper location rather than creating a competing envelope. Only transport code uses the HTTP helper; core must not depend on it merely because the package is named `utils`.

For orders, add matching domain, inbound port/command, outbound port, `usecase/order.go` declaring `OrderUseCase`, and necessary adapter files under the real implementation. Group inbound operations by domain; additional files may share that type and package, without universal forwarding `facade/manager/business` layers.

In each provider/repository owner file, place its concrete struct, interface assertion and constructor after imports, followed by its methods: `provider/account.go` owns `Account`, `provider/category.go` owns `Category`, and corresponding repository files own their write types. Do not collect unrelated structs/constructors in `types.go` or `dependencies.go`, or invent an embedded base merely to deduplicate `pool`/`ent` fields. Store only dependencies each owner uses.

“Handler” and “controller” mean one transport responsibility (`UserController` here). Providers/repositories are already adapters; DAO is conversion/schema/generated access, not another forwarding service. A mapper used by one adapter may stay local; shared read/write mapping belongs beside `dao/schema` and generated `dao/ent`, never in generated output or generic `db`.

## 5. Worked data flow: create a user

For create/get/list implementations and explicit imports, read [layers.md](layers.md) before coding. The handoffs are:

```text
router -> handler (bounded DTO decode) -> DTO mapper -> command.CreateUserCommand
    -> UserUseCase -> domain.NewUser -> UserRepository.Insert(ctx, user)
    -> DAO mapper -> Ent Save(ctx) -> database
    -> DAO mapper -> domain result -> DTO mapper -> safe HTTP response
```

Each mapper is an explicit allowlist at its own compatibility boundary, not a reflection converter. Clients cannot set generated IDs/timestamps. Core shares appropriate domain values/results rather than copying a new representation at every call. Storage enforces concurrent uniqueness; inspectable categories and retained private causes return to the HTTP boundary.

### Read and list paths

Reads use `UserProvider`, never repository read methods; absence is inspectable not-found, not `(nil, nil)`. For pagination implementation and failure cases read [layers §8](layers.md#8-list-pagination-is-an-end-to-end-contract): HTTP parses, application bounds all callers, persistence orders deterministically with a unique tie-breaker. Page length is not `total`; count/snapshot and offset/keyset consistency require explicit decisions.

## 6. Composition and lifecycle

**Required baseline:** `cmd/api/main.go` owns the concrete object graph and process lifecycle. Validate configuration, create logging/database resources, then construct providers/repositories, shared services, use cases/orchestrators and transports. Close resources at the boundary that opened them. Constructors receive required dependencies, never discover them through globals, registries or `context.Value`.

Inject providers/repositories into each shared service once, then inject that service into its consumers. For example, compose `shared.NewCategoryService(categoryProvider, ruleRepo)` and call `s.categoryService.Remember(txCtx, command)`, not `category.Remember(txCtx, provider, repo, command)`. Operational methods receive context and business inputs, not dependency bundles. Process-lifetime instances may be reused when concurrency-safe; request data and transaction handles never replace their fields. Pure domain functions need no service wrapper.

For startup wiring and imports, read [layers §9](layers.md#9-config-database-construction-shared-packages-composition). Construct `db.NewEntClient`, provider/repository, `usecase.NewUserUseCase(..., time.Now)`, and `httpadapter.NewRouter` there. Set project-owned `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, and `IdleTimeout`; a constructor excerpt is not a complete lifecycle. Read [security and operations](security-and-operations.md) before startup/shutdown changes.

A startup root context or a separate bounded shutdown context is appropriate at composition. Replacing a request's context with `context.Background()` inside the service/repository is not. The `transaction_id` execution identifier is correlation only; it neither begins nor commits a database transaction.

**Required for atomic multi-write invariants:** application calls `WithinTransaction(ctx, func(txCtx context.Context) error)` using existing injected providers/repositories. `db` privately binds handles and owns lifecycle; adapters resolve per call without field mutation. No repository bundles, per-operation `WithX`/`XTx`, mandatory UoW, HTTP-wide transaction middleware, or ORM handles in core. Workflow owns owner/tenant validation and lock order; creation and owner-locked updates share the runner. Every participating read/write uses `txCtx`, not outer context/root client. Before implementing it, read [data and transactions](data-and-transactions.md) for scope rejection, database boundaries, and lifecycle failures.

## 7. Adding a feature without guessing folders

For `RenameUser`, resolve decisions in this order:

1. Reuse accepted rename/uniqueness/authorization policy; decide whether audit must commit atomically.
2. Put the user invariant in domain so non-HTTP callers cannot bypass it.
3. Add `command.RenameUserCommand` and the `UserUseCase` signature; preserve trusted actor/tenant and input semantics using [coding conventions](coding-conventions.md#2-five-total-boundary-parameters-require-an-input-struct).
4. Add only needed provider reads/repository writes. Choose concurrency/atomicity; do not expose Ent builders or unrestricted column maps.
5. Coordinate load → authorize → domain transition → persist in `usecase/user.go`, never by calling another inbound operation.
6. Implement adapters/mapping and schema+migration inputs; regenerate Ent. Add DTO mapping/controller/route; change composition only for new dependencies.
7. Test domain, service, HTTP compatibility, and real-database failure/concurrency boundaries using [testing and evolution](testing-and-evolution.md).

A single create/read need not gain a transaction abstraction; cross-aggregate/outbox guarantees may require additional contracts.

## 8. Growth: feature, module, bounded context, deployment

Grow cohesive capabilities inside the structure first. Router registration may delegate to feature functions in the same HTTP package. External email/payment remains an outbound port+adapter, never domain network I/O.

**Optional for incohesive packages:** project-approved domain/capability subpackages (`core/domain/billing`, matching ports) retain the service areas, dependency direction, and peer-call bans. Move a coherent capability and migrate imports, not one package per table. Package, Go module, bounded context, and deployment are separate decisions.

**Required for distinct bounded-context semantics:** each context owns its model/contracts/storage. A billing customer need not be an identity account. Translate through narrow outbound integration capabilities/events; do not share mutable ORM objects, chain peer use cases, or write another context's tables. Integration adapters may stay in-process, composed in `cmd/api`. Multi-domain orchestration coordinates domain/outbound behavior directly, never use cases.

**Needs project decision:** local transaction versus coordinated/eventual consistency, data ownership, and API/event compatibility. Before designing that boundary, read [domain](domain.md), [data and transactions](data-and-transactions.md), and [reliability/events](reliability-and-events.md).

**Optional deployment extraction:** require evidence for independent scaling, isolation, ownership, or release benefits exceeding network/consistency costs—not file count or ports. Establish compatible contracts, timeouts, failure handling, observability, data ownership, and migration/rollback first. A modular monolith is complete; a permanently shared `domain.User` across unrelated contexts is not required.

## 9. Normative baseline versus PoC pitfalls

A tree is not production evidence. When reviewing a PoC, follow the owning implementation/risk guidance rather than treating omissions as defaults:

- For discarded context, unsafe errors, generated-code edits, uniqueness prechecks, misleading totals, or unstable ordering, inspect the concrete corrections in [layers](layers.md).
- For a mixed insert/update `Save` that mutates ID, document the exact accepted mutation contract or migrate all consumers to explicit operations; a client-supplied nonzero ID is never implicit update authority.
- For mixed `utils` that pulls HTTP into domain, separate the dependency explicitly while retaining the accepted transport helper/envelope.
- For multi-write atomicity, read [data and transactions](data-and-transactions.md); the execution's `transaction_id` is not a database transaction.
- For durable publication or retryable effects, read [reliability/events](reliability-and-events.md); add delivery/idempotency mechanisms only when required.
- For protected/tenant data, read [security/operations](security-and-operations.md); public CRUD is not an identity service.
- For substantive executable evidence rather than mock/test directories, read [testing/evolution](testing-and-evolution.md).

The [runnable example](../../examples/go) explicitly adapts to standard HTTP/SQLite. It does not prove Chi/Ent/PostgreSQL production, security, or distributed-delivery guarantees.

## 10. Review and verification targets

Trace route → handler/DTO mapper → inbound command/port → service/domain → outbound port → persistence mapper/Ent → safe response against the owner table and exact call rules above. Review changed behavior with [layers' boundary checks](layers.md), applicable production chapters, and [testing/evolution](testing-and-evolution.md); do not infer implemented guarantees from placement.

Report an observed edge and correction, e.g. “`usecase/user.go` imports `dao/ent` and returns `*ent.User`; return domain through `UserUseCase` and map in `persistence/postgres/dao/user_mapper.go`,” not “not clean enough.”
