# Testing and evolving a Go application

Choose evidence for consumer-visible results, forbidden durable effects, concurrency and recovery—not mock counts. This chapter owns test design and safe evolution, not a second mechanism specification. When implementing a boundary, read its owner: [architecture](architecture.md)/[layers](layers.md) for placement, [coding conventions](coding-conventions.md) for Go/tooling, [domain](domain.md) for model rules, [data and transactions](data-and-transactions.md) for persistence, [reliability and events](reliability-and-events.md) for delivery, [security and operations](security-and-operations.md) for controls.

## 1. Applicability and the evidence boundary

Apply [adoption](../adoption.md) labels:

- **Required baseline:** domain/use-case behavior; HTTP contracts where exposed; actual selected persistence adapters; bounded fixtures; compatibility decisions and honest reporting.
- **Required with concurrent invariants:** synchronized actors on the deployed engine/isolation/constraints, not single-process handler tests.
- **Required with schema/API/event/deployment compatibility changes:** migration/contract checks and reviewed rollout/recovery.
- **Required with durable async delivery:** crash, duplicate, exhaustion and replay cases; no broker solely for testing.
- **Required with authorization/tenancy/workers:** principal denial/isolation/lifecycle cases respectively.
- **Optional:** additional fuzzing, mutation/model-based tests, consumer-contract infrastructure and performance gates to close named gaps.
- **Needs project decision:** conflicts, supported release combinations, recovery objectives, provisioning and architecture exceptions. Discover existing decisions first.

### Select a check by what could go wrong

| Consumer-visible invariant | Smallest useful check | Additional proof when applicable | What the small check cannot prove |
| --- | --- | --- | --- |
| Invalid domain state cannot be constructed | Boundary/table test of the public constructor or transition | Fuzz malformed or adversarial input | Database constraints or transport validation |
| Use case rejects an invalid transition and preserves state | Service test with a stateful repository double | Real service + transaction adapter integration | Whether a mock rollback actually rolls back |
| HTTP success/error representation is stable | Actual router and middleware through `httptest` | Network server/proxy checks for deployment behavior | TLS, ingress limits, shutdown, or database integrity |
| Duplicate creation has one durable winner | Two synchronized actors against production-family database | HTTP/service integration maps the losing error correctly | A sequential mocked `FindByEmail`/`Save` test proves neither |
| User and audit/outbox changes are atomic | Failure after the first write through real transaction-bound adapters | Commit-failure and process-loss experiments | SQL text containing `BEGIN` is not execution evidence |
| An update cannot overwrite a newer version | Two actors read the same version before conditional updates | Client conflict/retry behavior | The Go race detector does not detect lost database updates |
| Repository implementations obey the port | Shared behavioral contract run against each real adapter | Migration and query-plan tests | A fake implementing the interface only proves its own behavior |
| A tenant cannot observe another tenant's data | Authorized requests + real scoped queries with separate principals | Database policy tests if policies are used | A middleware-only identity test cannot prove query scoping |
| Worker can recover without double business effects | Durable failure/replay integration | Broker/process crash tests in a controlled environment | A publish mock returning `nil` cannot prove delivery |
| Release can be rolled back safely | Mixed-version compatibility + recovery rehearsal | Staging canary and restore exercise | A unit test or migration linter cannot prove recoverability |

Record invariant, test entry point, dependencies, negative case and remaining uncertainty in project guidance/change review. Empty directories and repeated mock-call sequences provide no evidence.

## 2. Test placement and deterministic seams

Colocate fast tests with domain/services/HTTP; infrastructure-dependent cross-adapter checks may use `test/integration`. Protocol fixtures belong in owner `testdata`; shared doubles in existing `internal/mock`/`test/mocks` only when useful.

Prefer external packages for public behavior. Internal tests may localize significant otherwise-unobservable defects; never export internals solely for tests. Interface assertions prove signatures, not semantics.

Control nondeterminism at existing seams:

- Inject clocks only for business-time decisions; test before/at/after a fixed instant.
- Supply IDs where relevant; assert relationships/nonzero values, not sequences that may advance on rollback.
- Contractual ordering needs tie-breakers, never assumed insertion order.
- Own fixtures privately; no shared mutable fake/env/server/schema/email across parallel tests.
- Cancellation must reach real adapters, not stop at a service fake.
- Coordinate readiness with channels/conditions, not sleeps. Deadlines bound failure; they do not orchestrate overlap.

### Domain boundary example

