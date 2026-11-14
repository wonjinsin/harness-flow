# Data access and transactions

This chapter extends the canonical Chi/Ent/PostgreSQL profile while preserving the ports-and-adapters layout. Read [architecture](architecture.md) for package direction, [coding conventions](coding-conventions.md) for typing/naming/signature rules, [domain](domain.md) for invariant ownership, [layers](layers.md) for mapping/error boundaries, and [reliability and events](reliability-and-events.md) for idempotency, outbox delivery, external effects, and reconciliation. The [runnable Go example](../../examples/go) is a deliberately different SQLite/standard-library HTTP adaptation, not proof of PostgreSQL isolation behavior.

## Adoption levels and implementation boundaries

- **Required baseline:** pass `context.Context` from inbound request through service/port/adapter to every database operation; parameterize values; enforce database constraints; scope access by trusted authority; bound queries and release resources.
- **Required when one operation must write several records atomically:** the application owns one transaction boundary and receives transaction-scoped repositories sharing exactly one transaction handle. Reuse the common `WithinTransaction` contract for the same consistency boundary; a separate UoW type is not required per operation or domain. No root-client escape.
- **Required when concurrent writes can overwrite decisions:** use a conditional write, version check, suitable lock, or serializable transaction chosen for the actual invariant.
- **Required when deploying schema changes to a running service:** reviewed versioned migrations and an explicit old/new application compatibility window.
- **Optional:** caching, read replicas, separate read models, stronger isolation, and asynchronous propagation. Each changes observable guarantees and needs a reason.
- **Needs project decision:** which facts must commit together, conflict semantics, uniqueness scope, tenant model, isolation, deadlines, stale-read tolerance, retry safety, compatibility window, and treatment of an uncertain commit outcome.

Read-provider methods such as `Find/List` and write-repository methods such as `Insert/Save` must accept caller context; do not discard service context or replace it with `context.Background()` inside adapters. Database reads belong in `internal/adapter/out/persistence/postgres/provider`, writes and application transaction-scope assembly in `postgres/repository`, reusable pool/transaction lifecycle mechanics in `postgres/db`, and generated Ent code in `postgres/dao/ent`. Handwritten shared mapping can live in `postgres/dao/*_mapper.go` (separate from generated code), or beside its adapter owner; never put mapping/business SQL in `db`. `db` must not import `provider` or `repository`. An email existence precheck does not replace the database unique constraint. A request `TrID` is correlation, **not** a database transaction. The transaction infrastructure in this chapter must be implemented explicitly.

## 1. Propagate cancellation all the way to the driver

**Required baseline:** `ctx` is the first parameter of inbound use cases and outbound I/O operations. Start with `r.Context()` in an HTTP handler; pass it unchanged unless deriving a deliberately shorter deadline. Use `ExecContext`, `QueryContext`, `QueryRowContext`, `BeginTx`, and Ent's `Save(ctx)`, `Only(ctx)`, `All(ctx)` equivalents. Never replace it with `Background()` to make a timed-out operation finish.

A context is cancellation/deadline/request metadata, not an implicit dependency container. Do not store an untyped `*sql.Tx` or `*ent.Tx` in it and make repositories guess whether to use a transaction. Explicit transaction-scoped interfaces below make that choice visible and testable.

This handler fragment assumes the existing handler owns an inbound port `h.userUseCase` and an existing `cmd` of the port's command type; it shows only the context handoff, not a complete HTTP response implementation:

```go
ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
defer cancel()
result, err := h.userUseCase.CreateUser(ctx, cmd)
```

The two-second budget is illustrative, not a universal production default. Put the configured budget in the layer that owns the operation; a query-specific adapter budget may shorten but must not lengthen its caller's deadline. Do not store per-request contexts in long-lived services or repositories. Pure domain calculations usually take values, not context.

**Correct:** a repository calls `r.tx.QueryRowContext(ctx, query, args...)`; an Ent adapter uses its scoped client and `.Save(ctx)`.

**Incorrect:** a service accepts `ctx` but calls `repo.Save(user)`, and the adapter silently creates `context.Background()`. Request cancellation then cannot release blocked pool acquisition, lock waits, or query work promptly.

For `database/sql`, the context supplied to `BeginTx` is used until commit/rollback; cancellation causes the SQL package to roll the transaction back, and commit returns an error if that context was canceled. Driver/server cancellation still needs an integration test with the actual driver. Cancellation is not proof that a server-side commit never happened when it races with commit or the connection fails.

**Verification cases:** cancel before pool acquisition, during a lock wait/query, after the first write, and immediately before commit. Confirm no continuing request-owned goroutine, no reusable open transaction, and no partial committed business state on an acknowledged rollback. Include a deadline shorter than a lock wait. An independent worker may use a service-owned shutdown context only after work has been durably accepted; do not detach an HTTP request into an untracked goroutine.

## 2. Application-owned atomicity without a root-client escape

### Choose the boundary from a business fact

If “reserve inventory and record the reservation” must be atomic, put both writes in one application transaction. Having `StockRepository.TryReserve` and `ReservationRepository.Insert` each start their own transaction does **not** satisfy it. Conversely, do not open a transaction around an entire HTTP request when only two short writes require atomicity. A single atomic SQL statement needs no additional callback wrapper unless it participates in a wider multi-operation invariant.

Ports belong in `internal/core/port/out`; the service depends on them using the `outport` alias. The adapter owns `*sql.DB`, `*sql.Tx`, `*ent.Client`, and `*ent.Tx`. Neither transaction implementation enters core.

Default to one shared `Transactor.WithinTransaction` execution contract for operations using the same database, tenant/lock policy, isolation policy, and atomicity scope. Reuse it across services and domains within that consistency boundary; a new use case or domain name alone is not a reason to introduce another runner or `WithX`/`Tx`/`UoW` layer. “Unit of work” can describe the pattern, and a project may keep that name, but a separately named UoW type is optional, not an architectural requirement. Split contracts only for concrete differences such as another database, a distinct tenant/locking or isolation policy, or an intentionally restricted transaction capability. State the difference rather than mechanically renaming one per-operation UoW to one per-operation transactor.

The next three sections form one scoped example using the reservation model from [domain](domain.md). Its example module path is `example.com/reservations`; substitute the target module path when adapting it. Stock plus reservation is a real cross-domain operation, so `service/orchestration/reservation` owns it without calling stock/reservation use cases or peer services, even through interfaces. The transaction callback cannot start a nested transaction, commit, roll back, or access a root client through its port. The orchestration deliberately has **no separately injected root stock/reservation providers or repositories** to capture accidentally.

### Outbound port: a typed transaction scope

