# Go architecture: canonical structure and growth

This chapter is the placement and dependency contract for the Go profile. Read [layer examples](layers.md) when implementing a use case, [domain modeling](domain.md) for invariants, and [data and transactions](data-and-transactions.md) before coordinating writes. The shared handbook becomes project policy only through [project adoption](../adoption.md); it is not permission to rename an existing repository or create a second instruction authority.

## 1. What is canonical, and what is portable?

**Default profile:** use Go, Chi, Ent, PostgreSQL, and Zerolog. Preserve the `core/port/in` and `core/port/out` placement and adapter-local mapping ownership. A project using another router, SQL library, or database is an explicit adaptation, not evidence that the default profile has changed. For an existing database, use its real engine name in `persistence/<engine>/` and preserve its compatible stack; adopting this handbook does not authorize a migration to PostgreSQL. Dependency versions are not architecture requirements; inspect and respect the target module's selected versions.

**Portable principle:** use cases and domain rules must not depend on delivery or storage frameworks. An HTTP request is one way to invoke an application operation; an Ent entity is one way to persist its data. Keeping those representations outside core permits a CLI, worker, or another persistence adapter without rewriting domain rules. This does not require an interface for every function, a separate service for every table, or a network between layers.

Requirement labels used throughout the handbook:

- **Required baseline:** applies to ordinary request-driven applications adopting this profile: inward dependencies, explicit composition, context propagation, bounded input, safe errors, and tested invariants.
- **Required when a condition applies:** a mechanism follows a real guarantee. For example, an invariant across multiple database writes requires an application transaction; reliable database-to-message publication requires a durable delivery design.
- **Optional:** useful only when a concrete cost justifies it, such as a cache, rich value objects, a dedicated read model, or asynchronous delivery.
- **Needs project decision:** business semantics or externally visible compatibility cannot be inferred from a folder tree. Examples are email equivalence, tenancy, authorization policy, pagination consistency, and retry/idempotency promises.

Do not promote an optional mechanism into a universal prerequisite for CRUD. Conversely, do not call a PoC omission a safe default merely because it appears in an example.

## 2. The canonical tree

The following is the canonical structure for this profile. Files marked `*` are generated output; exact generated contents follow the project's Ent generator. Test files normally live next to the code they exercise; dedicated integration fixtures can use `test`. This is an ownership map, not a command to create every folder: create `shared/<capability>` or `orchestration/<workflow>` only when an implemented capability/workflow needs it. Do not add empty packages or forwarding scaffolds.

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
        user.go                     # UserUseCase and user commands/queries/results
      out/
        user.go                     # Read-only UserProvider; write-only UserRepository
    service/
      usecase/
        user/
          usecase.go                # User operations implementing UserUseCase
      shared/
        <capability>/               # Conditional reusable application/I/O capability
      orchestration/
        <workflow>/                 # Conditional multi-domain application workflow
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
          response.go               # HTTP envelope, if the project uses one
        middleware/
          tr_id.go                  # Request correlation, not a DB transaction
          http_logger.go            # Access log around the request
          cors.go                   # Transport policy
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

`test/` is at repository root. The layout includes both `internal/mock` and `test/mocks`; retain existing ownership rather than copying each mock into both places. Test directories are not proof that substantive integration tests exist.

The `in` and `out` package names are legal Go but ambiguous in imports. In handbook examples, use:

```go
import (
    inport "example.com/app/internal/core/port/in"
    outport "example.com/app/internal/core/port/out"
)
```

Replace `example.com/app` with the actual module path. These aliases are this profile's readability convention, not a Go language requirement.

## 3. Dependency direction is about imports, not execution order

The ordinary execution path is:

```text
HTTP middleware -> router-selected handler -> inbound port -> application service
    -> outbound port -> persistence implementation -> generated Ent -> database
```

Responses travel back through the same call stack. Imports point differently:

```text
cmd/api -----------------> config, logger, adapters, service
HTTP router/handler -----> inbound port, DTOs, domain/result types as needed
HTTP DTO mapper ---------> inbound command/result types, domain
service areas -----------> inbound/outbound ports, domain; see call rules below
inbound port ------------> domain, standard-library types
outbound port -----------> domain, standard-library types
provider/repository -----> outbound port, domain, dao, Ent/driver; db mechanics as needed
dao mapper/helpers ------> domain, outbound error contracts, generated Ent/driver
db ----------------------> config, Ent/driver; never provider/repository
Ent schema/output -------> Ent/driver packages, not application service
```

**Required baseline:** no import from `internal/core` to `internal/adapter`, `net/http`, Chi, generated Ent, or a database driver. No inbound port signature accepts an HTTP DTO; no outbound port signature returns `*ent.User`, `*ent.Client`, a SQL transaction, or a query builder. Domain should not import either port package: orchestration depends on domain, not the reverse.

The Go compiler rejects import cycles, but it does not reject all architecture violations. A service can compile while importing Ent directly. Review the actual imports and signatures, not only directory names. Core may use cohesive framework-neutral helpers in `internal/pkg`; that is not permission to hide a framework dependency under `utils`.

### Runtime dependency inversion

A user use case calls `outport.UserProvider` for reads and `outport.UserRepository` for writes; the persistence adapters implement those separate interfaces. It does not construct either adapter or know which implementation it receives. A controller calls `inport.UserUseCase`; `core/service/usecase/user` implements it. Go's implicit interface implementation makes the wiring explicit without registration, inheritance, reflection, or a dependency-injection container.

Interfaces live in core here because they express the application's inbound and outbound boundary contracts. This is a **default-profile placement convention**. The **portable Go principle** is to keep interfaces small and driven by consumers, not to publish an interface mirroring every concrete adapter method. Do not move all interfaces into persistence merely because it is the implementation, or move all ports into handlers under a blanket reading of consumer ownership.

### Service areas and exact call restrictions

- `service/usecase/<domain>` owns domain-scoped inbound operations. Name the inbound contract for that domain (`UserUseCase`, not a universal `UseCase` or `Service`).
- `service/shared/<capability>` is conditional: reusable application coordination or I/O, such as an outbound notification capability, with an explicit narrow contract. Pure calculations, matching, eligibility, summaries, and collection rules remain in domain even when several callers reuse them.
- `service/orchestration/<workflow>` is conditional: a multi-domain workflow coordinates domain behavior and outbound ports/shared capabilities directly. It must not call use cases.
- Peer operation/service calls are forbidden, including calls to another inbound operation on the same use-case implementation, usecase-to-usecase calls across domains, shared-to-shared calls, and orchestration-to-orchestration calls. Hiding a peer dependency behind an interface, an inbound port, a callback, or a forwarding facade does not make it allowed. Shared capabilities must not call use cases or orchestration. Use cases must not call orchestration; orchestration must not call use cases. Extract reusable pure behavior into domain, or a genuine reusable application/I/O capability into shared, instead of chaining peer operations.
- All service areas access persistence/external I/O only through outbound ports. They never import concrete adapters, DAO, or `db`. Composition may connect usecase/orchestration to narrow shared contracts; do not invent a second forwarding service/DAO layer.

See [coding conventions](coding-conventions.md) for entity pointers and defined plural pointer collections, value-object exceptions, context-inclusive command/query thresholds, Google Go naming, explicit `...Provider`/`...Repo`/`...UoW` dependency fields, and golangci-lint-only tooling. A blank line between all handwritten functions remains a review requirement; built-in tooling coverage is not a complete enforcement claim.

## 4. Exact responsibility and file decisions