For a runnable table-test pattern, read [domain/user_test.go](../../examples/go/internal/core/domain/user_test.go) when writing constructor tests: `TestNewUserRejectsInvalidInput` covers blank/long/NUL names and malformed email; `TestNewUserNormalizesAcceptedInput` checks canonical fields using fixed time. This teaching API differs from the illustrative API in [layers](layers.md); do not change target signatures to match it.

Assert the documented error category (`errors.Is`), no usable invalid entity, and canonical accepted values. Trimming/lowercasing is the example's chosen email policy, not universal identity policy. For every documented maximum, add `limit-1/limit/limit+1` in its actual unit (bytes/code points/graphemes differ). Exercise transitions on valid objects too; constructor coverage cannot protect mutators. Never copy the implementation regex into the assertion.

### Service checks without mock theater

Use a small stateful repository double for create/read-back identity, no writes on rejection, conflict mapping and retained `errors.Is`/`errors.As`. Its mutex may make the fake coherent, not prove PostgreSQL concurrency.

Assert interactions only when they protect behavior: forbidden charge, canceled external dispatch or invalid write. Otherwise prefer result/state to internal call order. A transaction double can assert callback-scope use, but real adapters must prove late failure leaves no externally visible partial state; a `Rollback()` expectation cannot.

## 3. HTTP behavior and contracts

Exercise the actual router, DTO/error mapping and middleware: status/headers, machine code, field presence/absence, limits, methods and safe failures. Decode JSON semantically rather than matching irrelevant field order.

For runnable composition and request helpers, read [http/router_test.go](../../examples/go/internal/adapter/in/http/router_test.go) when adding HTTP contract cases:

- `TestHTTPCreateGetAndSafeFailures`: create/get identity and canonical fields, `Location`, duplicate and missing/invalid IDs.
- `TestHTTPRejectsInvalidBodiesWithoutPersisting`: blank/malformed/unknown/trailing/null/oversized input plus external durable-count assertion.
- `TestHTTPInternalFailureDoesNotExposeDatabaseCause`: synthetic failing audit trigger, generic public `500`, and no partial user commit.

These tests use the **local SQLite/stdlib adaptation**, not the canonical wire envelope or production Chi/Ent/PostgreSQL. Preserve the target API's accepted statuses/codes/authentication; never disable auth or change `422` to `400` to copy examples. They do not prove production identity, tenant policy, TLS, ingress or DB semantics.

For the canonical profile, assert exactly `transaction_id`, string `response_code`, safe `message` and always-present `result` across success, validation/auth errors, router 404/405, recovery and serialization failure. Cover null, false, zero, empty string/list and nested JSON results; verify the actual HTTP status independently. Serialization failure keeps the original ID. Exercise HEAD and approved bodyless/file/stream exceptions separately.

Check the execution ID's 17 timestamp digits plus five alphanumeric characters, millisecond zero-padding, explicit timezone and preservation across response/log/downstream context. Untrusted request headers cannot replace it. Log records have one physical JSON line, unique flat scalar keys, and runtime-derived `caller` pointing to direct and wrapped logging calls rather than the logger helper. Reject reserved-key collisions and nested extra values; verify optional safe detail survives and `operation`/`query` are absent. These are runtime assertions, not source-text matching.

Inject a distinctive synthetic secret marker; search the entire public body/headers and ordinary logs, not just forbidden key names. Assert it appears only in approved restricted diagnostics with exactly one inbound owner. Use no real credentials.

Cover malformed/trailing JSON, unsupported media, size edges, methods, missing/denied objects and approved existence policy. Run mapping cases with an input-port double, then selected real-service/database cases; report separately. `ResponseRecorder` cannot prove TLS/HTTP2/stream disconnect/proxy behavior: use `httptest.Server` or deployment checks for those.

With versioned OpenAPI/JSON/event schemas, validate producer responses/consumer requests including old fixtures, omitted/additive fields, nullability, page tokens and errors. Schema/client generation alone cannot prove deployed compatibility.

## 4. Real PostgreSQL: rollback, duplicate races, and optimistic locking

The four blocks below form one illustrative `test/integration/postgres_semantics_test.go`: pinned `pgx/v5`, disposable PostgreSQL, schema-create/drop test role, explicit Read Committed. They prove SQL primitives, **not Ent/application adapters**; repeat assertions through real repositories and the context-callback transaction boundary before claiming application atomicity/error translation.

Selecting this suite requires `TEST_DATABASE_DSN`; absence fails, not green-skip. The fixture owns a random private schema, qualifies every table and bounds work/cleanup; it never assumes pooled connections share `search_path`.