`internal/core/port/out/reservation.go`:

```go
package outport

import (
    "context"
    "errors"

    "example.com/reservations/internal/core/domain"
)

var ErrStockUnavailable = errors.New("stock unavailable")

type StockRepository interface {
    TryReserve(context.Context, domain.TenantID, domain.SKU, int64) error
}

type ReservationRepository interface {
    Insert(context.Context, *domain.Reservation) error
}
```

`internal/core/port/out/transaction.go` declares the shared execution contract and its typed scope:

```go
package outport

import (
    "context"
    "fmt"
)

type Transactor interface {
    WithinTransaction(context.Context, func(Transaction) error) error
}

type Transaction interface {
    StockRepo() StockRepository
    ReservationRepo() ReservationRepository
}

// CommitError identifies the failing phase; its cause determines whether the
// outcome is known aborted or requires reconciliation.
type CommitError struct {
    Cause error
}

func (e *CommitError) Error() string { return fmt.Sprintf("commit failed: %v", e.Cause) }

func (e *CommitError) Unwrap() error { return e.Cause }
```

`Transaction` exposes the typed repositories needed by this application's consistency boundary, not every repository in the process. Other operations with the same policies reuse `Transactor` and this scope; do not create reservation-specific runners merely because this example reserves stock. Keep domain repository contracts in their domain files and shared execution declarations in `transaction.go`. Neither a universal all-repository object nor a generic `Tx[T]` framework is required. Reads belong to providers, not write repositories: when a decision requires transactional reads, add a narrow scoped read-provider accessor constructed from the same transaction handle. Never inject/call an independent root provider inside the callback, retain the scope/providers/repositories beyond it, or launch goroutines that outlive it.

### Inbound command package and interface

`internal/core/port/in/command/reservation.go`:

```go
package command

import "example.com/reservations/internal/core/domain"

type ReserveCommand struct {
    ID       domain.ReservationID
    Tenant   domain.TenantID
    SKU      domain.SKU
    Quantity int64
}
```

`internal/core/port/in/reservation.go`:

```go
package inport

import (
    "context"

    "example.com/reservations/internal/core/domain"
    "example.com/reservations/internal/core/port/in/command"
)

type ReservationUseCase interface {
    Reserve(context.Context, command.ReserveCommand) (*domain.Reservation, error)
}
```

The interface imports the child command package; that package must not import
its parent `in` or the concrete service. Query and result types stay in the parent
port package. Defining inputs on the implementation or importing the parent
from `command` would invert the boundary and can create an import cycle.

### Application orchestration: return success only after commit

`internal/core/service/orchestration/reservation/orchestration.go`; `Clock` is a consumer-owned dependency wired by composition. The command belongs to the inbound contract above. `Tenant` must come from trusted authentication/authorization resolution, not an unchecked JSON field.

```go
package reservation

import (
    "context"
    "fmt"
    "time"

    "example.com/reservations/internal/core/domain"
    inport "example.com/reservations/internal/core/port/in"
    "example.com/reservations/internal/core/port/in/command"
    outport "example.com/reservations/internal/core/port/out"
)

type Clock interface {
    Now() time.Time
}

type Orchestration struct {
    transactor outport.Transactor
    clock      Clock
}

var _ inport.ReservationUseCase = (*Orchestration)(nil)

func NewOrchestration(transactor outport.Transactor, clock Clock) *Orchestration {
    return &Orchestration{transactor: transactor, clock: clock}
}

func (s *Orchestration) Reserve(ctx context.Context, cmd command.ReserveCommand) (*domain.Reservation, error) {
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    reservation, err := domain.NewReservation(cmd.ID, cmd.Tenant, cmd.SKU, cmd.Quantity, s.clock.Now())
    if err != nil {
        return nil, err
    }
    err = s.transactor.WithinTransaction(ctx, func(tx outport.Transaction) error {
        if err := tx.StockRepo().TryReserve(ctx, cmd.Tenant, cmd.SKU, cmd.Quantity); err != nil {
            return fmt.Errorf("reserve inventory: %w", err)
        }
        if err := tx.ReservationRepo().Insert(ctx, reservation); err != nil {
            return fmt.Errorf("record reservation: %w", err)
        }
        return nil
    })
    if err != nil {
        return nil, err
    }
    return reservation, nil
}
```

The example accepts a preallocated reservation ID to keep identity policy separate; a real inbound adapter must not grant arbitrary authority by accepting IDs. An idempotency workflow can resolve/generate a stable ID before execution. This example is atomic, but does not by itself implement an idempotency protocol.

**Incorrect:** return the reservation, emit a success response, publish to a broker, or invalidate shared cache inside the callback. The transaction may fail afterward. An HTTP socket failure after successful commit also cannot undo that commit.

**Verification cases:** stock failure causes no reservation insert; insert failure leaves stock unchanged; commit failure returns no successful result; successful response is produced only after a successful commit; inspection of the service constructor and callback shows no root repository/client dependency.

## 3. Explicit PostgreSQL / `database/sql` implementation

**Scope:** this is an alternative adapter to Ent, not an additional persistence stack required by the canonical blueprint. The SQL implements the same ports. Every write repository contains only `*sql.Tx`; it cannot fall back to a root `*sql.DB`.

### Schema assumptions and constraints

The example assumes a tenant-qualified stock key and reservation key. Foreign keys include tenant so that two individually valid IDs cannot form a cross-tenant association. The parent tenant table and its authorization model are project-specific; positive tenant IDs here do not constitute authorization.

```sql
CREATE TABLE stocks (
    tenant_id bigint NOT NULL CHECK (tenant_id > 0),
    sku text NOT NULL CHECK (sku <> '' AND sku = btrim(sku)),
    available bigint NOT NULL CHECK (available >= 0),
    PRIMARY KEY (tenant_id, sku)
);

CREATE TABLE reservations (
    tenant_id bigint NOT NULL CHECK (tenant_id > 0),
    id text NOT NULL CHECK (id <> ''),
    sku text NOT NULL,
    quantity bigint NOT NULL CHECK (quantity > 0),
    state text NOT NULL CHECK (state IN ('active', 'released')),
    created_at timestamptz NOT NULL,
    released_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, sku) REFERENCES stocks (tenant_id, sku),
    CHECK (
        (state = 'active' AND released_at IS NULL) OR
        (state = 'released' AND released_at IS NOT NULL AND released_at >= created_at)
    )
);

CREATE INDEX reservations_tenant_created_id
    ON reservations (tenant_id, created_at DESC, id DESC);
```