| Concern or change | Canonical owner | What must not move there |
| --- | --- | --- |
| New route, route group, middleware order | `adapter/in/http/router.go` | SQL, domain transitions, use-case orchestration |
| Request ID, access log, CORS, authentication extraction | `adapter/in/http/middleware/` | Creating users, committing transactions, deciding domain eligibility |
| Parse ID/body/query, select HTTP status and headers | `adapter/in/http/handler/user.go` | Ent builders, duplicate domain rules, environment loading |
| JSON fields, compatibility envelope, transport validation | `adapter/in/http/dto/user.go`, `response.go` | Persistence constraints or use-case execution |
| Request-to-command and result-to-response conversion | `adapter/in/http/dto/user_mapper.go` | Repository calls or business side effects |
| HTTP-independent domain operation and command/query/result | `core/port/in/user.go` (`UserUseCase`) | JSON tags, HTTP status, framework request/context types |
| Domain-scoped coordination, clock usage, authorization, atomic unit | `core/service/usecase/user/usecase.go` | Peer operation calls, HTTP decoding, SQL, Ent entities, inline business calculations |
| Reusable application/I/O capability; multi-domain workflow | Conditional `core/service/shared/<capability>`; `core/service/orchestration/<workflow>` | Pure business rules in shared, peer calls, orchestration calling use cases |
| Entity behavior, composed rules, business summaries and matching over values/collections | `core/domain/` | Database clients, network calls, response envelopes |
| Read/write persistence capabilities needed by service | `core/port/out/user.go` (`UserProvider` / `UserRepository`) | Mixed read/write repository, ORM predicates, vendor response types |
| Read queries; writes and transaction-scoped adapter assembly | `adapter/out/persistence/postgres/provider/`; `postgres/repository/` | Peer adapter forwarding or deciding a business transition |
| Domain-to-write fields, persisted-to-domain mapping, shared storage error classification | `adapter/out/persistence/postgres/dao/user_mapper.go`, `user_error.go` | HTTP mapping, hidden association queries, a second forwarding DAO |
| Connection, pool, dialect, client options, generic transaction mechanics | `adapter/out/persistence/postgres/db/` | Business SQL, domain mapping, imports of provider/repository |
| Columns, indexes, uniqueness, relationships | `adapter/out/persistence/postgres/dao/schema/user.go` plus project migrations | Domain workflow implementation |
| Generated clients, entities, query builders | `adapter/out/persistence/postgres/dao/ent/` | Handwritten business logic or manual generated-code patches |
| Parse/validate process configuration | `internal/config/config.go` | Creating a hidden global repository |
| Shared logger/error/helper mechanics | The existing cohesive `internal/pkg` package | An untyped application-wide bag of business methods |
| Select implementations, construct graph, shutdown | `cmd/api/main.go` | Request-specific decisions or schema mutation on ordinary startup |

**Default HTTP contract:** the routes are `GET /healthz`, `POST /users/`, `GET /users/`, and `GET /users/{id}`. Preserve those slash/method choices unless the project intentionally changes its compatibility policy; redirect or slash-normalization behavior is not implicit. The response envelope is `{"trid": "...", "code": "0200", "result": ...}` with `result` omitted when empty. `code` is a four-digit string: `"0200"`/`"0201"` for the shown successes and `"0400"`/`"0404"`/`"0409"`/`"0500"` for the shown errors. The error result is `{"msg": safeMessage}`. Keep this default style; do not silently replace it with bare JSON or problem details. If a PoC exposes raw errors, replace them with safe messages without changing the envelope.

The default envelope/helper location is `internal/pkg/utils/http.go`, and `dto/response.go` defines the error-result shape. Retain a target project's already accepted helper location rather than creating a competing envelope. Transport code may use that HTTP helper; core must not depend on HTTP mechanics merely because their package is named `utils`. Separating mixed helpers can be an explicit project migration, not an excuse to invent a new default layout.

For a second domain such as orders, add `core/domain/order.go`, `core/port/in/order.go`, `core/port/out/order.go`, and `core/service/usecase/order/usecase.go`, plus the needed provider/repository files under the real engine and adapter-local mapping. Group inbound operations by domain, not one universal application interface or one interface per scalar action. Split a large file/package only for cohesion; no `facade/`, `manager/`, `business/`, or duplicate repository tree merely to wrap existing calls.

