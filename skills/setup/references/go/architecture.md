# Go architecture: canonical structure and growth

This chapter is the placement and dependency contract for the Go profile. Read [layer examples](layers.md) when implementing a use case, [domain modeling](domain.md) for invariants, and [data and transactions](data-and-transactions.md) before coordinating writes. The shared handbook becomes project policy only through [project adoption](../adoption.md); it is not permission to rename an existing repository or create a second instruction authority.

## 1. What is canonical, and what is portable?

**Default profile:** use Go, Chi, Ent, PostgreSQL, and Zerolog. Preserve the `core/port/in` and `core/port/out` placement and both adapter-local mapper locations. A project using another router, SQL library, or database is an explicit adaptation, not evidence that the default profile has changed. Dependency versions are not architecture requirements; inspect and respect the target module's selected versions.

**Portable principle:** use cases and domain rules must not depend on delivery or storage frameworks. An HTTP request is one way to invoke an application operation; an Ent entity is one way to persist its data. Keeping those representations outside core permits a CLI, worker, or another persistence adapter without rewriting domain rules. This does not require an interface for every function, a separate service for every table, or a network between layers.

Requirement labels used throughout the handbook:

- **Required baseline:** applies to ordinary request-driven applications adopting this profile: inward dependencies, explicit composition, context propagation, bounded input, safe errors, and tested invariants.
- **Required when a condition applies:** a mechanism follows a real guarantee. For example, an invariant across multiple database writes requires an application transaction; reliable database-to-message publication requires a durable delivery design.
- **Optional:** useful only when a concrete cost justifies it, such as a cache, rich value objects, a dedicated read model, or asynchronous delivery.
- **Needs project decision:** business semantics or externally visible compatibility cannot be inferred from a folder tree. Examples are email equivalence, tenancy, authorization policy, pagination consistency, and retry/idempotency promises.

Do not promote an optional mechanism into a universal prerequisite for CRUD. Conversely, do not call a PoC omission a safe default merely because it appears in an example.

## 2. The canonical tree