Constraints mirror only the example's accepted facts. `btrim` and Go's Unicode-aware `TrimSpace` are not identical normalization operations: the application/domain admission rule is stricter for additional whitespace characters. Do not claim their equivalence. If exact storage-level SKU canonicalization is required, define a matching database expression/collation or a persisted canonical key and migrate existing values.

### Reusable SQL lifecycle mechanics

`internal/adapter/out/persistence/postgres/db/transaction_error.go` supplies the mechanics-layer phase marker used by either alternative:

```go
package db

import "fmt"

// CommitError identifies a commit-phase failure without classifying its outcome.
type CommitError struct {
    Cause error
}

func (e *CommitError) Error() string { return fmt.Sprintf("commit failed: %v", e.Cause) }

func (e *CommitError) Unwrap() error { return e.Cause }
```

`internal/adapter/out/persistence/postgres/db/sql_transaction.go` owns generic begin/rollback/commit, not stock/reservation scope construction:

```go
package db

import (
    "context"
    "database/sql"
    "errors"
    "fmt"
)

func WithinSQLTransaction(ctx context.Context, pool *sql.DB, options *sql.TxOptions,
    fn func(*sql.Tx) error) (err error) {
    tx, err := pool.BeginTx(ctx, options)
    if err != nil {
        return fmt.Errorf("begin transaction: %w", err)
    }
    defer func() {
        // Also executes during panic unwinding. The original panic propagates.
        rollbackErr := tx.Rollback()
        if rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
            err = errors.Join(err, fmt.Errorf("rollback transaction: %w", rollbackErr))
        }
    }()
    if err = fn(tx); err != nil {
        return err
    }
    if err = ctx.Err(); err != nil {
        return err
    }
    if err = tx.Commit(); err != nil {
        return &CommitError{Cause: err}
    }
    return nil
}
```

### Shared SQL transactor and scoped writes

`internal/adapter/out/persistence/postgres/repository/transaction_sql.go` assembles the shared transaction scope:

```go
package repository

import (
    "context"
    "database/sql"
    "errors"

    postgresdb "example.com/reservations/internal/adapter/out/persistence/postgres/db"
    outport "example.com/reservations/internal/core/port/out"
)

type SQLTransactor struct {
    pool *sql.DB
}

func NewSQLTransactor(pool *sql.DB) *SQLTransactor {
    return &SQLTransactor{pool: pool}
}

var _ outport.Transactor = (*SQLTransactor)(nil)

type sqlTransaction struct {
    stockRepo       *sqlStockRepository
    reservationRepo *sqlReservationRepository
}

func (s sqlTransaction) StockRepo() outport.StockRepository { return s.stockRepo }

func (s sqlTransaction) ReservationRepo() outport.ReservationRepository {
    return s.reservationRepo
}

func (t *SQLTransactor) WithinTransaction(ctx context.Context,
    fn func(outport.Transaction) error) error {
    err := postgresdb.WithinSQLTransaction(ctx, t.pool,
        &sql.TxOptions{Isolation: sql.LevelReadCommitted}, func(tx *sql.Tx) error {
            return fn(sqlTransaction{
                stockRepo:       &sqlStockRepository{tx: tx},
                reservationRepo: &sqlReservationRepository{tx: tx},
            })
        })
    var commitErr *postgresdb.CommitError
    if errors.As(err, &commitErr) {
        // Preserve the complete lifecycle error, including a joined rollback cause.
        return &outport.CommitError{Cause: err}
    }
    return err
}
```

`internal/adapter/out/persistence/postgres/repository/reservation_sql.go` implements the domain-specific write contracts:

```go
package repository

import (
    "context"
    "database/sql"
    "fmt"

    "example.com/reservations/internal/core/domain"
    outport "example.com/reservations/internal/core/port/out"
)

type sqlStockRepository struct {
    tx *sql.Tx
}

func (r *sqlStockRepository) TryReserve(ctx context.Context,
    tenant domain.TenantID, sku domain.SKU, quantity int64) error {
    if tenant <= 0 || sku == "" || quantity <= 0 {
        return domain.ErrInvalidReservation
    }
    result, err := r.tx.ExecContext(ctx, `
        UPDATE stocks
           SET available = available - $3
         WHERE tenant_id = $1 AND sku = $2 AND available >= $3`,
        int64(tenant), string(sku), quantity)
    if err != nil {
        return fmt.Errorf("decrement stock: %w", err)
    }
    n, err := result.RowsAffected()
    if err != nil {
        return fmt.Errorf("stock affected rows: %w", err)
    }
    if n != 1 {
        return outport.ErrStockUnavailable
    }
    return nil
}

type sqlReservationRepository struct {
    tx *sql.Tx
}

func (r *sqlReservationRepository) Insert(ctx context.Context, reservation *domain.Reservation) error {
    if reservation == nil {
        return domain.ErrInvalidReservation
    }
    s := reservation.Snapshot()
    if s.State != domain.ReservationActive {
        return domain.ErrInvalidReservation
    }
    _, err := r.tx.ExecContext(ctx, `
        INSERT INTO reservations
            (tenant_id, id, sku, quantity, state, created_at, version)
        VALUES ($1, $2, $3, $4, $5, $6, 1)`,
        int64(s.TenantID), string(s.ID), string(s.SKU), s.Quantity,
        string(s.State), s.CreatedAt)
    if err != nil {
        return fmt.Errorf("insert reservation: %w", err)
    }
    return nil
}
```

The code uses `errors.Join` (Go 1.20+); keep the target Go compatibility policy explicit. `ReadCommitted` is sufficient for **this particular** guarded decrement plus insert: the database serializes updates of the same stock row and rechecks the `available >= quantity` predicate. A pre-read followed by `UPDATE available = oldAvailable - quantity` would not have that property. The adapter maps “missing stock” and “insufficient stock” to the same public error deliberately; separate them only if the application contract needs and may disclose the distinction.

The deferred rollback is harmless after SQL commit (`sql.ErrTxDone`) and runs on callback error, cancellation before commit, and panic. It does not swallow a panic. A rollback failure is joined with a normal returned failure; during a panic, preserve the panic and use the application's existing panic/operational reporting path if rollback failure visibility is required. Do not recover and return `nil`. Cleanup is an attempt to end an open transaction, not a guarantee that a remote database received it after a network failure.

The `ctx.Err()` check reduces unnecessary commit attempts after cancellation; cancellation may still race after the check. Do not add a post-commit cancellation check that turns an acknowledged successful commit into an apparent rollback. See the outcome rules below.

