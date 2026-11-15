# Data access and transactions

This chapter implements the canonical Chi/Ent/PostgreSQL profile. When needed, read [architecture](architecture.md) for dependencies, [coding conventions](coding-conventions.md) for signatures, [domain](domain.md) for invariants, [layers](layers.md) for mapping/errors, and [reliability and events](reliability-and-events.md) for idempotency/outbox/external effects. The [runnable example](../../examples/go) is SQLite/standard-library HTTP, not PostgreSQL isolation evidence.

## Adoption levels and implementation boundaries

- **Required:** propagate caller context to database operations; parameterize values; enforce constraints/trusted authority; bound queries/resources.
- **For atomic multi-record changes:** application calls `WithinTransaction(ctx, func(txCtx context.Context) error) error` using its existing injected repositories/providers. Adapters resolve one handle; core sees no SQL/Ent types or repository bundle.
- **For concurrent decisions:** choose conditional writes, versions, locks, or serializable isolation for the invariant.
- **For live schema changes:** reviewed versioned migrations with old/new compatibility.
- **Optional:** cache, replicas, read models, stronger isolation, asynchronous propagation—each needs an explicit guarantee.
- **Project decisions:** atomic facts, conflict/uniqueness/tenant semantics, isolation/deadlines, staleness, retry safety, compatibility, uncertain outcomes.

Under `internal/adapter/out/persistence/postgres`, `provider` reads, `repository` writes, and `db` owns pool/transaction lifecycle and private scope/resolution—not mapping or business SQL. Generated Ent lives in `dao/ent`; handwritten mapping in `dao/*_mapper.go` or beside its owner. `db` never imports providers/repositories. A request `TrID` is correlation, not a transaction; implement the transaction infrastructure explicitly.

## 1. Propagate cancellation all the way to the driver

**Required:** `ctx` is first on inbound use cases/outbound I/O. Pass HTTP `r.Context()`, deriving only deliberately shorter deadlines; use SQL `ExecContext`/`QueryContext`/`QueryRowContext`/`BeginTx` and Ent `Save(ctx)`/`Only(ctx)`/`All(ctx)`. Never substitute `Background()` to finish canceled work.

Only `db` creates/resolves the private typed-key pointer scope below. This narrow transaction capability is not a general dependency container; core cannot inspect/commit/rollback it. Never use string keys or shared adapter fields for request contexts.

Handler fragment, assuming `h.userUseCase` and a port command `cmd`:

```go
ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
defer cancel()
result, err := h.userUseCase.CreateUser(ctx, cmd)
```

The illustrative two-second budget belongs to the operation's owning layer; adapter budgets may shorten, not lengthen it. Never retain request contexts in long-lived objects. Pure domain calculations take values, not context.

Repositories resolve `postgresdb.Executor(ctx, r.pool)`; Ent adapters resolve `postgresdb.Client(ctx, r.client)`, handle errors, then execute with the same context.

SQL `BeginTx` context lasts through commit/rollback; cancellation causes rollback and commit error. Actual driver/server cancellation needs integration evidence, and cancellation racing commit/connection loss is not proof of no commit.

**Verify:** cancellation before pool acquisition, during query/lock wait, after first write, and near commit; deadlines shorter than lock waits; no leaked request goroutine/transaction or partial state after acknowledged rollback. Only durably accepted independent work may use a worker-owned shutdown context—not detached HTTP goroutines.

## 2. Application-owned atomicity without a root-client escape

### Choose the boundary from a business fact

Choose the boundary from the fact: stock decrement plus reservation insert needs one application transaction, not independent repository transactions or a whole-request wrapper. Independent atomic statements need no runner.

Core's `internal/core/port/out` (`outport`) owns contracts, never SQL/Ent handles. Reuse one `Transactor.WithinTransaction` per database across domains/workflows: owner-locked updates and provisioning perform validation/locks explicitly through ports inside `txCtx`, not per-policy runners/bundles. Choose suitable isolation; different databases cannot share a local transaction. This example rejects nesting; already-scoped helpers use supplied context.