A handler and controller mean the same transport responsibility in this handbook; examples use `UserController`. Pick the project's existing naming convention rather than introducing two forwarding layers. Providers and repositories are already adapters; DAO is not another handwritten forwarding interface/service beneath them. `postgres/dao/schema` and `postgres/dao/ent` expose schema input and generated persistence access; shared handwritten mappers/helpers live alongside them, never inside generated `ent` or generic `db`. If a mapper has only one adapter owner, keeping it local to that owner is also coherent; do not duplicate a shared mapper across read and write packages.

## 5. Worked data flow: create a user

This is a boundary narrative; [layers.md](layers.md) supplies the scoped Go implementations. `CreateUserCommand` expresses application intent, and context-aware repository signatures preserve cancellation through the persistence boundary.

1. `router.go` binds `POST /users/` to `UserController.CreateUser`, with request-scoped middleware. It does not construct a user or query the database.
2. `handler/user.go` checks content type and body size, decodes `dto.CreateUserRequest`, and rejects malformed or unexpected transport input. `dto/user_mapper.go` maps only permitted fields to `inport.CreateUserCommand`. A client cannot set a database ID or creation timestamp just because those fields exist in domain.
3. `core/port/in/user.go` defines `UserUseCase.CreateUser(ctx, command)`. The command has Go fields, not JSON tags. A worker could construct the same command without importing HTTP.
4. `core/service/usecase/user/usecase.go` receives the request context, asks domain construction to enforce name/email rules, chooses the current time through an explicit dependency where deterministic tests need it, and calls the outbound repository. It does not trust that HTTP has already validated the invariant.
5. `core/domain/user.go` constructs valid user state. The example `User` contains `ID int`, `Name string`, `Email string`, and `CreatedAt time.Time`, and its `NewUser` normalizes/validates. Entities cross boundaries as pointers and `domain.Users` is a defined `[]*User` collection; small value objects/projections may remain values.
6. `core/port/out/user.go` keeps `UserRepository.Insert(ctx, u) (*domain.User, error)` separate from read-only `UserProvider.FindByID/List`. Returning the database-generated ID is explicit. Adopting these contracts requires migrating existing callers/mocks, not retaining an old mixed contract as a shim.
7. `postgres/repository/user_repo.go` maps domain fields with `postgres/dao/user_mapper.go`, executes an Ent builder with the same `ctx`, and translates known storage failures to core contract errors using adapter-local classification. The database's unique email rule resolves concurrent conflicts; a precheck alone cannot.
8. The repository maps the saved Ent entity back to domain. Neither generated methods nor loaded Ent edges cross into the service or handler.
9. The use case returns the domain entity pointer/result. `dto/user_mapper.go` constructs `UserResponse`, deliberately exposing only public fields. The handler selects `201 Created`, `Location`, and JSON. Error classification selects a stable public message; raw driver/internal strings remain private and original causes remain inspectable.

There are two explicit mappers, for different reasons:

```text
JSON <-> HTTP DTO -> application command -> domain
                                           |
                            persistence mapper <-> Ent <-> PostgreSQL
                                           |
application/domain result -> HTTP response mapper -> JSON
```

They must not be collapsed into a reflection-based generic converter. Field names being equal today does not mean transport compatibility, business invariants, and schema evolution have the same owner. Conversely, do not invent distinct copies at every function call: a service and its ports can share an appropriate domain value or explicit application result.

### Read and list paths

`GET /users/{id}` parses the path into a positive ID, calls `UserUseCase.GetUser`, which reads through `UserProvider.FindByID`, and maps a domain result to a DTO. Lists similarly use `UserProvider.List`; the repository has no read methods. A missing record is a typed/inspectable not-found outcome, not `nil, nil`. The handler maps that outcome to the project's public `404` policy.