```go
//go:build integration

package integration_test

import (
    "context"
    "crypto/rand"
    "database/sql"
    "encoding/hex"
    "errors"
    "fmt"
    "os"
    "testing"
    "time"

    "github.com/jackc/pgx/v5/pgconn"
    _ "github.com/jackc/pgx/v5/stdlib"
)

type fixture struct {
    db     *sql.DB
    schema string
}

func openFixture(t *testing.T) fixture {
    t.Helper()
    dsn := os.Getenv("TEST_DATABASE_DSN")
    if dsn == "" {
        t.Fatal("TEST_DATABASE_DSN must name a disposable PostgreSQL test database")
    }
    db, err := sql.Open("pgx", dsn)
    if err != nil {
        t.Fatal(err)
    }
    // Two transactions and an independent observer must not share one connection.
    db.SetMaxOpenConns(4)
    var token [12]byte
    if _, err := rand.Read(token[:]); err != nil {
        _ = db.Close()
        t.Fatal(err)
    }
    f := fixture{db: db, schema: "it_" + hex.EncodeToString(token[:])}
    t.Cleanup(func() {
        ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        // The identifier is generated above, never supplied by an external caller.
        if _, err := db.ExecContext(ctx, `DROP SCHEMA IF EXISTS "`+f.schema+`" CASCADE`); err != nil {
            t.Errorf("drop test schema: %v", err)
        }
        if err := db.Close(); err != nil {
            t.Errorf("close test database: %v", err)
        }
    })
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    if err := db.PingContext(ctx); err != nil {
        t.Fatal(err)
    }
    statements := []string{
        `CREATE SCHEMA "` + f.schema + `"`,
        `CREATE TABLE ` + f.table("users") + ` (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            email text NOT NULL UNIQUE,
            display_name text NOT NULL,
            version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
        )`,
        `CREATE TABLE ` + f.table("audit") + ` (
            user_id bigint NOT NULL REFERENCES ` + f.table("users") + `(id),
            event text NOT NULL
        )`,
    }
    for _, statement := range statements {
        if _, err := db.ExecContext(ctx, statement); err != nil {
            t.Fatal(err)
        }
    }
    return f
}

func (f fixture) table(name string) string {
    // All call sites use literal table names owned by this test file.
    return `"` + f.schema + `"."` + name + `"`
}

func withTx(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) error {
    tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
    if err != nil {
        return err
    }
    defer tx.Rollback()
    if err := fn(tx); err != nil {
        return err
    }
    return tx.Commit()
}

func countRows(t *testing.T, ctx context.Context, f fixture, table string) int {
    t.Helper()
    var count int
    if err := f.db.QueryRowContext(ctx, `SELECT count(*) FROM `+f.table(table)).Scan(&count); err != nil {
        t.Fatal(err)
    }
    return count
}
```

### Rollback means no durable partial result

Fail after writes; observe from the independent pool after callback return. In-transaction reads prove only the private view. Separately exercise real constraints/cancellation.

```go
func TestRollbackRemovesAllWrites(t *testing.T) {
    f := openFixture(t)
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    rejected := errors.New("application rejected operation after writes")

    err := withTx(ctx, f.db, func(tx *sql.Tx) error {
        var id int64
        if err := tx.QueryRowContext(ctx,
            `INSERT INTO `+f.table("users")+` (email, display_name)
             VALUES ($1, $2) RETURNING id`, "ada@example.com", "Ada").Scan(&id); err != nil {
            return err
        }
        if _, err := tx.ExecContext(ctx,
            `INSERT INTO `+f.table("audit")+` (user_id, event) VALUES ($1, $2)`,
            id, "user.created"); err != nil {
            return err
        }
        return rejected
    })
    if !errors.Is(err, rejected) {
        t.Fatalf("error = %v, want application rejection", err)
    }
    if got := countRows(t, ctx, f, "users"); got != 0 {
        t.Fatalf("partial user commit: %d rows", got)
    }
    if got := countRows(t, ctx, f, "audit"); got != 0 {
        t.Fatalf("partial audit commit: %d rows", got)
    }
}
```

`withTx` is a DB-only helper. Application checks use `WithinTransaction(ctx, func(txCtx context.Context) error)` and existing adapters: reads see earlier writes; late failure leaves none; a success control commits both; ordinary calls still work afterward. Detect root-client escape with an independent observer. Reject nested/expired/foreign scopes without writes/fallback; isolate concurrent scopes without shared-field mutation. When implementing these cases, read [SQLite repository tests](../../examples/go/internal/adapter/out/persistence/sqlite/repository/user_test.go), especially `TestProviderReadsUncommittedWriteThroughTransactionContext`, `TestAuditConstraintFailureRollsBackFirstWrite`, `TestTransactionScopeExpiresAfterCallback`, `TestNestedTransactionsRejectExistingScopeWithoutOpeningAnotherTransaction`, `TestForeignPoolScopeRejectsRepositoryAndProviderOperations` and `TestConcurrentOrdinaryCallDoesNotBorrowTransactionScope`. These execute SQLite semantics only, not PostgreSQL/Ent behavior.