The next three sections use [domain's reservation](domain.md) and module `example.com/reservations` (substitute the target module). Stock/reservation orchestration belongs in `service/orchestration/reservation`, without calling use cases/peer services even through interfaces. Its existing injected adapters work independently with ordinary `ctx` and transactionally with `txCtx`; shared fields never switch handles.

### Outbound port: existing repositories and a context callback

`internal/core/port/out/reservation.go`:

```go
package outport

import (
    "context"
    "errors"

    "example.com/reservations/internal/core/domain"
)

var ErrStockUnavailable = errors.New("stock unavailable")

type StockProvider interface {
    Available(context.Context, domain.TenantID, domain.SKU) (int64, error)
}

type StockRepository interface {
    TryReserve(context.Context, domain.TenantID, domain.SKU, int64) error
}

type ReservationRepository interface {
    Insert(context.Context, *domain.Reservation) error
}
```

`internal/core/port/out/transaction.go` declares the common execution contract:

```go
package outport

import (
    "context"
    "fmt"
)

type Transactor interface {
    WithinTransaction(context.Context, func(txCtx context.Context) error) error
}

// CommitError identifies the failing phase; its cause determines whether the
// outcome is known aborted or requires reconciliation.
type CommitError struct {
    Cause error
}

func (e *CommitError) Error() string { return fmt.Sprintf("commit failed: %v", e.Cause) }

func (e *CommitError) Unwrap() error { return e.Cause }
```

Keep domain ports in domain files and the common runner in `transaction.go`. Inject existing read providers too. Every callback operation/helper uses `txCtx`, never outer `ctx`; do not strip/retain its scope or launch work outliving the callback.

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

The parent `in` imports child `command`, never the reverse or a concrete service. Queries/results stay in the parent; implementation-owned inputs invert the boundary.

### Application orchestration: return success only after commit

`internal/core/service/orchestration/reservation/orchestration.go`: consumer-owned `Clock` is wired by composition. Resolve/authorize `Tenant`; never trust a JSON tenant field.

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
    transactor      outport.Transactor
    stockRepo       outport.StockRepository
    reservationRepo outport.ReservationRepository
    clock           Clock
}

var _ inport.ReservationUseCase = (*Orchestration)(nil)

func NewOrchestration(transactor outport.Transactor, stockRepo outport.StockRepository,
    reservationRepo outport.ReservationRepository, clock Clock) *Orchestration {
    return &Orchestration{
        transactor: transactor, stockRepo: stockRepo,
        reservationRepo: reservationRepo, clock: clock,
    }
}