**Incorrect:** one repository receives `tx` but another is built with the root pool; a helper performs its insert through `pool.ExecContext`; or a shared `{pool, tx}` repository chooses the root database when `tx == nil`. A separately injected root read provider also escapes the scope and can observe independent state. A generalized executor interface can be appropriate for genuinely shared query code, but construct transaction providers/repositories only from the exact scoped handle and do not add fallback logic. The repository imports `postgres/db`, never the reverse.

**Verification cases:** induce a reservation constraint failure after the decrement and verify stock is unchanged using a new independent connection; cause callback panic and recover outside `WithinTransaction`, then verify rollback and pool reuse; cancel after decrement; simulate commit failure; use a pool with more than one connection so root-client escape cannot hide behind accidental connection reuse. Trace/assert that both repositories execute on the same transaction. Do not launch asynchronous work inside the callback.

## 4. Concrete Ent adaptation

The production blueprint keeps schemas in `internal/adapter/out/persistence/postgres/dao/schema` and generated code in `postgres/dao/ent`. Map generated objects to domain entities/values in handwritten `postgres/dao/user_mapper.go` or the equivalent feature mapper, or an adapter-owner local mapper. Core never imports `dao/ent`; `db` contains neither mapping nor business SQL.

**Required when using Ent transactions:** the reusable lifecycle helper calls `client.Tx(ctx)` (or `BeginTx` for explicit supported isolation); repository-owned scope assembly obtains `tx.Client()` and builds **every** callback repository and any scoped read provider from that transactional client. Passing the root client to even one constructor escapes the transaction. Ent builders must receive the same propagated operation context.

### Generated API assumptions

The following adapter is concrete for schemas with these fields:

- `Stock`: ordinary generated integer ID; `field.Int64("tenant_id")`, `field.String("sku")`, `field.Int64("available")`; a unique index on `tenant_id, sku`.
- `Reservation`: `field.String("id").Immutable()` overrides Ent's default ID type; `field.Int64("tenant_id")`, `field.String("sku")`, `field.Int64("quantity")`, `field.String("state")`, `field.Time("created_at")`, and `field.Time("released_at").Optional().Nillable()`; `field.Int64("version").Default(1)` if adopting the optimistic-concurrency example below.

Use reviewed migration SQL to add the appropriate check constraints and tenant-qualified references. Declaring these field names alone is not equivalent to the PostgreSQL schema above. In particular, this Ent variant has a **globally unique string reservation ID**, unlike the SQL example's composite primary key; choose that identity policy explicitly or configure composite identity using the project's supported Ent features. The tenant predicate is still required even with a globally unique ID. These are alternative schema adaptations, not interchangeable generated code for the source's existing `User` schema.

### Reusable Ent lifecycle mechanics

`internal/adapter/out/persistence/postgres/db/ent_transaction.go` uses the same `CommitError` from `transaction_error.go` above. Adopt this helper instead of the SQL helper when using Ent; neither alternative requires a second persistence stack:

```go
package db

import (
    "context"
    "database/sql"
    "errors"
    "fmt"

    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent"
)

func WithinEntTransaction(ctx context.Context, client *ent.Client, options *sql.TxOptions,
    fn func(*ent.Tx) error) (err error) {
    tx, err := client.BeginTx(ctx, options)
    if err != nil {
        return fmt.Errorf("begin transaction: %w", err)
    }
    committed := false
    defer func() {
        if committed {
            return
        }
        // Runs for errors, cancellation, commit failure, and panics.
        rollbackErr := tx.Rollback()
        if rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
            err = errors.Join(err, fmt.Errorf("rollback transaction: %w", rollbackErr))
        }
    }()
    if err = fn(tx); err != nil {
        return err
    }
    if err = ctx.Err(); err != nil {
        return err
    }
    if err = tx.Commit(); err != nil {
        return &CommitError{Cause: err}
    }
    committed = true
    return nil
}
```

### Shared Ent transactor and scoped repositories

`internal/adapter/out/persistence/postgres/repository/transaction_ent.go` is the alternative implementation of the same shared transaction contract:

```go
package repository

import (
    "context"
    "database/sql"
    "errors"

    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent"
    postgresdb "example.com/reservations/internal/adapter/out/persistence/postgres/db"
    outport "example.com/reservations/internal/core/port/out"
)

type EntTransactor struct {
    client *ent.Client
}

func NewEntTransactor(client *ent.Client) *EntTransactor {
    return &EntTransactor{client: client}
}

var _ outport.Transactor = (*EntTransactor)(nil)

type entTransaction struct {
    stockRepo       *entStockRepository
    reservationRepo *entReservationRepository
}

func (s entTransaction) StockRepo() outport.StockRepository { return s.stockRepo }

func (s entTransaction) ReservationRepo() outport.ReservationRepository {
    return s.reservationRepo
}

func (t *EntTransactor) WithinTransaction(ctx context.Context,
    fn func(outport.Transaction) error) error {
    err := postgresdb.WithinEntTransaction(ctx, t.client,
        &sql.TxOptions{Isolation: sql.LevelReadCommitted}, func(tx *ent.Tx) error {
            client := tx.Client()
            return fn(entTransaction{
                stockRepo:       &entStockRepository{client: client},
                reservationRepo: &entReservationRepository{client: client},
            })
        })
    var commitErr *postgresdb.CommitError
    if errors.As(err, &commitErr) {
        return &outport.CommitError{Cause: err}
    }
    return err
}
```

`internal/adapter/out/persistence/postgres/repository/reservation_ent.go` implements the same domain-specific write contracts using Ent:

```go
package repository

import (
    "context"
    "fmt"

    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent"
    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent/stock"
    "example.com/reservations/internal/core/domain"
    outport "example.com/reservations/internal/core/port/out"
)

type entStockRepository struct {
    client *ent.Client
}

func (r *entStockRepository) TryReserve(ctx context.Context,
    tenant domain.TenantID, sku domain.SKU, quantity int64) error {
    if tenant <= 0 || sku == "" || quantity <= 0 {
        return domain.ErrInvalidReservation
    }
    n, err := r.client.Stock.Update().
        Where(stock.TenantIDEQ(int64(tenant)), stock.SkuEQ(string(sku)),
            stock.AvailableGTE(quantity)).
        AddAvailable(-quantity).
        Save(ctx)
    if err != nil {
        return fmt.Errorf("decrement stock: %w", err)
    }
    if n != 1 {
        return outport.ErrStockUnavailable
    }
    return nil
}

type entReservationRepository struct {
    client *ent.Client
}

func (r *entReservationRepository) Insert(ctx context.Context, reservation *domain.Reservation) error {
    if reservation == nil {
        return domain.ErrInvalidReservation
    }
    s := reservation.Snapshot()
    if s.State != domain.ReservationActive {
        return domain.ErrInvalidReservation
    }
    _, err := r.client.Reservation.Create().
        SetID(string(s.ID)).
        SetTenantID(int64(s.TenantID)).
        SetSku(string(s.SKU)).
        SetQuantity(s.Quantity).
        SetState(string(s.State)).
        SetCreatedAt(s.CreatedAt).
        Save(ctx)
    if err != nil {
        return fmt.Errorf("insert reservation: %w", err)
    }
    return nil
}
```