### Duplicate race: synchronize both missing observations

Both prechecks reach the barrier before inserts; the constraint chooses the winner. Commit the winner immediately: waiting for both inserts before commit deadlocks a loser waiting on the winner.

```go
func TestDuplicateRaceHasOneDurableWinner(t *testing.T) {
    f := openFixture(t)
    ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()
    ready := make(chan struct{}, 2)
    start := make(chan struct{})
    results := make(chan error, 2)

    for actor := 0; actor < 2; actor++ {
        go func() {
            results <- withTx(ctx, f.db, func(tx *sql.Tx) error {
                var exists bool
                if err := tx.QueryRowContext(ctx,
                    `SELECT EXISTS (SELECT 1 FROM `+f.table("users")+` WHERE email=$1)`,
                    "ada@example.com").Scan(&exists); err != nil {
                    return err
                }
                if exists {
                    return errors.New("fixture was not empty at precheck")
                }
                ready <- struct{}{}
                select {
                case <-start:
                case <-ctx.Done():
                    return ctx.Err()
                }
                _, err := tx.ExecContext(ctx,
                    `INSERT INTO `+f.table("users")+` (email, display_name) VALUES ($1, $2)`,
                    "ada@example.com", "Ada")
                return err
            })
        }()
    }
    for i := 0; i < 2; i++ {
        select {
        case <-ready:
        case <-ctx.Done():
            // Do not abandon actors or clean up their schema while they still run.
            cancel()
            for j := 0; j < 2; j++ {
                <-results
            }
            t.Fatal("actors did not both reach the precheck barrier")
        }
    }
    close(start)
    outcomes := [2]error{<-results, <-results}
    successes, conflicts := 0, 0
    for _, err := range outcomes {
        var pgErr *pgconn.PgError
        switch {
        case err == nil:
            successes++
        case errors.As(err, &pgErr) && pgErr.Code == "23505":
            conflicts++
        default:
            t.Fatalf("unexpected actor result: %v", err)
        }
    }
    if successes != 1 || conflicts != 1 {
        t.Fatalf("successes=%d conflicts=%d", successes, conflicts)
    }
    if got := countRows(t, ctx, f, "users"); got != 1 {
        t.Fatalf("durable users=%d, want 1", got)
    }
}
```

Application integration must map the loser to the accepted conflict, not raw SQL/`500`. Match the intended **named** constraint when several unique keys exist; this primitive has only one relevant unique key, so SQLSTATE suffices here.

### Optimistic locking: both actors start from the same version

Barrier after both version reads; conditional updates increment only the observed version. Read Committed rechecks the waiting update's predicate: exactly one changes a row; zero means stale conflict, not success.

```go
func TestOptimisticUpdateRejectsStaleWriter(t *testing.T) {
    f := openFixture(t)
    ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()
    var id int64
    if err := f.db.QueryRowContext(ctx,
        `INSERT INTO `+f.table("users")+` (email, display_name)
         VALUES ($1, $2) RETURNING id`, "ada@example.com", "initial").Scan(&id); err != nil {
        t.Fatal(err)
    }
    type result struct {
        name    string
        changed int64
        err     error
    }
    ready := make(chan struct{}, 2)
    start := make(chan struct{})
    results := make(chan result, 2)
    for _, name := range []string{"first", "second"} {
        go func(name string) {
            var changed int64
            err := withTx(ctx, f.db, func(tx *sql.Tx) error {
                var version int64
                if err := tx.QueryRowContext(ctx,
                    `SELECT version FROM `+f.table("users")+` WHERE id=$1`, id).Scan(&version); err != nil {
                    return err
                }
                if version != 1 {
                    return fmt.Errorf("starting version=%d, want 1", version)
                }
                ready <- struct{}{}
                select {
                case <-start:
                case <-ctx.Done():
                    return ctx.Err()
                }
                updated, err := tx.ExecContext(ctx,
                    `UPDATE `+f.table("users")+`
                     SET display_name=$1, version=version+1 WHERE id=$2 AND version=$3`,
                    name, id, version)
                if err != nil {
                    return err
                }
                changed, err = updated.RowsAffected()
                return err
            })
            results <- result{name: name, changed: changed, err: err}
        }(name)
    }
    for i := 0; i < 2; i++ {
        select {
        case <-ready:
        case <-ctx.Done():
            cancel()
            for j := 0; j < 2; j++ {
                <-results
            }
            t.Fatal("actors did not both read version 1")
        }
    }
    close(start)
    // Collect every result before assertions can stop the test and trigger cleanup.
    a, b := <-results, <-results
    if a.err != nil || b.err != nil {
        t.Fatalf("actor errors: %v; %v", a.err, b.err)
    }
    if !((a.changed == 1 && b.changed == 0) || (a.changed == 0 && b.changed == 1)) {
        t.Fatalf("affected rows=%d,%d; want one winner and one stale writer", a.changed, b.changed)
    }
    winner := a.name
    if b.changed == 1 {
        winner = b.name
    }
    var name string
    var version int64
    if err := f.db.QueryRowContext(ctx,
        `SELECT display_name, version FROM `+f.table("users")+` WHERE id=$1`, id).Scan(&name, &version); err != nil {
        t.Fatal(err)
    }
    if name != winner || version != 2 {
        t.Fatalf("durable name=%q version=%d, want %q and 2", name, version, winner)
    }
}
```

