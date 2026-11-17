# Architecture handbook reference

This is shared authoring material for `harness-flow:setup`, not a replacement for
a project's accepted instructions. The default profile uses Go, Chi, Ent,
PostgreSQL, and Zerolog with clean/hexagonal boundaries. This handbook defines
the chosen structure and covers production failure cases. Dependency versions
are not architectural requirements; guidance alone does not prove compliance.

## Start here

1. Read [adoption](adoption.md) and resolve the user's storage/loading mode and
   intended readers before writing guidance. There is no automatic directory choice.
2. Read [architecture](go/architecture.md), [layers](go/layers.md),
   [coding conventions](go/coding-conventions.md), and
   [behavior ownership](go/behavior-ownership.md) for structure, responsibilities,
   concrete Go contracts, and code that reads naturally from top to bottom.
3. Select the additional chapters below by the behavior being introduced.

## Reading by task

| Work or decision | Required reference material |
| --- | --- |
| Initial setup or refreshing generated guidance | Adoption and delivery/reader selection, architecture, layers, coding conventions, behavior ownership, then assess every chapter for applicability |
| New route, handler, DTO, inbound port, or vertical slice | Architecture, layers, coding conventions, behavior ownership, security/error mapping, testing |
| Business rule, entity, value object, read model, or collection calculation | Domain, coding conventions, behavior ownership, relevant layers, testing |
| Database write, transaction, uniqueness, concurrent update, pagination, cache, or migration | Data and transactions, behavior/domain ownership, testing |
| External HTTP call, job, webhook, retry, idempotency, broker, or event | Reliability and events, data atomicity, security/operations, testing |
| Authentication, authorization, tenancy, response envelopes, execution IDs, logging, configuration, or deployment | Architecture's HTTP contract, layers' renderer/middleware, security and operations, relevant data/reliability sections, testing |
| Refactor, legacy adoption, framework change, or new bounded context | Architecture, domain, testing/evolution, and the affected adapters |

A selected chapter is not a mandate to implement every pattern it discusses.
Read its applicability and carry only adopted rules into the project. Conversely,
calling something a PoC does not waive input safety, dependency boundaries,
context propagation, or truthful claims about atomicity.

## Chapter owners

Read the selected chapter before authoring its rules; this index is a retrieval
map, not a second definition of the contracts.

| Chapter | Authoritative detail |
| --- | --- |
| [Adoption](adoption.md) | Delivery/reader selection, output depth, authority, refresh, semantic language adaptation and activation evidence |
| [Architecture](go/architecture.md) | Canonical tree and file placement, dependency direction, service-area call restrictions, composition and growth |
| [Layers](go/layers.md) | Complete create/get/list boundaries, commands and ports, HTTP/Ent mapping, safe errors and pagination |
| [Coding conventions](go/coding-conventions.md) | Go names and dependency roles, five-total-parameter boundary, command package, entity pointers/plural collections, spacing and project-local golangci-lint |
| [Behavior ownership](go/behavior-ownership.md) | Readable orchestration; composed decisions, collection calculations, application input/result behavior and representation mapping; worked fragment and direct checks |
| [Domain](go/domain.md) | Invariants, entities/values/aggregates, construction versus hydration, identity/time/money and bounded contexts |
| [Data and transactions](go/data-and-transactions.md) | Context propagation, existing adapters with `txCtx`, SQL/Ent binding and lifecycle, constraints/concurrency, queries, migrations and caches |
| [Reliability and events](go/reliability-and-events.md) | Deadlines, retries, idempotency, outbox/inbox, ordering, irreversible effects and reconciliation |
| [Security and operations](go/security-and-operations.md) | Identity/tenancy, input safety, private causes/public errors, execution-ID generation/propagation, flat JSON logs/caller/detail ownership, lifecycle, deployment and recovery |
| [Testing and evolution](go/testing-and-evolution.md) | Behavioral evidence at domain/service/HTTP/database boundaries, concurrency, enforcement, legacy adoption and framework drift |
| [Executable Go example](../examples/go/README.md) | Local SQLite/standard-library HTTP adaptation with atomic user/audit writes and negative paths; not proof of Chi/Ent/PostgreSQL or production readiness |

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