`GET /users/?offset=0&limit=50` has a bounded query contract. HTTP rejects malformed numbers; the application enforces valid limits for all callers; persistence applies a deterministic order including a unique tie-breaker. Do not label the current page length `total`: a total requires a separate count contract and possibly a consistency decision. A `limit+1` read can truthfully return `has_more` without a count. Offset pagination is a valid simple baseline; keyset pagination becomes appropriate when workload, consistency, or latency requires it. See [layers.md](layers.md#8-list-pagination-is-an-end-to-end-contract) and [data and transactions](data-and-transactions.md).

## 6. Composition and lifecycle

**Required baseline:** `cmd/api/main.go` owns the concrete object graph and process lifecycle. Start from validated configuration, create logging infrastructure and database resources, construct providers/repositories, use cases, and the HTTP router, then run the server. Close resources at the boundary that opened them. A constructor should receive required dependencies; it should not find them through a global registry or `context.Value`.

The following is a wiring excerpt inside the process startup function, not a complete executable. `cfg`, `startupCtx`, `log`, and shutdown ownership have already been established there. The constructor signatures match the illustrative layer chapter; adapt existing constructors and their callers together when adopting these contracts.

```go
client, err := db.NewEntClient(startupCtx, cfg.Database)
if err != nil {
    return fmt.Errorf("open persistence: %w", err)
}
defer client.Close()

userProvider := provider.NewUserProvider(client)
userRepo := repository.NewUserRepository(client)
userUseCase := user.NewUseCase(userProvider, userRepo, time.Now)
router := httpadapter.NewRouter(userUseCase, log)
server := &http.Server{
    Addr:              cfg.HTTP.Address,
    Handler:           router,
    ReadHeaderTimeout: cfg.HTTP.ReadHeaderTimeout,
    ReadTimeout:       cfg.HTTP.ReadTimeout,
    WriteTimeout:      cfg.HTTP.WriteTimeout,
    IdleTimeout:       cfg.HTTP.IdleTimeout,
}
```

`db`, `provider`, and `repository` import the matching `internal/adapter/out/persistence/postgres/` packages; `user` imports `internal/core/service/usecase/user`. `httpadapter` aliases `internal/adapter/in/http`, avoiding collision with standard `net/http`. In actual startup code, handle the database close error according to the process logging policy. Server startup failure, graceful shutdown, readiness, secret handling, proxy trust, and resource bounds are covered in [security and operations](security-and-operations.md). The wiring excerpt is not a lifecycle implementation to paste without those requirements.

A startup root context or a separate bounded shutdown context is appropriate at composition. Replacing a request's context with `context.Background()` inside the service/repository is not. A middleware field named `TrID` is correlation only; it neither begins nor commits a database transaction.

**Required when multiple writes must succeed together:** the application determines the transaction boundary through an outbound transaction capability. `postgres/db` owns generic begin/commit/rollback mechanics, never business SQL or adapter construction; `postgres/repository` assembles transaction-scoped repositories and any narrow scoped providers sharing that handle. Every participating read/write must use the transaction-bound handle when the guarantee requires it. Do not start an HTTP-wide transaction in generic middleware or expose `*ent.Tx` to core. The complete contracts and rollback/commit behavior belong in [data and transactions](data-and-transactions.md), not in a generic `Manager` layer.

## 7. Adding a feature without guessing folders

Suppose the next operation is `RenameUser`. Use this order to resolve ownership before implementation:

1. Define the business rule: who may rename, whether names must be unique, and whether an audit entry must commit atomically. Reuse existing policy; ask only genuinely unresolved semantics.
2. Add the domain transition to `core/domain/user.go` if it is a user invariant. Keep transport-only length/shape errors outside it, but ensure a non-HTTP caller cannot bypass domain validity.
3. Add `RenameUserCommand` and the operation to `UserUseCase` in `core/port/in/user.go`. Inputs include only application data. If an actor/tenant is required, use an explicit trusted application identity representation, not a raw HTTP header. Apply the [context-inclusive input threshold](coding-conventions.md) to new boundary signatures.
4. Add only required read capabilities to `UserProvider` and write capabilities to `UserRepository` in `core/port/out/user.go`; choose update concurrency and transaction semantics deliberately. Do not expose `SetName` Ent builders or an unrestricted map of column changes.
5. Implement coordination in `core/service/usecase/user/usecase.go`: load through the provider, authorize as needed, invoke domain behavior, persist through the repository, return. Do not call another use-case operation to reuse it. This is where the application chooses atomicity, not where it writes SQL.
6. Implement queries in `postgres/provider/user_provider.go`, writes in `postgres/repository/user_repo.go`, conversion in `postgres/dao/user_mapper.go`, and schema changes in `postgres/dao/schema` plus the project's migration workflow. Regenerate `postgres/dao/ent`; do not edit generated output to simulate a missing schema change.
7. Add the HTTP request/response shape in `dto/user.go` and mapping in `dto/user_mapper.go`, implement the controller operation in `handler/user.go`, and register its route in `router.go`.
8. Update the composition only for new dependencies. A new method on an already wired service does not justify a new facade or global registration.
9. Add domain, service, HTTP contract, and real database tests for the changed behavior. Review cancellation, safe errors, constraint mapping, and concurrency failure cases, not only the successful response. See [testing and evolution](testing-and-evolution.md).

A simple create/read use case may need only a handful of methods and no transaction abstraction. A cross-aggregate write with an outbox needs additional contracts because its guarantee is different, not because the project has reached an arbitrary number of files.

## 8. Growth: feature, module, bounded context, deployment

**Required baseline:** grow by cohesive capabilities inside this structure first. `UserUseCase` can be small; it does not have to become the application-wide `ServiceManager`. The router can delegate registration to feature functions in the same HTTP adapter package when readability warrants it. An outbound email or payment capability belongs under `core/port/out` and an adapter under the existing `adapter/out` boundary; it does not belong in a domain method doing network I/O.

**Optional when packages become incohesive:** introduce domain/capability subpackages under existing layers, such as `core/domain/billing`, `core/port/in/billing`, and `core/port/out/billing`, while retaining the default `core/service/usecase/<domain>` and conditional shared/orchestration areas. This is an explicit project-approved mapping, not permission to add a second layer convention. Move a coherent capability, migrate imports, and keep the same dependency direction and peer-call bans. Do not scatter a single invariant across subpackages merely to match table names. Go packages, a Go module (`go.mod`), a business bounded context, and a deployed service are different decisions.

**Required when bounded contexts have different semantics:** give each context ownership of its model, contracts, and storage access. A billing customer is not automatically an identity account because both have an email. Integrate through a narrow outbound integration capability or translated integration event; do not share a mutable ORM object, chain peer use cases behind an interface, or let one context write the other's tables through a convenient repository. A small monolith can keep integration adapters in-process, composed in `cmd/api`, without a message broker or HTTP hop. A multi-domain orchestration coordinates outbound capabilities/domain behavior directly, never calls use cases. Clarify any transaction crossing those boundaries and avoid import cycles.

**Needs project decision:** whether cross-context consistency is one local transaction, a coordinated workflow, or eventual consistency; what data each context owns; and which API/event schemas are compatibility commitments. See [domain](domain.md), [data and transactions](data-and-transactions.md), and [reliability and events](reliability-and-events.md).

**Optional, with evidence:** extract a deployment only for independent scaling, security isolation, operational ownership, or release independence that outweighs network and distributed-consistency costs. File count and the existence of ports are not extraction criteria. Before extraction, establish compatible contracts, timeouts, failure handling, observability, data ownership, and migration/rollback strategy. A modular monolith is a complete architecture, not an unfinished microservice system.

Avoid the opposite mistake too: do not preserve a shared `domain.User` across unrelated contexts simply because this chapter starts with one user example. The invariant is ownership and dependency direction, not a permanently flat domain package.

## 9. Normative baseline versus PoC pitfalls

A layout illustrates boundaries and placement. It is not evidence that production guarantees have already been implemented. Review a PoC for the following pitfalls and missing capabilities.

| Potential behavior or omission | Required response or deliberate decision |
| --- | --- |
| Inbound methods accept context, but service discards it; repository methods do not accept context and create `Background` contexts | **Required baseline:** carry `ctx` through each I/O boundary; use Ent's `Save(ctx)`, `Only(ctx)`, `All(ctx)`, and transaction calls with the operation context. |
| Create prechecks email before `Save`; schema has unique email | **Required baseline:** normalize according to explicit policy and enforce uniqueness in the database. A precheck is only advisory; map the actual named unique violation, including concurrent creates. |
| Repository `Save` combines insert/update and mutates the user's ID | **Needs project decision:** document this exact mutation contract, or adopt explicit insert/update methods and migrate all consumers. Do not accidentally treat a nonzero client-supplied ID as permission to update. |
| `CustomError` combines code/message strings and does not properly retain causes | **Required baseline:** inspectable application error categories with correct cause retention; use `errors.Is`/`errors.As` and wrapping deliberately. Do not branch on error text. |
| Domain imports `pkg/utils`, whose package also contains HTTP parsing/response helpers | **Required baseline:** do not hide transport coupling in a generic helper package. The layer example puts domain normalization directly with domain construction and retains the existing HTTP envelope helper for transport callers; a project can migrate mixed helpers without inventing a new default directory tree. |
| HTTP can return raw `err.Error()` | **Required baseline:** stable, allowlisted public error messages; private diagnostics logged once at the owning boundary. |
| List response uses returned page length as `Total` | **Required baseline:** truthful pagination metadata. Use page count/`has_more`, or implement a real total with documented consistency. |
| List orders by creation time without a unique tie-breaker | **Required baseline:** deterministic ordering; **needs project decision:** snapshot/keyset semantics under concurrent changes. |
| `TrID` middleware carries request correlation | Keep it as correlation. **Required when an atomic multi-write invariant exists:** real database transaction binding. |
| No application transaction, reliable event delivery, outbox, or idempotency mechanism | Add only when the business/transport guarantee demands it; absence is not proof of safety for a multi-write or retryable operation. |
| No implemented authentication or tenant model | **Required when protected or multi-tenant data exists:** explicit identity, authorization, and scoped persistence. Do not present the user CRUD sample as a production identity service. |
| Test directory placeholders and generated mocks exist | **Required baseline:** executable behavior tests. Placeholder directories and mocks are not passed test evidence. |

Related chapters describe the applicable designs: [domain](domain.md), [transactions](data-and-transactions.md), [reliability/events](reliability-and-events.md), [security/operations](security-and-operations.md), and [testing/evolution](testing-and-evolution.md). The [runnable Go example](../../examples/go) intentionally adapts the same layers to standard-library HTTP and SQLite; it is not the Chi/Ent/PostgreSQL production profile and does not demonstrate complete security or distributed delivery guarantees.

## 10. Review and verification targets

After implementation, a reviewer should be able to trace one request without guessing:

- The route names a handler; the handler owns decode and safe HTTP mapping; its field is an inbound port, not a concrete repository.
- Commands/results are declared in core and contain no HTTP or ORM types. The two mapper files are in the correct adapters.
- The service calls outbound contracts, domain enforces its rules, and persistence alone imports generated Ent.
- The same cancellation/deadline reaches the actual database operation. No request-scoped repository creates `context.Background()`.
- A concurrent uniqueness conflict is decided by the constraint, not solely a prior lookup. Unknown database errors cannot become misleading `409` responses.
- Lists have bounded limits, stable ordering, truthful metadata, and documented consistency.
- Composition creates dependencies explicitly; config is validated before startup; resources have a lifecycle owner.
- Tests demonstrate behavior across the changed boundaries. No claim of transactionality, auth, reliable delivery, or idempotency is made without an implementation and failure-case evidence.

A useful violation report is specific: “`core/service/usecase/user/usecase.go` imports `dao/ent` and returns `*ent.User`; return the domain result through `UserUseCase` and move Ent conversion into `persistence/postgres/dao/user_mapper.go`.” “Not clean enough” is not an actionable review.