These tests prove neither arbitrary serializability nor multi-row write-skew prevention. Repeatable Read/Serializable can return `40001` instead; test the selected strategy/bounded whole-transaction retry, never accept arbitrary errors as conflicts.

### Hermetic lifecycle and fixtures

Minimal DDL keeps the primitives visible; application suites must replay reviewed migrations and compose real adapters, not test a schema production never receives.

Own disposable databases/containers/private schemas; match engine, extensions, collation, time zone, constraints and isolation. SQLite cannot simulate PostgreSQL concurrency. File-backed SQLite needs private temp storage, foreign keys on relevant connections and closed pools before file deletion.

Outer rollback fixtures cannot model multi-connection visibility/commit/worker polling: other connections miss uncommitted setup and production may commit elsewhere. Never truncate shared developer DBs.

Register cleanup immediately; cancel/join actors before fatal assertions, close bodies/listeners, roll back transactions, then drop schemas/close pools. Use fresh bounded cleanup context and fail on cleanup errors. Killed runners still need disposable-resource cleanup outside the process.

## 5. Repository and external-operation contract suites

Run one factory-based behavioral suite against every supported real repository adapter, plus reused service fakes where useful. Each factory owns fresh fixture lifecycle:

| Port behavior | Contract cases | Adapter-specific extension |
| --- | --- | --- |
| Create/save | Round-trip canonical fields; generated identity; duplicate identity; constraint mapping | Named database constraint and Ent-to-domain mapper |
| Find | Existing; missing; canceled context; scoped access | Null/zero values, timestamps, SQL error classification |
| List | Stable ordering; empty result; boundaries; page continuation | Real index/query plan and maximum page cost |
| Update | Accepted change; stale version; missing row; immutable fields | Conditional update affected-row handling |
| Transaction scope | Read own writes; full success; failure after first write; panic/cancel behavior | All repositories use transaction-bound clients |

Do not accept arbitrary errors for missing rows: that hides disconnected databases.

External adapters need controlled `httptest.Server` cases for encoding/auth-header placement, limits, cancellation, malformed replies and adopted retry classification. Separately provision safe sandbox checks for provider properties local simulation cannot prove; no real charges. Fixtures do not prove current credentials/provider behavior.

Event contracts test producer schema and consumer tolerance independently. Duplicate IDs must yield one local effect where promised; poison must take the durable quarantine route, not successful processing. An `ExactlyOncePublisher` interface proves nothing.

## 6. Operational, negative, and rollback scenario matrices

Adopt applicable rows with concrete command/runbook, owner, environment and pass criteria—not every mechanism for every app.

### Operation matrix