func (s *Orchestration) Reserve(ctx context.Context, cmd command.ReserveCommand) (*domain.Reservation, error) {
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    reservation, err := domain.NewReservation(cmd.ID, cmd.Tenant, cmd.SKU, cmd.Quantity, s.clock.Now())
    if err != nil {
        return nil, err
    }
    err = s.transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
        if err := s.stockRepo.TryReserve(txCtx, cmd.Tenant, cmd.SKU, cmd.Quantity); err != nil {
            return fmt.Errorf("reserve inventory: %w", err)
        }
        if err := s.reservationRepo.Insert(txCtx, reservation); err != nil {
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

Preallocated reservation ID keeps identity policy separate; inbound IDs confer no authority. Idempotency may supply a stable ID, but this example implements atomicity, not an idempotency protocol.

Return/publish success or invalidate cache only after commit, never in the callback. A later HTTP socket failure cannot undo commit.

**Verify:** stock failure skips insert; insert failure rolls stock back; commit failure returns no success; every read/write/helper uses `txCtx`, never root handles; the same adapters support ordinary independent calls.

## 3. Explicit PostgreSQL / `database/sql` implementation

**Alternative to Ent, not a second required stack:** SQL implements the same ports. Each adapter holds the immutable base pool and resolves per operation. Only absent scope permits base access; present scope must be live, correctly typed, and owned by that exact pool.

### Schema assumptions and constraints

Tenant-qualified stock/reservation keys and composite foreign keys prevent cross-tenant associations. The parent tenant table/authorization is project-specific; positive tenant IDs are not authorization.

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

Go `TrimSpace` recognizes more whitespace than PostgreSQL `btrim`; these checks are not equivalent normalization. Exact storage canonicalization needs a matching expression/collation or persisted key and migration.

### Adapter-owned scope and SQL lifecycle

Shared SQL/Ent `internal/adapter/out/persistence/postgres/db/transaction_scope.go`; only runners create the private scopes:

```go
package db

import "errors"

type transactionScopeKey struct{}

var (
    ErrNestedTransaction         = errors.New("nested transaction is not supported")
    ErrInvalidTransactionScope   = errors.New("invalid transaction scope")
    ErrTransactionScopeExpired   = errors.New("transaction scope expired")
    ErrTransactionPoolMismatch   = errors.New("transaction belongs to another pool")
    ErrTransactionClientMismatch = errors.New("transaction belongs to another client")
)
```

`internal/adapter/out/persistence/postgres/db/sql_transaction.go`:

```go
package db

import (
    "context"
    "database/sql"
    "errors"
    "fmt"
    "sync/atomic"

    outport "example.com/reservations/internal/core/port/out"
)

// SQLExecutor is the common operation surface of *sql.DB and *sql.Tx.
type SQLExecutor interface {
    ExecContext(context.Context, string, ...any) (sql.Result, error)
    QueryContext(context.Context, string, ...any) (*sql.Rows, error)
    QueryRowContext(context.Context, string, ...any) *sql.Row
}

type sqlScope struct {
    pool   *sql.DB
    tx     *sql.Tx
    active atomic.Bool
}

func Executor(ctx context.Context, pool *sql.DB) (SQLExecutor, error) {
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    value := ctx.Value(transactionScopeKey{})
    if value == nil {
        return pool, nil // Ordinary independent operation only.
    }
    scope, ok := value.(*sqlScope)
    if !ok || scope == nil {
        return nil, ErrInvalidTransactionScope
    }
    if !scope.active.Load() {
        return nil, ErrTransactionScopeExpired
    }
    if scope.pool != pool {
        return nil, ErrTransactionPoolMismatch
    }
    return scope.tx, nil
}

type SQLTransactor struct {
    pool *sql.DB
}

func NewSQLTransactor(pool *sql.DB) *SQLTransactor {
    return &SQLTransactor{pool: pool}
}

var _ outport.Transactor = (*SQLTransactor)(nil)

func (t *SQLTransactor) WithinTransaction(ctx context.Context,
    fn func(txCtx context.Context) error) (err error) {
    // Reject any existing capability, including expired or foreign scopes.
    if ctx.Value(transactionScopeKey{}) != nil {
        return ErrNestedTransaction
    }
    if err := ctx.Err(); err != nil {
        return err
    }
    tx, err := t.pool.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
    if err != nil {
        return fmt.Errorf("begin transaction: %w", err)
    }
    scope := &sqlScope{pool: t.pool, tx: tx}
    scope.active.Store(true)
    defer func() {
        scope.active.Store(false)
        // Also executes during panic unwinding. The original panic propagates.
        rollbackErr := tx.Rollback()
        if rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
            err = errors.Join(err, fmt.Errorf("rollback transaction: %w", rollbackErr))
        }
    }()
    txCtx := context.WithValue(ctx, transactionScopeKey{}, scope)
    err = fn(txCtx)
    scope.active.Store(false) // Callback capability ends before commit.
    if err != nil {
        return err
    }
    if err = ctx.Err(); err != nil {
        return err
    }
    if err = tx.Commit(); err != nil {
        return &outport.CommitError{Cause: err}
    }
    return nil
}
```

The scope pointer is never copied. Its atomic lifetime flag permits safe inspection of accidentally retained contexts, not concurrent callback work or retained executors. Resolve/use synchronously per operation. Composition supplies the exact same pool pointer to runner/adapters, not merely equal DSNs; the shared key also rejects Ent scopes rather than treating them as absent.

### Reusable SQL repositories

`internal/adapter/out/persistence/postgres/repository/reservation_sql.go`; no scoped repository constructors/assembly:

```go
package repository

import (
    "context"
    "database/sql"
    "fmt"

    postgresdb "example.com/reservations/internal/adapter/out/persistence/postgres/db"
    "example.com/reservations/internal/core/domain"
    outport "example.com/reservations/internal/core/port/out"
)

type sqlStockRepository struct {
    pool *sql.DB
}

func NewSQLStockRepository(pool *sql.DB) outport.StockRepository {
    return &sqlStockRepository{pool: pool}
}

func (r *sqlStockRepository) TryReserve(ctx context.Context,
    tenant domain.TenantID, sku domain.SKU, quantity int64) error {
    if tenant <= 0 || sku == "" || quantity <= 0 {
        return domain.ErrInvalidReservation
    }
    executor, err := postgresdb.Executor(ctx, r.pool)
    if err != nil {
        return err
    }
    result, err := executor.ExecContext(ctx, `
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
    pool *sql.DB
}

func NewSQLReservationRepository(pool *sql.DB) outport.ReservationRepository {
    return &sqlReservationRepository{pool: pool}
}

func (r *sqlReservationRepository) Insert(ctx context.Context, reservation *domain.Reservation) error {
    if reservation == nil {
        return domain.ErrInvalidReservation
    }
    s := reservation.Snapshot()
    if s.State != domain.ReservationActive {
        return domain.ErrInvalidReservation
    }
    executor, err := postgresdb.Executor(ctx, r.pool)
    if err != nil {
        return err
    }
    _, err = executor.ExecContext(ctx, `
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

`errors.Join` requires Go 1.20+. Read Committed suffices for this guarded decrement/insert: competing stock updates serialize and recheck `available >= quantity`. Reading a count then writing `oldAvailable-quantity` does not. Missing and insufficient stock intentionally share a public error.

Deferred rollback covers callback error/cancellation/panic and ignores SQL's post-commit `ErrTxDone`. Returned rollback failures join the original error; panics propagate unchanged, with rollback visibility through existing panic/operations reporting. Cleanup cannot guarantee remote receipt after connection loss.

Cancellation can race the pre-commit check; never turn acknowledged commit into apparent rollback with a post-commit check. Never bypass resolver errors via root I/O, outer context, or mutable `r.pool`/`r.tx`.

**Verify:** constraint failure after decrement rolls stock back on an independent connection; panic/cancel releases pool capacity; commit failure returns no success. Trace all reads/writes under a multi-connection pool; nested, saved-after-success/error/panic, malformed, foreign-pool, and wrong-adapter scopes must issue no root work. Also exercise ordinary adapter reuse.

## 4. Concrete Ent adaptation

Keep generated Ent in `postgres/dao/ent`, handwritten hydration in `postgres/dao/*_mapper.go` or its adapter owner, and schema inputs in `postgres/dao/schema`; never import generated code into core or map in `db`.

**Ent binding:** `db` begins and scopes `tx.Client()`. Existing adapters hold immutable root ownership and resolve `db.Client(ctx, root)` per operation, then pass that context into builders. Present scope never falls back to root.

### Generated API assumptions

The concrete snippets assume:

- `Stock`: ordinary generated integer ID; `field.Int64("tenant_id")`, `field.String("sku")`, `field.Int64("available")`; a unique index on `tenant_id, sku`.
- `Reservation`: `field.String("id").Immutable()` overrides Ent's default ID type; `field.Int64("tenant_id")`, `field.String("sku")`, `field.Int64("quantity")`, `field.String("state")`, `field.Time("created_at")`, and `field.Time("released_at").Optional().Nillable()`; `field.Int64("version").Default(1)` if adopting the optimistic-concurrency example below.

Reviewed SQL must add checks and tenant-qualified references; fields alone do not implement the schema above. This Ent variant has **globally unique string reservation IDs**, unlike SQL's composite primary key. Explicitly choose global or supported composite identity; tenant predicates remain mandatory. Neither variant is generated from the existing `User` schema.

### Ent-owned scope, client resolution, and lifecycle

Use `internal/adapter/out/persistence/postgres/db/ent_transaction.go` instead of the SQL runner, sharing `transaction_scope.go`. [Ent's transaction API](https://entgo.io/docs/transactions/) provides `BeginTx`, `tx.Client`, `Commit`, and `Rollback`:

```go
package db

import (
    "context"
    "database/sql"
    "errors"
    "fmt"
    "sync/atomic"

    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent"
    outport "example.com/reservations/internal/core/port/out"
)

type entScope struct {
    root   *ent.Client
    client *ent.Client
    active atomic.Bool
}

func Client(ctx context.Context, root *ent.Client) (*ent.Client, error) {
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    value := ctx.Value(transactionScopeKey{})
    if value == nil {
        return root, nil
    }
    scope, ok := value.(*entScope)
    if !ok || scope == nil {
        return nil, ErrInvalidTransactionScope
    }
    if !scope.active.Load() {
        return nil, ErrTransactionScopeExpired
    }
    if scope.root != root {
        return nil, ErrTransactionClientMismatch
    }
    return scope.client, nil
}

type EntTransactor struct {
    client *ent.Client
}

func NewEntTransactor(client *ent.Client) *EntTransactor {
    return &EntTransactor{client: client}
}

var _ outport.Transactor = (*EntTransactor)(nil)

func (t *EntTransactor) WithinTransaction(ctx context.Context,
    fn func(txCtx context.Context) error) (err error) {
    if ctx.Value(transactionScopeKey{}) != nil {
        return ErrNestedTransaction
    }
    if err := ctx.Err(); err != nil {
        return err
    }
    tx, err := t.client.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
    if err != nil {
        return fmt.Errorf("begin transaction: %w", err)
    }
    scope := &entScope{root: t.client, client: tx.Client()}
    scope.active.Store(true)
    committed := false
    defer func() {
        scope.active.Store(false)
        if committed {
            return
        }
        // Runs for callback errors, cancellation, commit failure, and panics.
        rollbackErr := tx.Rollback()
        if rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
            err = errors.Join(err, fmt.Errorf("rollback transaction: %w", rollbackErr))
        }
    }()
    txCtx := context.WithValue(ctx, transactionScopeKey{}, scope)
    err = fn(txCtx)
    scope.active.Store(false)
    if err != nil {
        return err
    }
    if err = ctx.Err(); err != nil {
        return err
    }
    if err = tx.Commit(); err != nil {
        return &outport.CommitError{Cause: err}
    }
    committed = true
    return nil
}
```

Compose runner/adapters with the exact same root pointer. Like SQL, this rejects expired/foreign/wrong-adapter scopes; hooks/helpers resolve per operation without retaining clients or mutating shared fields. The callback lifetime and panic/rollback rules above apply to both implementations.

### Reusable Ent repositories

`internal/adapter/out/persistence/postgres/repository/reservation_ent.go` implements the same domain-specific write contracts using Ent:

```go
package repository

import (
    "context"
    "fmt"

    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent"
    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent/stock"
    postgresdb "example.com/reservations/internal/adapter/out/persistence/postgres/db"
    "example.com/reservations/internal/core/domain"
    outport "example.com/reservations/internal/core/port/out"
)

type entStockRepository struct {
    client *ent.Client
}

func NewEntStockRepository(client *ent.Client) outport.StockRepository {
    return &entStockRepository{client: client}
}

func (r *entStockRepository) TryReserve(ctx context.Context,
    tenant domain.TenantID, sku domain.SKU, quantity int64) error {
    if tenant <= 0 || sku == "" || quantity <= 0 {
        return domain.ErrInvalidReservation
    }
    client, err := postgresdb.Client(ctx, r.client)
    if err != nil {
        return err
    }
    n, err := client.Stock.Update().
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

func NewEntReservationRepository(client *ent.Client) outport.ReservationRepository {
    return &entReservationRepository{client: client}
}

func (r *entReservationRepository) Insert(ctx context.Context, reservation *domain.Reservation) error {
    if reservation == nil {
        return domain.ErrInvalidReservation
    }
    s := reservation.Snapshot()
    if s.State != domain.ReservationActive {
        return domain.ErrInvalidReservation
    }
    client, err := postgresdb.Client(ctx, r.client)
    if err != nil {
        return err
    }
    _, err = client.Reservation.Create().
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

Generate APIs against the actual fields/features; verify selected driver/dialect isolation support. Routine storage errors return normally, not through `SaveX`/`OnlyX` panics.

Map Ent objects to domain/read values inside scope; no transactional driver/lazy edge query escapes. `Unwrap()` allows post-commit edges but can panic on arbitrary/nontransactional entities; mapped values avoid this coupling. Transaction hooks do not guarantee durable broker delivery.

**Verify on Ent/PostgreSQL:** repeat SQL's failure/lifetime/ownership/ordinary-reuse cases; inspect actual migrated constraints and hook/helper resolution; returned domain objects perform no later query. SQLite example execution validates neither these Ent fragments nor PostgreSQL behavior.

### Existing read providers participate without reconstruction

Independent `stockProvider.Available(ctx, tenant, sku)` needs no runner. For a response requiring read-own-write availability, use the same provider inside the callback. This body assumes injected ports, a validated reservation/trusted tenant/SKU/positive quantity, and `(int64, error)` return:

```go
var remaining int64
err := transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
    if err := stockRepo.TryReserve(txCtx, tenant, sku, quantity); err != nil {
        return err
    }
    if err := reservationRepo.Insert(txCtx, reservation); err != nil {
        return err
    }
    var readErr error
    remaining, readErr = stockProvider.Available(txCtx, tenant, sku)
    return readErr
})
if err != nil {
    return 0, err
}
return remaining, nil
```

The read sees its own decrement, not a root snapshot; availability can change after commit. Omit it if unused; the guarded write, not a precheck, protects stock.

`internal/adapter/out/persistence/postgres/provider/stock_sql.go`:

```go
package provider

import (
    "context"
    "database/sql"
    "errors"
    "fmt"

    postgresdb "example.com/reservations/internal/adapter/out/persistence/postgres/db"
    "example.com/reservations/internal/core/domain"
    outport "example.com/reservations/internal/core/port/out"
)

type sqlStockProvider struct {
    pool *sql.DB
}

func NewSQLStockProvider(pool *sql.DB) outport.StockProvider {
    return &sqlStockProvider{pool: pool}
}

func (p *sqlStockProvider) Available(ctx context.Context,
    tenant domain.TenantID, sku domain.SKU) (int64, error) {
    if tenant <= 0 || sku == "" {
        return 0, domain.ErrInvalidReservation
    }
    executor, err := postgresdb.Executor(ctx, p.pool)
    if err != nil {
        return 0, err
    }
    var available int64
    err = executor.QueryRowContext(ctx,
        `SELECT available FROM stocks WHERE tenant_id = $1 AND sku = $2`,
        int64(tenant), string(sku)).Scan(&available)
    if errors.Is(err, sql.ErrNoRows) {
        return 0, outport.ErrStockUnavailable
    }
    if err != nil {
        return 0, fmt.Errorf("read stock: %w", err)
    }
    return available, nil
}
```

Ent alternative, `internal/adapter/out/persistence/postgres/provider/stock_ent.go`:

```go
package provider

import (
    "context"
    "fmt"

    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent"
    "example.com/reservations/internal/adapter/out/persistence/postgres/dao/ent/stock"
    postgresdb "example.com/reservations/internal/adapter/out/persistence/postgres/db"
    "example.com/reservations/internal/core/domain"
    outport "example.com/reservations/internal/core/port/out"
)

type entStockProvider struct {
    client *ent.Client
}

func NewEntStockProvider(client *ent.Client) outport.StockProvider {
    return &entStockProvider{client: client}
}

func (p *entStockProvider) Available(ctx context.Context,
    tenant domain.TenantID, sku domain.SKU) (int64, error) {
    if tenant <= 0 || sku == "" {
        return 0, domain.ErrInvalidReservation
    }
    client, err := postgresdb.Client(ctx, p.client)
    if err != nil {
        return 0, err
    }
    row, err := client.Stock.Query().
        Where(stock.TenantIDEQ(int64(tenant)), stock.SkuEQ(string(sku))).
        Select(stock.FieldAvailable).
        Only(ctx)
    if ent.IsNotFound(err) {
        return 0, outport.ErrStockUnavailable
    }
    if err != nil {
        return 0, fmt.Errorf("read stock: %w", err)
    }
    return row.Available, nil
}
```

Composition injects these adapters once with their runner's same base handle; independent/transactional calls differ only in supplied context.

## 5. Commit outcomes, rollback, and retry boundaries

**Required:** atomicity does not guarantee the caller learns the final outcome:

| Observation | Application meaning |
| --- | --- |
| Begin fails before a transaction is obtained | No callback writes were issued by this attempt |
| Callback fails, and rollback is acknowledged | This transaction did not commit its transactional writes |
| Callback panics | Attempt rollback; propagate panic; never report success |
| Commit returns `nil` | Database commit was acknowledged; return success even if a later socket write fails |
| Database reports an explicit serialization abort/deadlock abort | This transaction failed; a safe whole-operation retry may be possible |
| Commit loses connection/response | Outcome may be unknown; do not assert no rows committed or blindly replay effects |
| Request cancels near commit | Classify from actual driver/server outcome; cancellation alone is not a universal rollback proof |

`CommitError` identifies phase, not guaranteed abortion. Preserve causes with `%w`/`Unwrap` and inspect structured codes: PostgreSQL `40001` differs from lost acknowledgment; failed rollback on a broken connection cannot resolve uncertainty.

**When repeat attempts matter:** define durable operation identity/authorized reconciliation; read [reliability and events](reliability-and-events.md) for idempotency/outbox/delivery. Error does not mean “nothing changed,” duplicate rejection is not idempotency, and exactly-once delivery is not implied.

Never retry only a statement/commit in an aborted transaction. An approved retry repeats the whole transaction with fresh reads/reconstructed state, bounded attempts/deadlines, and no unreplayable side effects. Do not silently add repository retries or reuse mutated aggregates/event slices; external payments do not roll back with SQL.

**Verify:** explicit abort, duplicate request, cancellation racing commit, and lost acknowledgment reconciled via a new connection. Observe both committed-response-lost and aborted outcomes through controlled faults; mocked commit errors prove only response handling.

## 6. Uniqueness races and database constraints

**For uniqueness:** database constraints must match application equivalence/scope; prechecks only improve feedback. Example for an already canonical tenant email key:

```sql
ALTER TABLE users
    ADD CONSTRAINT users_tenant_email_key_unique UNIQUE (tenant_id, email_key);
```

Assume both columns `NOT NULL` and existing data canonicalized/deduplicated. Decide soft-deletion reuse (e.g. active-only partial index); nullability/collation alter semantics. Never recanonicalize history incidentally; use [domain normalization](domain.md#normalize-only-under-an-explicit-equivalence-relation).

Two processes may both precheck absent; the constraint rejects one insert. Map that **specific** violation, not every integrity failure, to existing `outport.ErrEmailTaken`.

`postgres/repository/user_error.go` (or shared handwritten DAO helper), assuming pgx v5 directly or a SQL driver preserving its typed cause:

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

`ent.IsConstraintError` alone cannot distinguish unique/check/FK failures. Verify structured causes survive the actual generated/runtime wrappers; other drivers need typed classifiers. Never parse localized messages, map every constraint to duplicate, or query a failed PostgreSQL transaction without rollback/savepoint policy.

**Verify:** barrier-synchronized independent inserts give one success/one classified conflict; tenant and canonicalization scope match policy; unrelated constraints retain classification. Assert deployed constraints, not Go tags. Causes remain inspectable, never public response text.

## 7. Reject lost updates with an explicit concurrency protocol

**For read/mutate/save:** predicate on expected version and advance atomically; default isolation alone cannot stop lost updates. SQL release also requires active state:

```sql
UPDATE reservations
   SET state = 'released', released_at = $4, version = version + 1
 WHERE tenant_id = $1 AND id = $2
   AND version = $3 AND state = 'active';
```

Use domain-validated release time. Require one affected row; zero maps to the existing conflict/not-found disclosure policy. Retry only after reloading/redeciding the command. If release returns stock, both writes share one application transaction.

Ent equivalent assumes validated `tenant`, `id`, `expectedVersion`, `releasedAt`; the repository receives `txCtx` as `ctx` and imports generated `reservation` predicates:

```go
client, err := postgresdb.Client(ctx, r.client)
if err != nil {
    return err
}
n, err := client.Reservation.Update().
    Where(reservation.TenantIDEQ(int64(tenant)),
        reservation.IDEQ(string(id)),
        reservation.VersionEQ(expectedVersion),
        reservation.StateEQ("active")).
    SetState("released").
    SetReleasedAt(releasedAt).
    AddVersion(1).
    Save(ctx)
```

Propagate `err`; require `n == 1`, never zero-row success. Count-returning `Update().Where(...).Save(ctx)` differs from single-entity not-found helpers. Read metadata may hold `{Entity *domain.Reservation, Version int64}` without making version business identity. HTTP `ETag`/`If-Match` must retain expected-version/conflict semantics.

Guarded arithmetic, all-writer row locking, or serializable transactions may fit other invariants. Versioning does not prevent cross-row write skew (e.g. two on-call rows); comparing timestamps in Go, incrementing without an old-version predicate, or process locks is insufficient.

**Verify:** two version-1 loads yield one version-2 winner/one conflict; duplicate release returns stock once; mismatched state/foreign tenant fails; test product-specific cross-row write skew separately.

## 8. Tenant-scoped access is part of every provider/repository contract

**For multi-tenancy:** authorize trusted tenant before the use case, then scope every read/write/delete/existence/page/join/bulk operation/association. Positive or globally unique IDs are not authorization.

`FindByID(ctx, tenantID, id)` uses both predicates; edges/joins/child associations do too. Jobs use authenticated durable tenant metadata and actor-appropriate authorization. Checking tenant after mutation/response is too late; a tenant-scoped parent does not scope unrestricted children/caches.

RLS is defense in depth: table owners/`BYPASSRLS` roles may bypass it. Connection-setting policies need transaction-local settings on the same handle, e.g. parameterized `SELECT set_config('app.tenant_id', $1, true)`, and deny missing/malformed settings. Never set a pooled root session and assume later queries share connection/tenant. For privilege design read [security and operations](security-and-operations.md).

**Verify:** foreign reads/writes/deletes/associations/count/search/export/cache/cursors deny; missing tenant denies; RLS runs as the actual application role; pool reuse inherits no prior tenant.

## 9. Pagination, projections, and N+1 control

**Required:** bounded page size, deterministic order/unique tie-breaker, and only necessary projections, not entire tables/graphs. For this schema, keyset-page immutable `(created_at,id)` within tenant:

```sql
SELECT id, sku, quantity, state, created_at
  FROM reservations
 WHERE tenant_id = $1
   AND (created_at, id) < ($2, $3)
 ORDER BY created_at DESC, id DESC
 LIMIT $4;
```

First page omits the cursor predicate. Fetch `pageSize+1`, return at most `pageSize`, cursor from last **returned** row. Bind tenant/filter/order; reject incompatible reuse and preserve timestamp precision. Opaque encoding is not authentication; protect integrity when it carries sensitive authority.

Small bounded admin lists may use offsets; large offsets waste work and concurrent changes shift pages. Keysets also do not create a cross-request snapshot. Stable exports need explicit snapshot/resource/retention policy, not transactions held across HTTP requests. Counts can observe another snapshot; specify whether exact count is needed.

**Resource-safe helper:** `postgres/provider/reservation_query.go` receives an existing bounded parameterized query, never raw client SQL. `ReservationRow` is an inert value projection:

```go
package provider

import (
    "context"
    "database/sql"
    "fmt"
    "time"

    postgresdb "example.com/reservations/internal/adapter/out/persistence/postgres/db"
)

type ReservationRow struct {
    ID        string
    SKU       string
    Quantity  int64
    State     string
    CreatedAt time.Time
}

func scanReservationPage(ctx context.Context, pool *sql.DB, query string, args ...any) ([]ReservationRow, error) {
    executor, err := postgresdb.Executor(ctx, pool)
    if err != nil {
        return nil, err
    }
    rows, err := executor.QueryContext(ctx, query, args...)
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

The existing provider supplies its base pool/context; resolution supports ordinary and transactional calls unchanged. SQL values use placeholders; dynamic sort/column identifiers need allowlists.

**For relationships:** batch IDs, project/join, or deliberately eager-load Ent `With...`; measure actual bounded query count/columns. Page parents before joining/batching children under tenant scope, or child multiplicity truncates/duplicates pages. Bound arbitrary `include` expansion; one owner query per parent is N+1 even with a cache.

**Verify:** ties/empty/lookahead/cursor precision/deleted boundary, foreign/filter-mismatched cursors, invalid/oversized page sizes, and documented concurrent inserts. Bound query count/result bytes; inspect PostgreSQL plans at representative cardinality with tenant/order indexes.

## 10. Migrations and backwards-compatible rollout

**For production data:** keep reviewed history and generated Ent schema aligned. Reuse the migration engine/directory; absent one, adopt an owned engine-specific path such as `postgres/migrations`. Generated diffs are proposals, never destructive per-replica startup migration.

Example `email_key` expand/backfill/enforce/contract:

1. **Decide equivalence/scope.** Analyze historical collisions; resolve through approved business policy, not discarded accounts.
2. **Expand.** Add nullable compatible column; update every create/change/import writer while old reads work. Old rolling writers still omit it: no `NOT NULL` yet.
3. **Backfill.** Retire old writers first; use bounded resumable batches guarded by expected version/email. Recompute conflicts rather than overwrite concurrent changes; resolve collisions.
4. **Enforce.** Verify every writer/row; add/validate uniqueness/not-null and conflict mapping. Large tables may need concurrent indexes/staged validation with operational ownership.
5. **Switch/observe.** Read new keys within the declared rollback window; observe conflicts/corruption/backfill through existing operations.
6. **Contract later.** Remove old paths only after all supported binaries/jobs stop depending on them. Document forward repair/restore where destructive rollback is unsafe.

`CREATE INDEX CONCURRENTLY` needs a supported nontransactional migration mode; failures can leave invalid indexes requiring recovery. DDL is neither universally rollbackable nor lock-free: rehearse version-specific locks, rewrites, defaults, resource cost, and lock/statement budgets on realistic data.

Use reviewed Ent versioned SQL/replay; retain custom constraints/indexes in the workflow so later diffs do not remove them. Never hand-edit generated Ent as a durable change.

**Verify:** empty replay, realistic prior collisions/nulls, old/new binary compatibility, concurrent-change/interrupted backfills, failed-index recovery, deployed constraints, and documented restore/forward repair. For compatibility matrices read [testing and evolution](testing-and-evolution.md).

## 11. Cache and replica consistency

**Optional:** a named workload needs an explicit freshness guarantee. The database remains authoritative for uniqueness, authorization, stock, and concurrency.

Cache-aside misses may fill mapped values (never attached Ent entities). Invalidate/update only after commit; tenant/result dimensions belong in keys. Bound TTL/size and decide negative caching.

Post-commit invalidation still has a stale-fill race:

1. Reader A misses cache and reads old database value.
2. Writer B commits the new value and deletes the cache key.
3. Reader A fills the cache with the old value after the delete.

TTL staleness bounds must include old in-flight fills. For intolerant paths bypass cache or use a proven coherent/version/fencing protocol. Crash-safe eventual invalidation requires committed change/outbox delivery from [reliability and events](reliability-and-events.md), not best-effort goroutines or a duplicated repository algorithm.

Replica lag survives cache invalidation. Read-your-writes needs primary routing or a replication-position/session protocol. Never make unconditional primary writes from stale stock/uniqueness/version decisions. Return committed command results directly and route strict follow-ups to primary.

**Verify:** no uncommitted cache on rollback; commit/crash/invalidation gap; stale-fill ordering; tenant keys; negative-cache/create race; replica lag; promised strict bypass/freshness—not just `Delete(key)` calls. Cache and SQL are not atomic without a shared protocol.

## 12. Aggregate boundaries, resources, and isolation choices

### Aggregate versus multi-aggregate transactions

Use the smallest boundary protecting the fact, not “one aggregate per transaction” or “one transaction per HTTP request.” Stock/reservation and order/line tables may need one database transaction despite multiple aggregates/repositories. Never silently weaken required atomicity to eventual consistency.

Remote billing/email cannot join a local transaction; read [reliability and events](reliability-and-events.md) for durable coordination and business-defined compensation. At each failure point, verify observable states and whether every required write shares one transactional database.

### Isolation is a mechanism, not a label

| Mechanism | Suitable example | Tradeoff / failure to handle |
| --- | --- | --- |
| PostgreSQL Read Committed + guarded write/constraint | Atomic decrement with `available >= quantity`; unique key | Each statement gets a new snapshot; ordinary reads are not a stable transaction-wide view |
| Optimistic expected version | Edit a previously loaded entity without overwriting someone else | Conflicts require reload/user resolution or an explicitly safe whole-command retry |
| Row locking (`FOR UPDATE`) | Decide from locked rows, with every relevant writer following the protocol | Lock waits/deadlocks; lock known rows in a consistent order; absent/predicate rows need another strategy |
| PostgreSQL Repeatable Read | A stable snapshot for a multi-query report/decision where its anomalies are acceptable | Can abort on concurrent update; does not eliminate write skew/serialization anomalies |
| PostgreSQL Serializable | A predicate-wide invariant whose concurrent transactions must behave serially | Additional conflict/overhead; whole-transaction retry for `40001`; keep all invariant-relevant paths compatible |

Row locks do not cover every future predicate match; serializable does not include remote effects. PostgreSQL Read Uncommitted acts as Read Committed; other engines differ. SQLite is not PostgreSQL concurrency evidence.

**Verify the chosen mechanism:** guarded decrements, stale saves, lock-order deadlocks, predicate inserts, and product-specific write skew. Aborts never return successful data; approved retries reload all facts. Serializable needs abort handling; Repeatable Read does not eliminate every anomaly.

### Resource lifetime and capacity

**Required:** transactions occupy connections until completion; keep callbacks short/sequential. Shared-transaction goroutines are not extra connections. Keep remote I/O, interaction, slow serialization, and unbounded batches outside locks.

- Budget pool size/lifetime/idle settings/deadlines across all replicas/workers against server capacity.
- Close rows/statements at ownership end; check scan/iteration errors. Finish reads before conflicting work where drivers forbid multiple active results.
- Bound backfills/exports to limit lock time, WAL/undo, lag, and rollback cost.
- Add safely scoped statement/lock/idle-in-transaction limits alongside request deadlines.
- Keep configuration in persistence/composition; observe pool waits/duration/contention/plans through existing operations, without credentials/sensitive parameters.

A root helper inside a callback can deadlock waiting for its own pool connection; a larger pool only hides the binding bug.

**Verify:** cancellation under pool exhaustion, scan-error/panic capacity release, bounded batches/lock waits, maximum replica budget, and no remote-dependency delay while holding transactions.

## Implementation review checklist

Trace one authorized command through the concrete code above, then exercise the applicable **Verify** cases—not merely the callback's happy path. Record unresolved business/isolation/retry/compatibility decisions in adoption.

Acceptance must cover scope/handle propagation and lifecycle, known versus unknown outcomes, real constraints/concurrent writers, tenant boundaries, query/resource bounds, compatible rollout, and any adopted freshness guarantee. Mock/SQLite evidence cannot establish PostgreSQL/Ent behavior.