The following is the canonical structure for this profile. Files marked `*` are generated output; exact generated contents follow the project's Ent generator. Test files normally live next to the code they exercise; dedicated integration fixtures can use `test`.

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
        usecase.go                  # UserService and use-case inputs/results
      out/
        repository.go               # UserRepository and external-operation contracts
    service/
      user_service.go               # Use-case orchestration; implements inbound port
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
        db.go                       # Database/Ent construction and connection settings
        user_repo.go                # Outbound port implementation using Ent
        user_mapper.go              # Domain <-> persisted representation mapping
        dao/
          schema/
            user.go                 # Handwritten Ent schema declarations
          ent/
            client.go               # Generated Ent client *
            user.go                 # Generated row/entity representation *
            ...                     # Other generated builders/predicates/migration assets *
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
service -----------------> inbound port, outbound port, domain
inbound port ------------> domain, standard-library types
outbound port -----------> domain, standard-library types
persistence -------------> outbound port, domain, Ent/driver
persistence mapper ------> domain, generated Ent
Ent schema/output -------> Ent/driver packages, not application service
```

**Required baseline:** no import from `internal/core` to `internal/adapter`, `net/http`, Chi, generated Ent, or a database driver. No inbound port signature accepts an HTTP DTO; no outbound port signature returns `*ent.User`, `*ent.Client`, a SQL transaction, or a query builder. Domain should not import either port package: orchestration depends on domain, not the reverse.

The Go compiler rejects import cycles, but it does not reject all architecture violations. A service can compile while importing Ent directly. Review the actual imports and signatures, not only directory names. Core may use cohesive framework-neutral helpers in `internal/pkg`; that is not permission to hide a framework dependency under `utils`.

### Runtime dependency inversion

A service calls `outport.UserRepository`; persistence implements that interface. The service does not construct a repository or know which implementation it receives. A controller calls `inport.UserService`; the service implements it. Go's implicit interface implementation makes the wiring explicit without registration, inheritance, reflection, or a dependency-injection container.

Interfaces live in core here because they express the application's inbound and outbound boundary contracts. This is a **default-profile placement convention**. The **portable Go principle** is to keep interfaces small and driven by consumers, not to publish an interface mirroring every concrete adapter method. Do not move all interfaces into persistence merely because it is the implementation, or move all ports into handlers under a blanket reading of consumer ownership.

## 4. Exact responsibility and file decisions

| Concern or change | Canonical owner | What must not move there |
| --- | --- | --- |
| New route, route group, middleware order | `adapter/in/http/router.go` | SQL, domain transitions, use-case orchestration |
| Request ID, access log, CORS, authentication extraction | `adapter/in/http/middleware/` | Creating users, committing transactions, deciding domain eligibility |
| Parse ID/body/query, select HTTP status and headers | `adapter/in/http/handler/user.go` | Ent builders, duplicate domain rules, environment loading |
| JSON fields, compatibility envelope, transport validation | `adapter/in/http/dto/user.go`, `response.go` | Persistence constraints or use-case execution |
| Request-to-command and result-to-response conversion | `adapter/in/http/dto/user_mapper.go` | Repository calls or business side effects |
| HTTP-independent operation and command/query/result | `core/port/in/usecase.go` | JSON tags, HTTP status, framework request/context types |
| Coordination, clock usage, authorization orchestration, atomic unit | `core/service/user_service.go` | HTTP decoding, SQL, Ent entities, inline business calculations |
| Entity behavior, composed rules, business summaries and matching over values/collections | `core/domain/` | Database clients, network calls, response envelopes |
| Persistence/external capability needed by service | `core/port/out/repository.go` | ORM predicates, vendor response types |
| Query construction, database error classification, transaction-bound implementation | `adapter/out/persistence/user_repo.go` | HTTP errors or deciding a business transition |
| Domain-to-write fields and persisted-to-domain mapping | `adapter/out/persistence/user_mapper.go` | HTTP mapping or loading associations as a hidden side effect |
| Connection, pool, dialect, client options | `adapter/out/persistence/db.go` | Reading global environment on every query |
| Columns, indexes, uniqueness, relationships | `adapter/out/persistence/dao/schema/user.go` plus project migrations | Domain workflow implementation |
| Generated clients, entities, query builders | `adapter/out/persistence/dao/ent/` | Handwritten business logic or manual generated-code patches |
| Parse/validate process configuration | `internal/config/config.go` | Creating a hidden global repository |
| Shared logger/error/helper mechanics | The existing cohesive `internal/pkg` package | An untyped application-wide bag of business methods |
| Select implementations, construct graph, shutdown | `cmd/api/main.go` | Request-specific decisions or schema mutation on ordinary startup |

**Default HTTP contract:** the routes are `GET /healthz`, `POST /users/`, `GET /users/`, and `GET /users/{id}`. Preserve those slash/method choices unless the project intentionally changes its compatibility policy; redirect or slash-normalization behavior is not implicit. The response envelope is `{"trid": "...", "code": "0200", "result": ...}` with `result` omitted when empty. `code` is a four-digit string: `"0200"`/`"0201"` for the shown successes and `"0400"`/`"0404"`/`"0409"`/`"0500"` for the shown errors. The error result is `{"msg": safeMessage}`. Keep this default style; do not silently replace it with bare JSON or problem details. If a PoC exposes raw errors, replace them with safe messages without changing the envelope.

The default envelope/helper location is `internal/pkg/utils/http.go`, and `dto/response.go` defines the error-result shape. Retain a target project's already accepted helper location rather than creating a competing envelope. Transport code may use that HTTP helper; core must not depend on HTTP mechanics merely because their package is named `utils`. Separating mixed helpers can be an explicit project migration, not an excuse to invent a new default layout.

For a second entity such as an order, add `order.go`, `order_service.go`, `order_repo.go`, and `order_mapper.go` within the same owning directories. The initial shared port files can hold a small set of contracts; split them into `core/port/in/order.go` and `core/port/out/order.go` when they become difficult to navigate. That is a file-level expansion within the canonical folders, not a new architectural layer. Do not create `facade/`, `manager/`, `business/`, or a second `repository/` tree merely to wrap existing calls.

A handler and controller mean the same transport responsibility in this handbook; examples use `UserController`. Pick the project's existing naming convention rather than introducing two forwarding layers. A repository is already an adapter; a DAO is not automatically another handwritten interface/service below it. In this layout, `dao/schema` and `dao/ent` make schema input and generated persistence access visible. Add a handwritten query helper only for real reuse or complexity, and keep it adapter-local.

## 5. Worked data flow: create a user

This is a boundary narrative; [layers.md](layers.md) supplies the scoped Go implementations. `CreateUserCommand` expresses application intent, and context-aware repository signatures preserve cancellation through the persistence boundary.

1. `router.go` binds `POST /users/` to `UserController.CreateUser`, with request-scoped middleware. It does not construct a user or query the database.
2. `handler/user.go` checks content type and body size, decodes `dto.CreateUserRequest`, and rejects malformed or unexpected transport input. `dto/user_mapper.go` maps only permitted fields to `inport.CreateUserCommand`. A client cannot set a database ID or creation timestamp just because those fields exist in domain.
3. `core/port/in/usecase.go` defines `CreateUser(ctx, command)`. The command has Go fields, not JSON tags. A worker could construct the same command without importing HTTP.
4. `core/service/user_service.go` receives the request context, asks domain construction to enforce name/email rules, chooses the current time through an explicit dependency where deterministic tests need it, and calls the outbound repository. It does not trust that HTTP has already validated the invariant.
5. `core/domain/user.go` constructs valid user state. The example `User` contains `ID int`, `Name string`, `Email string`, and `CreatedAt time.Time`, and its `NewUser` normalizes/validates. If a project strengthens encapsulation or adds named types, that is an intentional domain evolution, not an assumption about existing fields.
6. `core/port/out/repository.go` describes the needed save/insert behavior in domain terms and accepts `context.Context`. A create-only operation can use `Insert(ctx, u) (*domain.User, error)` so returning a database-generated ID is explicit. If an existing repository uses a mutating `Save`, changing that contract requires migrating every caller and mock, not keeping a compatibility alias indefinitely.
7. `persistence/user_repo.go` maps the domain fields with `persistence/user_mapper.go`, executes an Ent builder with the same `ctx`, and translates known storage failures to core contract errors. The database's unique email rule resolves concurrent conflicts; a precheck alone cannot.
8. The repository maps the saved Ent entity back to domain. Neither generated methods nor loaded Ent edges cross into the service or handler.
9. The service returns the domain/result value. `dto/user_mapper.go` constructs `UserResponse`, deliberately exposing only public fields. The handler selects `201 Created`, `Location`, and JSON. Error classification selects a stable public message; raw driver and internal error strings remain private.

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

`GET /users/{id}` parses the path into a positive ID, calls the input port, and maps a domain result to a DTO. A missing record is a typed/inspectable not-found outcome, not `nil, nil`. The handler maps that outcome to the project's public `404` policy.

`GET /users/?offset=0&limit=50` has a bounded query contract. HTTP rejects malformed numbers; the application enforces valid limits for all callers; persistence applies a deterministic order including a unique tie-breaker. Do not label the current page length `total`: a total requires a separate count contract and possibly a consistency decision. A `limit+1` read can truthfully return `has_more` without a count. Offset pagination is a valid simple baseline; keyset pagination becomes appropriate when workload, consistency, or latency requires it. See [layers.md](layers.md#8-list-pagination-is-an-end-to-end-contract) and [data and transactions](data-and-transactions.md).

## 6. Composition and lifecycle

**Required baseline:** `cmd/api/main.go` owns the concrete object graph and process lifecycle. Start from validated configuration, create logging infrastructure and database resources, construct repositories, services, and the HTTP router, then run the server. Close resources at the boundary that opened them. A constructor should receive required dependencies; it should not find them through a global registry or `context.Value`.

The following is a wiring excerpt inside the process startup function, not a complete executable. `cfg`, `startupCtx`, `log`, and shutdown ownership have already been established there. The constructor signatures match the illustrative layer chapter; adapt existing constructors and their callers together when adopting these contracts.

```go
client, err := persistence.NewEntClient(startupCtx, cfg.Database)
if err != nil {
    return fmt.Errorf("open persistence: %w", err)
}
defer client.Close()