| Operation | Controlled exercise | Observable pass criterion | Evidence boundary |
| --- | --- | --- | --- |
| Start and serve | Valid config; bind a private listener; reach readiness | Ready only after required dependencies initialize; known request succeeds | Does not prove production ingress or capacity |
| Invalid startup | Missing required config or unavailable required dependency | Nonzero exit or documented not-ready state; safe diagnostic; no partial worker startup | Optional dependencies may have a deliberate degraded mode |
| Request cancellation | Cancel context while real adapter is blocked on a controlled operation | Bounded return and no unintended durable effect | Commit ambiguity needs its own recovery contract |
| Database outage | Block/unavailable test DB with finite timeouts | Bounded failure, safe response, meaningful telemetry, recovery after restoration | A mocked timeout does not prove pool behavior |
| Graceful shutdown | Begin in-flight work, signal process, release work before deadline | Stop admission; drain or cancel as designed; join workers; close pools; bounded exit | `Server.Shutdown` alone does not join application workers |
| Capacity boundary | Defined concurrent workload and fixture size | Stated latency/error budget, bounded pool/queue/memory, no silent drops | A single passing microbenchmark is not a load qualification |
| Worker restart | Persist pending work, stop/restart a controlled process | Work resumes without a forbidden duplicate business effect | Requires real durable components, not an in-memory queue |
| Restore | Restore a backup to isolated infrastructure | Verified schema/data completeness and measured recovery point/time | Having a backup file is not proof of restore |

### Negative scenario matrix

| Scenario | Invariant to assert | Common false positive |
| --- | --- | --- |
| Invalid input | Documented error; no durable mutation | Only checking an error string |
| Cross-tenant identifier | No read, mutation, or existence disclosure under the chosen policy | Testing two users in one tenant only |
| Duplicate request | Chosen conflict/idempotency result; correct durable count | Sequential calls that never exercise contention |
| Failure after first write | No partial state or outbox record | Mock `Rollback` call count |
| Stale update | No overwrite; explicit conflict | A successful unconditional update |
| Dependency returns internal details | Public body omits synthetic secret marker; cause retained internally | Looking for one forbidden JSON key only |
| Publish succeeds, acknowledgment is lost | Replay is safe under chosen deduplication semantics | Mock publish succeeds once |
| Retry budget exhausted | Stops within configured bound; visible recoverable state | Unbounded retry eventually passes the test |
| Pagination under equal timestamps | No skipped or duplicated stable entries under defined consistency model | Fixture has unique timestamps only |

### Rollback and forward-recovery matrix

| Release point | Safe rollback question | Required check or deliberate limitation |
| --- | --- | --- |
| Before migration | Can old binary continue serving? | Baseline health/contract on old schema |
| Additive migration applied | Does old binary ignore the new schema safely? | Old binary against expanded schema, including writes |
| New binary writes new data | Can old binary read/write those rows without corruption? | Mixed-version tests with representative new values |
| Backfill partially complete | Is it resumable and compatible with both readers? | Interrupt/resume; bounded batches; progress verification |
| New constraint enforced | Do all old writers satisfy it? | Old writer cases; reject cutover while incompatible writers remain |
| Old column/event removed | Is backward compatibility intentionally ended? | Explicit deployment boundary and recovery plan; not a casual binary rollback |
| External side effect escaped | Can it be undone or compensated? | Domain-specific compensation/reconciliation; DB rollback is insufficient |
| Corruption or destructive change | Is restore preferable to forward repair? | Rehearsed restore/repair with measured data-loss and downtime limits |

Rollback need not mean down-migration: leave additive schema when binary rollback is safe; destructive changes may require forward repair. Declare the boundary before deployment.

## 7. Migration compatibility and incremental checkpoints

