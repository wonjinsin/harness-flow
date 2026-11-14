# Architecture handbook reference

This is shared authoring material for `harness-flow:setup`, not a replacement for
a project's accepted instructions. The default profile uses Go, Chi, Ent,
PostgreSQL, and Zerolog with clean/hexagonal boundaries. This handbook defines
the chosen structure and covers production failure cases. Dependency versions
are not architectural requirements; guidance alone does not prove compliance.

The goal is consistent decisions at the point of change: an agent should know
where code belongs, which dependencies are permitted, how a boundary fails, and
how the result is verified. A long reference is useful only when the relevant
parts are actually retrieved and translated into accepted project rules.

## Start here

1. Read [adoption](adoption.md) and resolve the user's storage/loading mode and
   intended readers before writing guidance. There is no automatic directory choice.
2. Read [architecture](go/architecture.md), [layers](go/layers.md),
   [coding conventions](go/coding-conventions.md), and
   [behavior ownership](go/behavior-ownership.md) for structure, responsibilities,
   concrete Go contracts, and code that reads naturally from top to bottom.
3. Select the additional chapters below by the behavior being introduced.
4. Produce guidance in the chosen mode with actual paths, stack-specific examples,
   explicit adoption decisions, and verified claims. Keep its entrypoint small.

## Reading by task

| Work or decision | Required reference material |
| --- | --- |
| Initial setup or refreshing generated guidance | Adoption and delivery/reader selection, architecture, layers, coding conventions, behavior ownership, then assess every chapter for applicability |
| New route, handler, DTO, inbound port, or vertical slice | Architecture, layers, coding conventions, behavior ownership, security/error mapping, testing |
| Business rule, entity, value object, read model, or collection calculation | Domain, coding conventions, behavior ownership, relevant layers, testing |
| Database write, transaction, uniqueness, concurrent update, pagination, cache, or migration | Data and transactions, behavior/domain ownership, testing |
| External HTTP call, job, webhook, retry, idempotency, broker, or event | Reliability and events, data atomicity, security/operations, testing |
| Authentication, authorization, tenancy, logging, configuration, or deployment | Security and operations, relevant data/reliability sections, testing |
| Refactor, legacy adoption, framework change, or new bounded context | Architecture, domain, testing/evolution, and the affected adapters |

A selected chapter is not a mandate to implement every pattern it discusses.
Read its applicability and carry only adopted rules into the project. Conversely,
calling something a PoC does not waive input safety, dependency boundaries,
context propagation, or truthful claims about atomicity.

## Chapters

### [Architecture and file placement](go/architecture.md)

The full canonical tree; inward dependency direction; runtime call direction;
composition; module growth; worked feature placement; profile-specific choices
versus portable rules. The default includes `core/port/in` and `core/port/out`,
not an invented feature-first replacement.

### [Layer-by-layer implementation](go/layers.md)

Router and middleware; handlers/controllers; request/response DTOs and mappers;
inbound application contracts; services; domain; outbound contracts; repositories,
DAO/schema/generated ORM code; configuration, shared packages, logging, and
composition. Includes correct examples and plausible violations.

### [Go coding conventions and quality tooling](go/coding-conventions.md)

Google-based naming and explicit provider/repository/transaction dependency roles; entity
pointers and defined plural pointer collections with small value-type exceptions;
named boundary inputs at five total parameters including context; blank lines
between function declarations; project-local pinned golangci-lint and local/CI
verification. The profile adds no gofumpt or custom analyzer and states where
built-in checks do not enforce a rule.

### [Behavior ownership and readable orchestration](go/behavior-ownership.md)

Top-to-bottom, book-like flow; ownership of composed decisions, collection
calculations, application inputs/results, DTO transformations and handwritten
DAO mapping. Includes a review-summary/duplicate-matching fragment, direct
behavior checks, and limits that keep I/O and transactions in their orchestrators.

### [Domain modeling and boundaries](go/domain.md)