Ent's generated API depends on field names/types/features; generate against the actual schema instead of copying `TenantIDEQ` or setters into an incompatible model. The documented SQL driver supports `BeginTx` isolation options; verify the selected dialect/driver supports the requested level. Avoid `SaveX`/`OnlyX` in routine request paths: normal storage errors should return as errors, not become panics.

Map Ent entities into domain snapshots inside the adapter before returning. Do not leak an Ent entity retaining its transactional driver or lazy edge queries outside the scope. Ent's `Unwrap()` supports edge queries after a successfully committed transaction; returning mapped domain/read models avoids this coupling. Never call `Unwrap()` blindly on arbitrary/nontransactional entities; it can panic. Ent transaction hooks are not a durable broker-delivery guarantee.

**Incorrect:** `stockRepo: newStockRepo(tx.Client()), reservationRepo: newReservationRepo(t.client)` looks almost correct but makes the insert independent of rollback. The same escape can hide in a scoped provider, hook, mapper, or helper that closes over the root client.

**Verification cases:** repeat the SQL failure/panic/cancel/commit tests against Ent and PostgreSQL; verify generated constraints with the actual migration; test hook/helper paths; prove a returned domain object performs no later database query.

## 5. Commit outcomes, rollback, and retry boundaries

**Required baseline:** distinguish operation failure from proof of rollback. A database transaction is atomic at the database; the caller may not learn its final outcome after a network failure.

| Observation | Application meaning |
| --- | --- |
| Begin fails before a transaction is obtained | No callback writes were issued by this attempt |
| Callback fails, and rollback is acknowledged | This transaction did not commit its transactional writes |
| Callback panics | Attempt rollback; propagate panic; never report success |
| Commit returns `nil` | Database commit was acknowledged; return success even if a later socket write fails |
| Database reports an explicit serialization abort/deadlock abort | This transaction failed; a safe whole-operation retry may be possible |
| Commit loses connection/response | Outcome may be unknown; do not assert no rows committed or blindly replay effects |
| Request cancels near commit | Classify from actual driver/server outcome; cancellation alone is not a universal rollback proof |

`CommitError` identifies the phase, not a universal classification. Preserve underlying causes with `%w`/`Unwrap`; inspect structured driver codes, not strings. A definite PostgreSQL `40001` serialization failure differs from a connection break while waiting for commit acknowledgment. A failed rollback on a broken connection does not resolve uncertainty.

**Required when retried operations matter:** define an operation identity and durable lookup/reconciliation path. Consult [reliability and events](reliability-and-events.md) for the idempotency protocol, conflict handling, durable outbox, and delivery acknowledgments. Do not claim exactly-once delivery or assume a second request is safe merely because the first returned an error.

Do not retry only the final `UPDATE` or `Commit` after a serialization failure. A transaction that is aborted cannot continue; retry the entire transaction with fresh reads and reconstructed/mutation-reset domain state. Automatic retries need a bounded attempt/deadline policy and a callback free of unreplayable side effects. Do not silently add retries to every repository method. A mutated in-memory aggregate or accumulated event slice must not be reused as though the previous attempt never ran.

**Incorrect:** `if err != nil { return "nothing changed" }`, or send a payment-provider request inside a callback and repeat it after a database conflict. The payment is outside the database transaction.

**Verification cases:** explicit server-side abort, lost commit acknowledgment with eventual database state inspected through a new connection, duplicate client request, and cancellation racing commit. Observe both “committed but response lost” and “aborted” paths in a controlled integration/fault-injection environment. Tests that only mock `Commit()` returning an error prove response handling, not the remote commit outcome.

## 6. Uniqueness races and database constraints

**Required when a value must be unique:** implement the database constraint under the same equivalence and scope used by the application. A precheck can improve feedback, but it cannot enforce uniqueness across processes.

For an illustrative tenant-scoped, already canonicalized account email key:

```sql
ALTER TABLE users
    ADD CONSTRAINT users_tenant_email_key_unique UNIQUE (tenant_id, email_key);
```