For a `name` → `display_name` evolution, test checkpoints rather than merely generated SQL. When designing the rollout, read [deployment/migration controls](security-and-operations.md#9-deployments-and-database-changes-need-compatibility-evidence).

| Checkpoint | Required evidence |
| --- | --- |
| Characterize/expand | Old null/empty/read/write behavior; migration on empty and representative old data; old binary writes expanded schema safely. A “rename” does not authorize dropping data. |
| Temporary bridge | Every supported reader/writer combination preserves values, whether using dual-write, a DB mechanism or a window without old writers. This deployment bridge is not permanent Go API aliases. |
| Backfill/switch | Interrupt/resume bounded idempotent batches; concurrent user edits survive; remaining-row query matches consistency needs; old/new rows read correctly and backlog/conflict metrics gate traffic. |
| Constrain | Bad old data fails predictably; all live writers satisfy new null/unique rules; representative lock/availability cost is acceptable. |
| Contract | No excluded old app/consumer depends on removed fields; temporary bridge removed; earlier binary rollback is explicitly unsupported. |

Each checkpoint names safe stop state, permitted binaries, verification query and operator rollback/forward action. Replay reviewed migrations—not fresh Ent `Schema.Create`. Review generated SQL for loss/locks/defaults/backfill/engine semantics; separately test extensions, permissions and nontransactional indexes where used. Checksums do not prove compatibility or lock duration.

Synthetic versioned upgrade fixtures cover nulls, duplicates, large/Unicode values, old enums, foreign keys and pending jobs; never commit private exports. Empty-schema replay is not backup restore.

## 8. Complete change walkthroughs

### A. Add a use case: change a user's email

1. **Contract:** reuse approved actor, normalization/uniqueness/verification policy; specify missing, duplicate and stale outcomes. Do not invent verification/events for a local change.
2. **Cases first:** success; domain boundaries; denied actor; duplicate; stale; cancellation. Assert result/durable state and absent forbidden effects.
3. **Implement in existing owners:** command/input result/ports, domain transition, service, guarded repository/read provider, explicit HTTP mapping and composition. When changing signatures/placement, follow [layers](layers.md) and [coding conventions](coding-conventions.md), including ctx-inclusive parameter and entity/collection rules; migrate every caller without aliases.
4. **Challenge integration:** synchronize same-email/same-version callers; fail a later transactional write; disconnect DB; assert exact constraint translation, cause preservation, HTTP contract and external durable state separately. Existing adapters must receive callback `txCtx`, not mutable fields/bundles.
5. **Release:** add needed migrations/compatibility evidence, update public/project guidance, remove obsolete paths and report exercised checks/environment gaps. A new `200` handler alone is not the change.

### B. Add an optional external event after user creation

1. **Applicability:** no consumer means no event. Best-effort may omit outbox only with explicit loss/API semantics; never call it reliable delivery. Required committed delivery uses [reliability and events](reliability-and-events.md).
2. **Producer assertions:** stable minimal versioned public event; success leaves user plus intent, late failure leaves neither, retries preserve approved identity and no internal fields leak.
3. **Controlled worker windows:** before publish, after acceptance/before delivered mark, duplicate, stale lease, poison, exhausted budget and restarted pending work. Use acknowledgment barriers/isolated real broker, not sleeps.
4. **Consumer assertions:** concurrent duplicates yield one durable local effect where promised; test ordering/retention/reconciliation independently, not from row counts.
5. **Rollout:** schema/readers precede activation; compatible payloads, backlog/error observation, rollback retains pending intents. Remove activation bridges after cutover.

### C. Split a growing module without prematurely creating a microservice

1. Diagnose coupled rules/workflows, not folder size; map commands/types/tables/transaction owners and caller capabilities.
2. Characterize cross-owner invariants and public integration behavior plus import graph before moving one coherent slice. Package moves do not remove atomicity requirements.
3. Use narrow real ports, not duplicated models or universal `common` to break cycles. Migrate composition/tests/mappers/transactions and remove aliases/forwarders/empty packages.
4. Enforce imports and behavior: neither core imports adapters; no business rules escaped into HTTP/persistence. An in-process split needs no broker/network retries. Separate deployment instead requires explicit failure/auth/data/compatibility design.

### D. Adapt an existing project with deliberate exceptions

1. Discover canonical guidance, real framework/files/schema lifecycle and accepted policy; map responsibilities rather than rename folders to match the blueprint.
2. Characterize one vertical request's contexts, errors, transactions, auth and compatibility before structural changes.
3. Record applicability and precise exceptions with rule/package/reason/risk/check/owner/revisit trigger. Deployed SQLite excludes PostgreSQL SQLSTATE tests, not real durability/concurrency tests. Generated-code exceptions do not excuse service→Ent imports.
4. Migrate in deployable checkpoints: contexts/safe errors, use-case seam, then specific invariant/transaction gap. Preserve public behavior absent approved change.
5. Install only accepted project-owned rules/reading links, preserving human edits on rerun. Retain enforced exception checks/revisit triggers until closed; never claim full adherence or depend on a future rewrite.

## 9. Architecture enforcement and framework drift

Choose enforcement proportional to the boundary:

| Mechanism | Useful enforcement | Limitation |
| --- | --- | --- |
| Go `internal` packages and package APIs | Prevent some cross-tree imports and access to unexported members | `internal` does not prevent sibling `core` from importing an adapter |
| Compiler/interface assertions | Confirm concrete adapter method signatures | Cannot prove semantics, transactions, or dependency direction |
| Parsed import checks using `go list` or `go/packages` | Reject core imports of HTTP/Chi/Ent/adapters; restrict composition and module edges | Must cover build tags/platforms and transitive exceptions deliberately |
| Maintained dependency linter/custom `go/analysis` analyzer | CI failure with exact import/type violation | Requires ownership, pinned configuration, and exception handling |
| Review checklist | Detect orchestration in handlers, leaked ORM entities, duplicated rules, overbroad ports | Human review is not an automatic gate |
| Source-text assertion | Detect a specific file/string convention | Comments, aliases, generated code, or dead code can satisfy it without behavior |

Check exact core→adapter/HTTP/router/Ent edges, domain→port/service edges, and allowed service→ports/domain directions. Separate runtime/test-source policy and cover build tags/platforms/generated DAO deliberately without exempting handwritten mappers. Integration composition must not weaken production rules.

Import tools cannot see usecase/shared/orchestration peer calls through interfaces or same-package methods; review those. Check `db` independence from provider/repository and real scoped reads/writes; provider naming does not permit replica/root-pool escape.

Prefer structured `go list`/`go/packages` data to substrings. A maintained checker needs a forbidden-import fixture proving it can fail, with exact package/file context. Static gates are not transaction/HTTP evidence.

### Go quality checks without overstating enforcement

When configuring checks, follow [coding conventions](coding-conventions.md): only added runner is project-local pinned golangci-lint with owned config verified against the same compatible binary in CI. Exercise four-total/five-total parameter declarations and Command correction (`ctx` counts; receiver does not).

Built-ins do not fully enforce entity/value collections, dependency roles, peer calls or blank lines between handwritten functions. Review gaps; do not add gofumpt/duplicate runners/unrequested analyzers. Generated exclusions cannot hide handwritten mappers/imports. Tool approval is not approval for global installs, broad formatting/refactors or `--fix`.

### Detect and resolve guidance/framework drift

On dependency/generator/guidance changes:

1. Compare accepted rules to real imports/wiring/migrations/contracts/pinned configuration; distinguish API from invariant change.
2. Check official documentation for deployed versions, not a silent latest-version Ent/Chi upgrade.
3. Adapt middleware at HTTP and ORM/client changes at persistence/composition; keep neutral ports or migrate every caller explicitly.
4. Update relevant examples/contracts/import rules/project guidance together; remove contradictory recipes and preserve deliberate exceptions/human decisions.
5. Report actual evidence: links prove reachability, generation diffs prove generation—not semantics/compatibility.

Review on boundary changes; do not overwrite the project handbook from shared source.

## 10. Selecting commands and reporting evidence

Command menu for a **target Go project** with actual packages/tags/pinned dependencies and disposable infrastructure, not necessarily harness-flow:

```sh
# Fast domain/service/adapter behavior without the integration build tag.
go test ./internal/...

# Shared-memory races on exercised paths, not database serializability.
go test -race ./internal/...

# Real database checks; provision TEST_DATABASE_DSN securely beforehand.
go test -tags=integration -count=1 -timeout=2m ./test/integration/...

# Re-exercise the deterministic conflicting precondition, without sleeps.
go test -tags=integration -run 'Test(DuplicateRace|OptimisticUpdate)' -count=20 -timeout=3m ./test/integration/...

# Static diagnostics complement tests; they do not execute use cases.
go vet ./...

# Use the approved project-local pinned runner and owned config.
./bin/golangci-lint config verify --config .golangci.yml
./bin/golangci-lint run --config .golangci.yml ./...
```

Use actual package/test names and pinned CI provisioning. `-count=1` avoids cached integration success; repetitions expose schedules but cannot replace barriers. Race jobs need supported toolchains/platforms and resource budgets.

For teaching-slice commands, use [the executable README](../../examples/go/README.md). Its SQLite/stdlib tests prove only exercised local paths—not Chi/Ent/PostgreSQL, production authorization or broker deployment. Those need their actual integration/operational suites.

### An evidence statement must identify the boundary

Report only observed results, e.g.:

> Domain/HTTP checks passed in named packages; PostgreSQL engine/version and private-schema cases covered rollback, duplicate race and versioned updates; listed release pairs passed migration/old-writer tests. No broker, production auth, ingress/load or restore exercise ran.

Name missing command/environment and unverified invariant. Build failure, skipped, proposed and passing are different states; a successful reasoning exercise is not a failed baseline.

| Evidence | Does not prove |
| --- | --- |
| Compiler, selected packages/tags/platforms | Business correctness |
| Source-text assertion | Runtime wiring/persistence |
| Unit test with fake | Real DB uniqueness, network cancellation or delivery |
| Actual DB statements/adapters/configuration | Every interleaving, plan, migration or outage |
| Race detector on executed paths | Database lost updates, all deadlocks, exactly-once effects |
| Migration replay on fixture | Old-writer compatibility, production lock time, restore |
| Consumer/producer contracts | Every third-party consumer |
| Deployment smoke | Capacity/security/disaster-recovery certification |
| Benchmark with workload/data/environment/uncertainty | Capacity beyond the measured conditions |
| High coverage percentage | That important invariants were asserted |