userRepo := persistence.NewUserRepository(client)
userSvc := service.NewUserService(userRepo, time.Now)
router := httpadapter.NewRouter(userSvc, log)
server := &http.Server{
    Addr:              cfg.HTTP.Address,
    Handler:           router,
    ReadHeaderTimeout: cfg.HTTP.ReadHeaderTimeout,
    ReadTimeout:       cfg.HTTP.ReadTimeout,
    WriteTimeout:      cfg.HTTP.WriteTimeout,
    IdleTimeout:       cfg.HTTP.IdleTimeout,
}
```

`httpadapter` aliases `internal/adapter/in/http`, avoiding collision with standard `net/http`. In actual startup code, handle the database close error according to the process logging policy. Server startup failure, graceful shutdown, readiness, secret handling, proxy trust, and resource bounds are covered in [security and operations](security-and-operations.md). The wiring excerpt is not a lifecycle implementation to paste without those requirements.

A startup root context or a separate bounded shutdown context is appropriate at composition. Replacing a request's context with `context.Background()` inside the service/repository is not. A middleware field named `TrID` is correlation only; it neither begins nor commits a database transaction.

**Required when multiple writes must succeed together:** the application determines the transaction boundary through an outbound transaction capability; the persistence adapter owns Ent's transaction mechanics. Every participating repository must use the transaction-bound client. Do not start an HTTP-wide transaction in generic middleware or expose `*ent.Tx` to core. The complete contracts and rollback/commit behavior belong in [data and transactions](data-and-transactions.md), not in a generic `Manager` layer.

## 7. Adding a feature without guessing folders

Suppose the next operation is `RenameUser`. Use this order to resolve ownership before implementation:

1. Define the business rule: who may rename, whether names must be unique, and whether an audit entry must commit atomically. Reuse existing policy; ask only genuinely unresolved semantics.
2. Add the domain transition to `core/domain/user.go` if it is a user invariant. Keep transport-only length/shape errors outside it, but ensure a non-HTTP caller cannot bypass domain validity.
3. Add `RenameUserCommand` and the operation to `core/port/in/usecase.go` (or the existing entity-specific file). Inputs include only application data. If an actor/tenant is required, use an explicit trusted application identity representation, not a raw HTTP header.
4. Add only required persistence capabilities to `core/port/out/repository.go`; choose update concurrency and transaction semantics deliberately. Do not expose `SetName` Ent builders or an unrestricted map of column changes.
5. Implement orchestration in `core/service/user_service.go`: load, authorize as needed, invoke domain behavior, persist, return. This is where the application chooses atomicity, not where it writes SQL.
6. Implement persistence behavior in `user_repo.go`, conversion in `user_mapper.go`, and any schema changes in `dao/schema` plus the project's migration workflow. Regenerate `dao/ent`; do not edit generated output to simulate a missing schema change.
7. Add the HTTP request/response shape in `dto/user.go` and mapping in `dto/user_mapper.go`, implement the controller operation in `handler/user.go`, and register its route in `router.go`.
8. Update the composition only for new dependencies. A new method on an already wired service does not justify a new facade or global registration.
9. Add domain, service, HTTP contract, and real database tests for the changed behavior. Review cancellation, safe errors, constraint mapping, and concurrency failure cases, not only the successful response. See [testing and evolution](testing-and-evolution.md).

A simple create/read use case may need only a handful of methods and no transaction abstraction. A cross-aggregate write with an outbox needs additional contracts because its guarantee is different, not because the project has reached an arbitrary number of files.

## 8. Growth: feature, module, bounded context, deployment

**Required baseline:** grow by cohesive capabilities inside this structure first. `UserService` can be small; it does not have to become the application-wide `ServiceManager`. The router can delegate registration to feature functions in the same HTTP adapter package when readability warrants it. An outbound email or payment capability belongs under `core/port/out` and an adapter under the existing `adapter/out` boundary; it does not belong in a domain method doing network I/O.

**Optional when packages become incohesive:** introduce entity/capability subpackages under existing layers, such as `core/domain/billing`, `core/port/in/billing`, `core/port/out/billing`, and `core/service/billing`, with matching adapter-local organization where useful. This is an explicit project-approved mapping, not the new default tree. Move a coherent capability, migrate imports, and keep the same dependency direction. Do not scatter a single invariant across subpackages merely to match table names. Go packages, a Go module (`go.mod`), a business bounded context, and a deployed service are different decisions.

**Required when bounded contexts have different semantics:** give each context ownership of its model, contracts, and storage access. A billing customer is not automatically an identity account because both have an email. Integrate through a narrow application contract or translated integration event; do not share a mutable ORM object or let one context write the other's tables through a convenient repository. A small monolith can keep these interactions as ordinary in-process calls, composed in `cmd/api`, without a message broker or HTTP hop. Clarify any transaction crossing those boundaries and avoid import cycles.

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

A useful violation report is specific: “`core/service/user_service.go` imports `dao/ent` and returns `*ent.User`; return the domain result through the inbound contract and move the Ent conversion into `persistence/user_mapper.go`.” “Not clean enough” is not an actionable review.