Entities, value objects, aggregate invariants, domain/application services,
construction and rehydration, identity/time/money, bounded contexts and
anti-corruption, and the conditions under which simple CRUD should remain simple.

### [Data, context, transactions, and concurrent change](go/data-and-transactions.md)

Request context through persistence; existing repositories/providers resolve a
transaction from `txCtx`; SQL and Ent binding; rollback/cancellation/commit
ambiguity; uniqueness races and optimistic locking; query design; tenant scoping;
migrations and cache consistency.

### [Reliability, idempotency, and events](go/reliability-and-events.md)

External-call budgets and safe retries; idempotency state transitions; domain and
integration events; outbox/inbox algorithms and acknowledgment order; duplicates,
ordering, poison messages, concurrency, and irreversible external effects.

### [Security and operations](go/security-and-operations.md)

Identity, authorization and tenancy; input limits and secrets; safe public errors
with internal causes; logging/tracing/metrics; readiness, graceful shutdown,
resource budgets, rollout, recovery, and operational evidence.

### [Testing and evolution](go/testing-and-evolution.md)

Domain, service, HTTP, real-database, concurrency and contract checks; deterministic
failure scenarios; architectural enforcement choices; feature and module growth;
legacy adoption; framework drift; and what each kind of evidence does not prove.

### [Executable Go example](../examples/go/README.md)

A separate local teaching module with the same boundaries, real SQLite storage,
atomic user-and-audit writes, context propagation, HTTP mapping, and negative
paths. Its HTTP/SQL adapters are an explicit alternative to the canonical
Chi/Ent/PostgreSQL stack. It is not a production starter or a distributed-system
implementation.

## Canonical Go placement

These paths define the default Go profile, not a universal naming convention:

- Inbound use-case interfaces: `internal/core/port/in/`.
- Outbound read-provider, write-repository and transaction interfaces:
  `internal/core/port/out/`.
- HTTP request/response mapping: `internal/adapter/in/http/dto/user_mapper.go`.
- Default PostgreSQL storage:
  `internal/adapter/out/persistence/postgres/{provider,repository,db,dao}/`.
  Use the actual engine name for an adapted stack, not unused engine folders.
- Handwritten persistence mapping stays adapter-local; shared Ent mapping uses
  `postgres/dao/user_mapper.go`, separately from `dao/schema/` and generated
  `dao/ent/`.
- `cmd/api/main.go` composes concrete implementations. Domain-specific inbound
  implementations live in `internal/core/service/usecase/<domain>/`; real reused
  application stages use `service/shared/<capability>/`, composite workflows
  `service/orchestration/<workflow>/`. No peer-use-case/service calls or empty
  placeholder packages; pure business calculations stay in domain.

## Common PoC pitfalls

Preserve request contexts through services and repositories; do not replace them
with `context.Background()` for ordinary I/O. All-or-nothing writes across
repositories need an application-owned transaction: pass its callback's `txCtx`
to every participating repository/provider call. Do not pass repository bundles
or mutate shared clients. A request `TrID` is correlation, not a transaction handle.

An email existence precheck does not serialize concurrent creation. The database
constraint remains authoritative. Keep raw internal errors private, preserve
their causes, and map safe messages at the transport boundary. Empty test
directories are not proof of tested behavior.

## Strength of a rule

Use these labels in the project handbook:

- **Required baseline:** dependency direction, explicit boundary mapping, safe
  inputs and errors, ownership, and honest verification of the changed path.
- **Required when a named condition holds:** for example, shared-database
  all-or-nothing writes require an application transaction; reliable publication
  after a committed write requires an atomic publication record or equivalent.
- **Optional:** a mechanism whose absence does not break the declared contract.
- **Needs project decision:** a business policy, compatibility requirement,
  aggregate/tenant boundary, provider guarantee, or infrastructure constraint
  that the code and accepted documents do not establish.

Do not collapse these into a universal requirement to build full DDD,
microservices, distributed transactions, queues, caches, or circuit breakers.