This assumes `tenant_id` and `email_key` are `NOT NULL` and existing rows have been canonicalized/deduplicated. Choose whether soft-deleted keys can be reused: if only active rows are unique, PostgreSQL supports a matching partial unique index. Nullable keys and collations change uniqueness semantics; choose them deliberately. Do not lower-case historical emails as an incidental repository fix; see [domain normalization](domain.md#normalize-only-under-an-explicit-equivalence-relation).

The race is: A finds no email, B finds no email, A inserts, B inserts. With the correct unique constraint, one insert fails. Translate that **specific** constraint violation at the adapter boundary into `outport.ErrEmailTaken`; do not classify every integrity error as duplicate email.

This independent write-repository fragment belongs in `internal/adapter/out/persistence/postgres/repository/user_error.go` (or a shared handwritten `postgres/dao` error helper used by both read/write adapters). It is for pgx v5's PostgreSQL error type, used directly or via a `database/sql` driver path that retains it. It preserves the original cause and supports `errors.Is` without leaking it as a public message. `outport.ErrEmailTaken` is the application's declared sentinel; use its existing equivalent rather than introducing a duplicate.

```go
package repository

import (
    "errors"
    "fmt"

    outport "example.com/reservations/internal/core/port/out"
    "github.com/jackc/pgx/v5/pgconn"
)

type classifiedWriteError struct {
    kind  error
    cause error
}

func (e *classifiedWriteError) Error() string { return e.kind.Error() }

func (e *classifiedWriteError) Unwrap() error { return e.cause }

func (e *classifiedWriteError) Is(target error) bool { return target == e.kind }

func mapUserInsertError(err error) error {
    if err == nil {
        return nil
    }
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) && pgErr.Code == "23505" &&
        pgErr.ConstraintName == "users_tenant_email_key_unique" {
        return &classifiedWriteError{kind: outport.ErrEmailTaken, cause: err}
    }
    return fmt.Errorf("insert user: %w", err)
}
```

For Ent, `ent.IsConstraintError(err)` is a useful broad guard but does not establish **which** unique/check/foreign-key constraint failed. Whether the structured driver cause remains reachable depends on generated Ent/runtime versions and wrappers. Inspect the actual error chain in an adapter integration test; do not parse localized SQL error text or silently map all Ent constraint failures to `ErrEmailTaken`. Other drivers need their own typed classifier. Never execute another ordinary statement in a failed PostgreSQL transaction to “check what happened” without rollback/savepoint policy; most statement errors leave that transaction aborted.

**Incorrect:** enforce uniqueness only with `FindByEmail`, an application mutex, or `ent.IsConstraintError => email taken`. A foreign-key or check failure would be mislabeled and operationally hidden.

**Verification cases:** synchronize two independent connections at a barrier before insert; one succeeds and one gets the domain/application conflict; same key in separate tenants follows policy; different unique/foreign-key/check errors retain their actual classification; canonicalization variants collide only according to the agreed rule. Assert the constraint exists in the deployed migration, not only in a Go struct tag.

## 7. Reject lost updates with an explicit concurrency protocol

**Required when saving a previously read state can overwrite another writer:** persist an expected version and advance it atomically. A transaction alone at PostgreSQL's default isolation does not make “read, mutate in memory, save all columns” safe.

For the SQL reservation schema above, a successful release expects the version loaded with the reservation and its active state:

```sql
UPDATE reservations
   SET state = 'released', released_at = $4, version = version + 1
 WHERE tenant_id = $1 AND id = $2
   AND version = $3 AND state = 'active';
```

Use the domain's validated release instant, not a caller's arbitrary timestamp. Check `RowsAffected() == 1`; zero means no authorized matching current state. Treat it as the application's conflict/not-found outcome without revealing another tenant's data. Do not retry this update without reloading and deciding the intended command again. If returning inventory is part of release, perform the conditional release and inventory increment in the **same** application transaction; roll back both when either fails.

In Ent, under the schema assumptions above, the equivalent update fragment uses generated `reservation` predicates and the scoped client. Here `tenant`, `id`, `expectedVersion`, and `releasedAt` are validated values loaded/computed by the use case:

```go
n, err := scopedClient.Reservation.Update().
    Where(reservation.TenantIDEQ(int64(tenant)),
        reservation.IDEQ(string(id)),
        reservation.VersionEQ(expectedVersion),
        reservation.StateEQ("active")).
    SetState("released").
    SetReleasedAt(releasedAt).
    AddVersion(1).
    Save(ctx)
```

The enclosing repository must propagate `err` and return a conflict unless `n == 1`; do not treat zero affected rows as success. Prefer `Update().Where(...).Save(ctx)` returning a count when the contract needs this check; generated single-entity helpers have their own not-found behavior. A read-provider metadata result can hold `{Entity *domain.Reservation, Version int64}` without making a persistence version part of business identity. An HTTP `ETag`/`If-Match` adaptation must preserve the same expected-version rule and map its precondition failure consistently.

Alternatives depend on the rule: a guarded arithmetic update, as in stock reservation, avoids stale read/overwrite; `SELECT ... FOR UPDATE` serializes writers when all relevant writers follow that locking protocol; serializable transactions cover some predicate-wide invariants with whole-transaction retry. An integer version does not by itself prevent a cross-row write skew, such as two rows each deciding the other remains on call.

**Incorrect:** compare `updated_at` in Go and then run an unconditional update, or increment `version` without checking the old one. Both can still overwrite another write. Do not use process-local locks as a cross-replica protocol.

**Verification cases:** load version 1 in two sessions; the first commits version 2; the second affects zero rows and does not overwrite it. Race duplicate release with stock return and prove inventory increments once. Test state predicate mismatch, foreign tenant, and a multi-row write-skew scenario if the product has one.

## 8. Tenant-scoped access is part of every provider/repository contract

**Required when multi-tenancy exists:** trusted tenant identity must reach read, update, delete, existence, pagination, join, bulk operation, and constraint scopes. Resolve and authorize it before calling the use case; a positive integer check or opaque globally unique ID is not authorization.

**Correct:** a read provider's `FindByID(ctx, tenantID, reservationID)` executes `WHERE tenant_id = $1 AND id = $2`. A repository update, nested relationship, or join must enforce the same tenant. Use tenant-qualified foreign keys where the schema allows them. A background job gets its tenant from authenticated durable job metadata and repeats the application authorization policy appropriate to that actor.

**Incorrect:** query by ID, mutate/save, then compare tenant before writing the HTTP response. Unauthorized effects have already occurred. Another trap is tenant-scoped parent loading followed by an unrestricted child query/edge or cache key.

PostgreSQL row-level security can provide defense in depth, but it is not automatic. Roles that own tables or have `BYPASSRLS` may bypass policies unless configured appropriately. If a policy uses a connection setting, set it transaction-locally on the **same handle**, for example with parameterized `SELECT set_config('app.tenant_id', $1, true)` inside the transaction; use a deny-by-default policy for missing/malformed settings. Never set a session variable on a pooled root connection and assume the next query uses that same connection or tenant. Inspect privileges and pool reuse behavior. See [security and operations](security-and-operations.md).

**Verification cases:** tenant A cannot find/update/delete tenant B's ID; foreign-tenant child IDs cannot be associated; count/search/export use the same scope; missing tenant denies access; cache and cursor cannot cross tenants; RLS tests run as the actual application role, not a superuser; a reused pooled connection cannot inherit the previous tenant.

## 9. Pagination, projections, and N+1 control

**Required baseline:** bound page size, choose deterministic ordering with a unique tie-breaker, and fetch only the shape needed. Do not materialize an entire table or an aggregate graph to render a list. Query/read-model ports can return projections without domain hydration.

For the SQL example, use keyset pagination over immutable `(created_at, id)` within one tenant:

```sql
SELECT id, sku, quantity, state, created_at
  FROM reservations
 WHERE tenant_id = $1
   AND (created_at, id) < ($2, $3)
 ORDER BY created_at DESC, id DESC
 LIMIT $4;
```

The first page omits the cursor predicate. Fetch `pageSize + 1` to detect another page; return at most `pageSize`, and construct the next cursor from the last **returned** row, not the extra lookahead row. Keep the sort/filter definition and tenant bound to the cursor contract; reject a cursor reused under incompatible filters or authority. Opaque encoding is not authentication, so add integrity protection if the cursor carries authority-sensitive untrusted state. Support exact timestamp precision in round trips.

Offset pagination is acceptable for small bounded administrative lists, but large offsets still scan/discard work and concurrent insert/delete can shift page boundaries. Keyset pagination also is not a snapshot across HTTP requests: new inserts, deletions, or changed sort keys can change observations. If an export requires a stable snapshot, define an export/snapshot strategy and its resource/retention cost rather than keeping a transaction open across user requests. Counts may be a separate query with a different snapshot; state whether an exact count is necessary.

**Resource-safe projection example:** this independent read-provider helper belongs in `internal/adapter/out/persistence/postgres/provider/reservation_query.go` and consumes an existing query/args selected according to the pagination rules above; it does not accept raw client SQL. The caller owns the bounded, parameterized SQL shape. `ReservationRow` is a pure read projection, so `[]ReservationRow` correctly retains value semantics. It demonstrates closing rows, checking scan errors, and checking the terminal iteration error:

```go
package provider

import (
    "context"
    "database/sql"
    "fmt"
    "time"
)

type ReservationRow struct {
    ID        string
    SKU       string
    Quantity  int64
    State     string
    CreatedAt time.Time
}

func scanReservationPage(ctx context.Context, db *sql.DB, query string, args ...any) ([]ReservationRow, error) {
    rows, err := db.QueryContext(ctx, query, args...)
    if err != nil {
        return nil, fmt.Errorf("query reservation page: %w", err)
    }
    defer rows.Close()
    result := make([]ReservationRow, 0)
    for rows.Next() {
        var row ReservationRow
        if err := rows.Scan(&row.ID, &row.SKU, &row.Quantity, &row.State, &row.CreatedAt); err != nil {
            return nil, fmt.Errorf("scan reservation page: %w", err)
        }
        result = append(result, row)
    }
    if err := rows.Err(); err != nil {
        return nil, fmt.Errorf("iterate reservation page: %w", err)
    }
    return result, nil
}
```

This is a read-provider helper, not a public contract that permits caller-provided arbitrary SQL. If a command needs the same read inside a transaction, build an explicitly scoped provider on the same query handle rather than calling this root-DB helper from the transaction callback. SQL values use placeholders; dynamic sort/column identifiers require an allowlist because identifiers cannot be safely parameterized as values.

**Required when reading relationships:** batch by known IDs, use a projection/join, or use Ent eager loading (`With...`) deliberately. Eager loading may issue several bounded queries rather than one join; measure the actual query count and selected columns. Joining a parent to many children before applying a parent page limit can truncate/duplicate the parent page; page parents first, then batch children under the same tenant. Prevent unbounded relation expansion from a request's arbitrary `include` parameter.

**Incorrect:** list 100 parents then call `QueryOwner().Only(ctx)` for each one; or page a joined child result and assume it contains 100 distinct parents. A cache does not make the underlying N+1 contract sound.

**Verification cases:** tied timestamps, empty page, one extra row, cursor precision, deleted boundary row, foreign-tenant/mismatched-filter cursor, invalid/oversized page size, and concurrent insert behavior as documented. Assert a bounded query count and bounded result bytes for relation lists. Check the actual PostgreSQL query plan with representative cardinality and the tenant/order index, not only tiny fixture timing.

## 10. Migrations and backwards-compatible rollout

**Required when production data exists:** keep reviewed migration history and generated Ent schema in agreement. Put migrations in the project's existing migration directory; do not create a competing tool convention. If none exists, adopt one project-owned engine-specific path, such as `internal/adapter/out/persistence/postgres/migrations`, and document its owner. Generated schema diffs are proposals, not permission to run destructive startup migration on every API replica.

For changing an existing email representation to `email_key`, an expand/backfill/enforce/contract sequence is:

1. **Decide equivalence first.** Document normalization and uniqueness scope; analyze collisions in existing rows. Do not discard one user's account to make the migration pass.
2. **Expand.** Add a nullable `email_key` column compatible with the old binary. Deploy code that writes the agreed key on every relevant create/change/import path while keeping old reads compatible. During a rolling deployment, old writers may still omit the new key; do not enforce `NOT NULL` yet.
3. **Backfill safely.** After retiring old writers, fill missing keys in bounded resumable batches. Update with a predicate protecting against concurrent user changes, such as the expected row version/email value; recompute on conflict instead of writing a stale key. Resolve collisions according to an approved business procedure.
4. **Enforce.** Verify all writers and existing rows satisfy the rule, add/validate the appropriate unique constraint/index and not-null guarantee, and test application conflict mapping. For large PostgreSQL tables consider concurrent index creation and staged validation where supported, with explicit operational ownership.
5. **Switch and observe.** Deploy reads using the new key; keep compatibility with the declared rollback window. Observe conflict/corruption/backfill status through existing operations mechanisms.
6. **Contract later.** Only after every supported binary/job stops depending on the old representation, remove the old column/read path in a separately reviewed deployment. A destructive rollback may not be possible; document forward repair or restore instead of inventing a harmless “down” migration.

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block; a migration runner that wraps every migration in one transaction needs a supported nontransactional migration mode for that operation. Failure can leave an invalid index requiring explicit inspection/recovery. Do not imply every DDL statement is rollbackable or lock-free. Adding/validating constraints, column rewrites/defaults, and index builds have version-specific lock and resource costs. Choose lock/statement timeouts and rehearse on realistic data.

Ent's versioned migration workflow supports deriving reviewed SQL from schema changes and replaying migration history. Keep custom SQL constraints/indexes visible to the chosen workflow so later diffs do not accidentally remove them. Do not hand-edit generated Ent files as the durable schema change.

**Incorrect:** rename/drop the old email column in the same release that introduces the new reader, or change normalization in only the newest HTTP handler. Mixed-version workers and old binaries continue operating during rollout.

**Verification cases:** replay from empty database; upgrade realistic prior data with collisions/nulls; run old binary against expanded schema and new binary during compatibility window; backfill concurrent with email changes; interrupt/resume backfill; fail/recover a concurrent index build; confirm constraints after deployment; rehearse the documented restore/forward-fix path. Link to [testing and evolution](testing-and-evolution.md) for compatibility matrices.

## 11. Cache and replica consistency

**Optional:** add a cache only for a named workload and explicit freshness contract. The database remains the authority for uniqueness, authorization facts, stock availability, and optimistic concurrency. A cache hit does not replace the guarded write or constraint.

For cache-aside, a miss reads the database and may populate the cache; after a successful command, invalidate/update only **after commit**. Keys must include tenant and every dimension affecting the result (identity, query filters, locale or policy version when relevant). Do not cache raw Ent entities with attached clients. Bound TTL/size; choose whether negative results may be cached and for how long.

Post-commit invalidation alone has a stale-fill race:

1. Reader A misses cache and reads old database value.
2. Writer B commits the new value and deletes the cache key.
3. Reader A fills the cache with the old value after the delete.

Therefore “invalidate after commit” is necessary ordering but not a linearizability guarantee. If bounded stale data is acceptable, document the bound and use TTLs; consider old in-flight readers when defining that bound. If stale reads are unacceptable, bypass this cache for that path or adopt a proven version/fencing/coherent read protocol. For durable eventual invalidation across crashes, use a committed change/outbox mechanism as described in [reliability and events](reliability-and-events.md), rather than a best-effort goroutine. Do not duplicate the outbox algorithm in the repository layer.

Read replicas can lag after a successful primary commit. Read-your-writes may require primary routing or a documented replication-position/session strategy; simply invalidating the cache does not make a replica current. Never check a command's stock/uniqueness/version invariant against a lagging replica and then write unconditionally to the primary.

**Correct:** return the committed command result directly and route strict follow-up reads to the primary; use cache/replica only on paths whose stale-read contract permits it.

**Incorrect:** delete cache before the transaction commits, refill it from uncommitted state, or claim a cache and PostgreSQL committed atomically without an actual shared protocol.

**Verification cases:** rollback leaves no uncommitted cached value; crash after commit before invalidation; stale-fill interleaving above; tenant key separation; cached not-found followed by create; replica lag after create/update; strict paths bypass stale reads. Test the promised freshness guarantee, not just whether `Delete(key)` was called.

## 12. Aggregate boundaries, resources, and isolation choices

### Aggregate versus multi-aggregate transactions

**Required baseline:** prefer the smallest transaction that protects the stated invariant. Aggregate design guides mutation ownership; it is not a prohibition against a multi-aggregate transaction in one database.

The reservation example legitimately updates inventory and inserts a reservation together. An order aggregate split across order/line tables needs one boundary even though there are several repositories/tables. Conversely, an email notification and remote billing write cannot be included atomically merely by executing them between `BEGIN` and `COMMIT`. Use a durable coordination policy from [reliability and events](reliability-and-events.md), including compensation only when the business defines what it means.

**Incorrect:** “one aggregate per transaction” forces a required stock/reservation invariant into eventual consistency without approval; or “one transaction per request” holds database locks while calling several remote APIs.

**Verification cases:** list the states observable by another transaction at each failure point; prove no forbidden state can commit; review whether all writes target one transactional database. Ask the domain owner if partial completion is allowed instead of silently changing the guarantee.

### Isolation is a mechanism, not a label

| Mechanism | Suitable example | Tradeoff / failure to handle |
| --- | --- | --- |
| PostgreSQL Read Committed + guarded write/constraint | Atomic decrement with `available >= quantity`; unique key | Each statement gets a new snapshot; ordinary reads are not a stable transaction-wide view |
| Optimistic expected version | Edit a previously loaded entity without overwriting someone else | Conflicts require reload/user resolution or an explicitly safe whole-command retry |
| Row locking (`FOR UPDATE`) | Decide from locked rows, with every relevant writer following the protocol | Lock waits/deadlocks; lock known rows in a consistent order; absent/predicate rows need another strategy |
| PostgreSQL Repeatable Read | A stable snapshot for a multi-query report/decision where its anomalies are acceptable | Can abort on concurrent update; does not eliminate write skew/serialization anomalies |
| PostgreSQL Serializable | A predicate-wide invariant whose concurrent transactions must behave serially | Additional conflict/overhead; whole-transaction retry for `40001`; keep all invariant-relevant paths compatible |

A serializable transaction does not make an external payment or broker atomic. Locking one existing row does not lock every possible future row matching a predicate. PostgreSQL Read Uncommitted behaves like Read Committed; other databases' isolation names may have different implementations. SQLite's write/concurrency behavior is not a substitute for PostgreSQL testing.

**Incorrect:** set `Serializable` everywhere without handling aborts, or assume `RepeatableRead` prevents every cross-row business anomaly. Isolation choice must match a concrete concurrent execution, not a performance slogan.

**Verification cases:** two concurrent guarded decrements, two stale version saves, lock-order deadlock, phantom/predicate insert, and write skew for the actual product rule. Test that aborted transactions do not return data as successful and safe retries reload all relevant facts.

### Resource lifetime and capacity

**Required baseline:** a transaction consumes a connection until commit/rollback. Keep callbacks short and sequential unless the driver/protocol explicitly supports otherwise; parallel goroutines sharing one transaction are not free parallel connections. Do not perform remote I/O, user interaction, slow serialization, or unbounded batch processing while holding locks.

- Configure pool capacity, connection lifetime/idle settings, and operation deadlines from the deployment's database connection budget. Multiply per-process pools by replicas and background workers; avoid exhausting the server during scale-out.
- Close `Rows` promptly and check `Rows.Err`; close statements when their ownership ends. A nonempty unconsumed cursor can pin a connection. Finish reads before issuing conflicting work on drivers that do not permit multiple active results.
- Use bounded batches for backfills and exports; a giant transaction increases lock time, WAL/undo pressure, replication lag, and rollback cost.
- Use database statement/lock/idle-in-transaction limits as operational safeguards in addition to request deadlines, with settings scoped safely for pooled connections.
- Keep driver/database details in persistence/composition configuration, not domain packages. Observe pool waits, transaction duration, lock contention, and query plans through the existing operations stack; do not log credentials or sensitive parameter values.

**Incorrect:** a transaction callback calls a root read helper while the only pool connection is held by that transaction. The callback may wait forever for itself. Increasing the pool merely hides the dependency/atomicity bug.

**Verification cases:** exhausted pool obeys request cancellation; early scan error releases rows; callback panic returns capacity; long batch/lock wait hits the intended bound; maximum replica count fits the database budget; transaction duration remains bounded under remote dependency failure because remote calls are outside the callback.

## Implementation review checklist

Before adopting an implementation, trace one command from trusted request inputs to commit:

1. Does `ctx` reach every database operation, including begin, hooks, and helpers?
2. Which exact writes must be atomic, and which application method owns that scope?
3. Are every repository/helper/hook and optional outbox insert bound to the same transaction handle, without root-client fallback?
4. Do error, panic, cancellation, and commit failure execute cleanup without returning early success?
5. Does the response distinguish a conflict, known abort, and uncertain commit instead of claiming every error means no commit?
6. Do unique/check/foreign-key constraints and concurrency predicates protect against independent processes?
7. Are tenant predicates and composite references present on reads, writes, joins, and caches?
8. Are queries/pagination and resource lifetimes bounded, and do migrations preserve the supported compatibility window?
9. If caching/replicas are adopted, is the actual stale-read guarantee explicit?
10. Which remaining business/isolation/retry/compatibility choices require a project answer rather than a guessed default?
