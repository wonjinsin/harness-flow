# Testing and evolving a Go application

Use this guide to choose evidence for a change, not to maximize mock counts. The invariant belongs to the consumer: a caller receives the documented result, forbidden work does not become durable, concurrent callers cannot violate the rule, and operators can recover the system within an agreed boundary.

Read [architecture](architecture.md) and [layers](layers.md) for placement, [coding conventions](coding-conventions.md) for concrete Go boundary and tooling rules, [domain](domain.md) for model rules, [data and transactions](data-and-transactions.md) for persistence contracts, [reliability and events](reliability-and-events.md) for delivery semantics, and [security and operations](security-and-operations.md) for operational controls. This chapter owns how to challenge those decisions and evolve them without silently changing their guarantees.

## 1. Applicability and the evidence boundary

Use the applicability labels from [adoption](../adoption.md), not a second maturity score:

- **Required baseline:** deterministic domain and use-case checks; HTTP contract checks for an HTTP application; real-adapter checks for each selected persistence technology; bounded test resources; explicit compatibility decisions; honest verification claims. A small CRUD application still needs these where the relevant boundary exists.
- **Required when concurrent writes can violate an invariant:** synchronized concurrency tests against the actual database, its deployed isolation level, and the actual constraints or conditional updates. A single-process handler test is not a substitute.
- **Required when a schema, public API, event schema, or deployment compatibility window changes:** migration/contract compatibility checks and a reviewed rollout/rollback plan.
- **Required when durable asynchronous delivery is adopted:** crash-window, duplicate-delivery, retry-exhaustion, and replay tests. Do not add a broker merely to satisfy this category.
- **Required when authorization, tenancy, or background workers exist:** cross-principal denial tests, tenant isolation, or worker lifecycle checks respectively.
- **Optional:** fuzzing beyond high-risk parsers, mutation testing, model-based concurrency checking, consumer-driven contract infrastructure, and performance gates beyond identified budgets. Adopt them to close a named evidence gap.
- **Needs project decision:** public conflict semantics, supported old/new deployment combinations, data recovery objectives, test database provisioning, and accepted architecture exceptions. Discover existing decisions before asking humans to make them again.

Test directories without implemented cases provide no behavioral evidence. A precheck-before-insert flow is not concurrency proof, a request correlation identifier is not a database transaction, and discarded contexts or flattened error causes are not testing conventions to reproduce.

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

Maintain a short requirement-to-test map in the project-owned guidelines or change review. Name the invariant, test entry point, dependencies, negative scenario, and remaining uncertainty. Do not create dozens of tests that merely assert the same mock call sequence.

## 2. Test placement and deterministic seams

Keep fast tests beside the implementation: `internal/core/domain/*_test.go`, `internal/core/service/usecase/<domain>/*_test.go`, real shared/orchestration packages, and the HTTP adapter's tests. Put real cross-adapter/database checks under `test/integration` when they need dedicated infrastructure. Keep protocol fixtures in the owning package's `testdata` directory. `internal/mock` or `test/mocks` may hold useful shared doubles; their existence does not require using generated mocks everywhere.

Prefer external test packages for public behavior. Use an internal package test only when a public assertion cannot localize a significant algorithmic defect; do not export production internals solely for tests. Compile-time interface satisfaction is useful, but `var _ outport.UserRepository = (*UserRepository)(nil)` says nothing about repository semantics.

Control sources of nondeterminism at existing boundaries:

- Inject a clock only when business time changes a decision. Use one fixed instant and exercise immediately before, exactly at, and immediately after a deadline. Do not compare a created timestamp to two unrelated calls to `time.Now()`.
- Inject or supply IDs where identity affects behavior. Assert relationships and nonzero identities, not sequence values. PostgreSQL sequence increments need not roll back.
- Use explicit ordering and stable tie-breakers in list contracts. Insertion order is not a query-order guarantee.
- Use private fixtures per test. Do not reuse a mutable global fake, environment setting, HTTP server, schema, or shared email across parallel tests.
- Pass the caller's context through the handler, input port, service, output port, and database operation. A canceled-context test must reach the real adapter as well as the service seam.
- Replace wall-clock waiting with a fake clock for business timers, a channel for actor readiness, or a condition supplied by the component. A deadline bounds failure; it does not orchestrate success.

A wrong concurrency test starts two goroutines and sleeps for 100 ms before checking a count. It may pass without overlap or fail only on a loaded runner. A useful test establishes the conflicting precondition, releases both actors explicitly, waits for both outcomes, and checks durable state.

### Domain boundary example

This exercises the scoped User API in [layers](layers.md), with its explicitly chosen error vocabulary and email policy. The example API is `NewUser(id int, name, email string, now time.Time) (*User, error)`, with readable `User.Name`/`User.Email` and `ErrInvalidUser` matchable with `errors.Is`. The example profile explicitly chooses trimming, lowercasing its canonical email key, and a nonblank name. Do not adopt lowercasing as a universal email-identity rule without a domain decision.

```go
package domain_test

import (
    "errors"
    "testing"
    "time"

    "example.com/app/internal/core/domain"
)

func TestNewUserBoundaries(t *testing.T) {
    tests := []struct {
        name      string
        inputName string
        email     string
        wantErr   error
    }{
        {"blank name", " \t", "ada@example.com", domain.ErrInvalidUser},
        {"blank email", "Ada", " \t", domain.ErrInvalidUser},
        {"missing separator", "Ada", "not-an-email", domain.ErrInvalidUser},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            user, err := domain.NewUser(0, tt.inputName, tt.email, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
            if !errors.Is(err, tt.wantErr) {
                t.Fatalf("error = %v, want %v", err, tt.wantErr)
            }
            if user != nil {
                t.Fatal("invalid construction returned a usable user")
            }
        })
    }
    t.Run("canonical identity", func(t *testing.T) {
        user, err := domain.NewUser(0, " Ada ", " ADA@example.com ", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
        if err != nil {
            t.Fatal(err)
        }
        if user.Name != "Ada" || user.Email != "ada@example.com" {
            t.Fatalf("unexpected canonical fields: name=%q email=%q", user.Name, user.Email)
        }
    })
}
```

If names or input sizes have a documented maximum, add `limit-1`, `limit`, and `limit+1` cases in the documented unit: bytes, Unicode code points, or grapheme clusters are not interchangeable. Test transitions on already valid objects too; constructor coverage does not prevent a later mutator from breaking an invariant. A test that reproduces the constructor's regular expression inside the assertion only compares two copies of the same idea.

### Service checks without mock theater

For a create use case, use a small stateful repository double to demonstrate that the returned identity can be read back, rejected input leaves the store unchanged, a repository conflict becomes the documented application conflict, and wrapped infrastructure failures retain `errors.Is`/`errors.As` identity. A fake may implement uniqueness under a mutex so its own behavior is coherent; that mutex is not evidence about PostgreSQL.

A strict interaction assertion is justified for an observable boundary: a forbidden principal must not trigger a charge, a canceled operation must not start an external effect, or an invalid command must not perform writes. Prefer asserting the externally relevant result and state first. Do not assert every internal read order unless that order itself protects the invariant.

For transaction orchestration, a test double can check that all repositories given to the callback come from the same scope. Follow it with a real-adapter test: start the use case, allow its first durable operation, fail a later operation, and observe from outside the transaction that no partial result exists. Merely asserting `Rollback()` was called cannot establish this.

## 3. HTTP behavior and contracts

Exercise the actual router, DTO mapping, error mapper, and applicable middleware. The HTTP contract includes status, headers, machine-readable error code, body shape, field presence/absence, input limits, method handling, and safe error output—not the handler's private helper names. Avoid matching an entire JSON string when field order is irrelevant.

The following reusable assertion function is complete test-side code. Place it in the HTTP adapter's test package and call it from a project `TestCreateHTTPContract` with the application's concretely composed `http.Handler`. The composition is project-specific; this function does not invent a second router or handler implementation. Each call requires fresh persistent state and an unused `ada@example.com`. Its deliberately chosen sample contract is anonymous `POST /users`, `201` success with `id`/`email`, `409` with code `user_conflict`, and malformed JSON `400` with code `invalid_request`. Bind it to the accepted API contract; for authenticated APIs, supply an authenticated client fixture rather than disabling authorization.

```go
package http_test

import (
    "encoding/json"
    "io"
    "mime"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
)

func AssertCreateHTTPContract(t *testing.T, h http.Handler) {
    t.Helper()
    send := func(body string) *httptest.ResponseRecorder {
        t.Helper()
        req := httptest.NewRequest(http.MethodPost, "/users", strings.NewReader(body))
        req.Header.Set("Content-Type", "application/json")
        rec := httptest.NewRecorder()
        h.ServeHTTP(rec, req)
        mediaType, _, err := mime.ParseMediaType(rec.Header().Get("Content-Type"))
        if err != nil || mediaType != "application/json" {
            t.Fatalf("content type = %q, error = %v", rec.Header().Get("Content-Type"), err)
        }
        return rec
    }
    decode := func(rec *httptest.ResponseRecorder) map[string]json.RawMessage {
        t.Helper()
        dec := json.NewDecoder(rec.Body)
        var body map[string]json.RawMessage
        if err := dec.Decode(&body); err != nil {
            t.Fatal(err)
        }
        var extra any
        if err := dec.Decode(&extra); err != io.EOF {
            t.Fatalf("response contains extra JSON: %v", err)
        }
        return body
    }

    good := `{"name":"Ada","email":"ada@example.com"}`
    created := send(good)
    if created.Code != http.StatusCreated {
        t.Fatalf("create status = %d", created.Code)
    }
    body := decode(created)
    var id int
    var email string
    if err := json.Unmarshal(body["id"], &id); err != nil || id <= 0 {
        t.Fatalf("invalid id: %s, %v", body["id"], err)
    }
    if err := json.Unmarshal(body["email"], &email); err != nil || email != "ada@example.com" {
        t.Fatalf("invalid email: %s, %v", body["email"], err)
    }
    for _, key := range []string{"password", "password_hash", "tenant_secret"} {
        if _, exists := body[key]; exists {
            t.Fatalf("private field exposed: %s", key)
        }
    }

    for _, tt := range []struct {
        name   string
        input  string
        status int
        code   string
    }{
        {"duplicate", good, http.StatusConflict, "user_conflict"},
        {"malformed", `{"name":`, http.StatusBadRequest, "invalid_request"},
    } {
        t.Run(tt.name, func(t *testing.T) {
            rec := send(tt.input)
            if rec.Code != tt.status {
                t.Fatalf("status = %d, want %d", rec.Code, tt.status)
            }
            raw := decode(rec)
            var code string
            if err := json.Unmarshal(raw["code"], &code); err != nil || code != tt.code {
                t.Fatalf("code = %q, error = %v", code, err)
            }
            for _, key := range []string{"stack", "sql", "cause"} {
                if _, exists := raw[key]; exists {
                    t.Fatalf("internal error field exposed: %s", key)
                }
            }
        })
    }
}
```

This assertion checks named forbidden fields, not every possible disclosure. Add a dependency-failure case whose internal error contains a distinctive synthetic marker; assert the marker is absent from the entire response and present only in approved internal diagnostics. Do not use real credentials in leakage tests. Test malformed/trailing JSON, unsupported media types, oversize bodies, method mismatch, missing objects, and unauthorized/forbidden access according to the actual API's contract. Do not change an API from `422` to `400` merely because this example uses `400`.

Run contract checks with a deterministic input-port double to isolate HTTP mapping, then run selected cases through the real service and database to verify wiring and persistence. Distinguish those reports. `httptest.ResponseRecorder` does not model HTTP/2, TLS, streaming disconnects, or reverse-proxy behavior; use `httptest.Server` and deployment-level checks for the relevant boundary.

For public interfaces, validate producer responses and consumer requests against the versioned OpenAPI/JSON/event schema when one exists. Include old consumer fixtures, optional-field omission, unknown additive fields where allowed, nullability, pagination tokens, and error variants. A generated schema or generated client compiling is not proof that deployed consumers remain compatible.

## 4. Real PostgreSQL: rollback, duplicate races, and optimistic locking

The next four blocks form one illustrative `test/integration/postgres_semantics_test.go` file. They use `database/sql` with the project's pinned `github.com/jackc/pgx/v5` dependency, a dedicated disposable PostgreSQL test database, and a test role allowed to create/drop schemas. They are not Ent production implementation code. They establish database primitives under explicit Read Committed isolation. Adapt the same assertions to real Ent repositories and the service unit-of-work boundary before claiming application atomicity or adapter error translation.

Run only against an explicitly provisioned, disposable database. `TEST_DATABASE_DSN` is required when this integration suite is selected; absence fails rather than silently yielding a green skipped suite. The helper creates a random private schema, uses fully qualified names on every connection, registers cleanup before DDL, and has bounded operations and cleanup. It deliberately does not mutate a pooled connection's `search_path` and assume every connection inherited it.

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

The failure occurs after both writes, not before the transaction begins. Observation uses the pool after the callback returns; a read inside the transaction would only prove its private view. The sentinel represents an application rejection discovered late; separately test real constraint errors and context cancellation through your adapter.

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

For the application version, replace the direct SQL callback with the actual input-port use case and transaction factory. If a repository accidentally uses its root Ent client rather than the transaction-bound client, this same outside observer must detect the surviving write. Include a successful control proving both records commit; a test in which nothing ever writes cannot prove rollback wiring.

### Duplicate race: synchronize both missing observations

Both actors perform the existence precheck before either can insert. The barrier therefore reproduces the vulnerable precondition deterministically. The database uniqueness constraint—not the precheck—chooses the winner. The winner commits immediately; waiting for both inserts before permitting either commit would manufacture a test deadlock because the second insert can wait for the first transaction.

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

At the application boundary, assert the loser returns the documented conflict rather than a raw SQL error or generic `500`. Match the intended named uniqueness constraint in adapter error translation when multiple unique keys exist; this primitive example checks SQLSTATE only because its insert has one relevant unique key. An unexpected constraint violation must not be mislabeled as an email conflict.

### Optimistic locking: both actors start from the same version

The barrier is after the reads. Each actor updates only `WHERE version = observed_version` and increments the version. Under PostgreSQL Read Committed, the competing update waits as necessary and rechecks its predicate. Exactly one affects a row. A zero-row update is the stale-write outcome, not a successful no-op.

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

These tests do not prove arbitrary serializability, prevent write skew across multiple rows, or cover a different isolation level. Repeatable Read/Serializable may yield `40001` rather than the stale-update outcome used here. Test the chosen strategy and any bounded whole-transaction retry policy explicitly; do not loosen assertions to accept every database error as a valid conflict.

### Hermetic lifecycle and fixtures

The complete fixture's DDL is intentionally minimal so the mechanics are visible. Application integration must replay the reviewed migration history and construct real adapters against the resulting schema. Otherwise tests may pass against a hand-built schema that production never receives.

Use a disposable database/container per suite or a private schema/database per test, as supported by the stack. Match production's engine family and important extensions, collation, time zone, constraint definitions, and isolation level. SQLite is not an interchangeable PostgreSQL concurrency simulator. A file-backed SQLite fixture needs a private temporary directory, foreign-key configuration on the relevant connections, and cleanup of all connections before deleting the files.

Do not wrap every test in one outer rollback transaction when testing multi-connection visibility, commit behavior, worker polling, or transaction boundaries. Other connections cannot see its uncommitted fixtures, and production code might commit through a different connection. Explicit per-test fixture ownership is clearer. Do not `TRUNCATE` a shared developer database to make a parallel test isolated.

Register `t.Cleanup` immediately after acquiring a resource. Shut down and join workers, close response bodies and listeners, roll back open transactions, then drop the schema and close pools. Cancellation must release blocked actors; collect every worker result before calling `t.Fatal`. Cleanup uses a fresh bounded context because the request/test operation's context may already be canceled. Cleanup failures fail the test; do not silently leak schemas or processes. Infrastructure crashes still require the suite's disposable-resource cleanup policy—no in-process cleanup can survive a killed runner.

## 5. Repository and external-operation contract suites

A repository contract suite is a function receiving a factory that creates a fresh repository plus its fixture lifecycle. Run the same behavioral cases against every supported real adapter; run a fake too if the fake is reused for service tests, so the fake does not silently promise different behavior.

The suite should specify more than method signatures:

| Port behavior | Contract cases | Adapter-specific extension |
| --- | --- | --- |
| Create/save | Round-trip canonical fields; generated identity; duplicate identity; constraint mapping | Named database constraint and Ent-to-domain mapper |
| Find | Existing; missing; canceled context; scoped access | Null/zero values, timestamps, SQL error classification |
| List | Stable ordering; empty result; boundaries; page continuation | Real index/query plan and maximum page cost |
| Update | Accepted change; stale version; missing row; immutable fields | Conditional update affected-row handling |
| Transaction scope | Read own writes; full success; failure after first write; panic/cancel behavior | All repositories use transaction-bound clients |

Keep infrastructure errors distinguishable from not-found/domain conflicts. A suite that accepts any error for a missing record also accepts a disconnected database and therefore hides an outage.

For an external API adapter, use a local `httptest.Server` with controlled replies to verify request encoding, authentication header placement without logging the secret, response limits, deadline/cancellation, malformed response handling, and the adopted retry classification. Add a limited real sandbox/provider contract check when the protocol's meaningful properties cannot be simulated locally; keep it separate, explicitly provisioned, and safe from real charges. An emulator or recorded fixture does not prove today's provider accepts your credentials or semantics.

For events, test producer schema and consumer tolerance separately. Replay the same event ID twice and verify one business effect where deduplication is promised. Test a poison payload that is not acknowledged as successfully processed, and verify the selected quarantine/recovery route. Do not call an interface `ExactlyOncePublisher` and infer an exactly-once business guarantee from compilation.

## 6. Operational, negative, and rollback scenario matrices

Use these as applicability-driven scenarios, not as assertions that every application needs every mechanism. Fill in the actual command/runbook, owner, environment, and pass criteria when adopting a row.

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

A rollback plan is not necessarily a down-migration. Dropping an added column can destroy data needed by the currently deployed binary. Often the safe rollback is to roll back the application while leaving additive schema in place; sometimes only forward repair is safe. State that boundary before deployment.

## 7. Migration compatibility and incremental checkpoints

Use reviewed, versioned migrations for controlled environments. Ent schema generation is useful input; a fresh `Schema.Create` call in tests is not equivalent to replaying production's migration history. Generated migration SQL must be reviewed for data loss, locks, defaults, backfill cost, and engine-specific behavior.

For a field evolution such as introducing `display_name` alongside an existing `name` column:

1. **Characterize:** capture old reader/writer behavior, null/empty semantics, data volume, and the supported deployment window. Record that “rename” is not yet an authorization to drop `name`.
2. **Expand:** add the new nullable/default-compatible field without breaking old readers/writers. Apply the migration to both an empty database and representative old data. Exercise the old binary against it.
3. **Bridge deliberately:** choose how values stay consistent while both versions run: application dual-write, a database mechanism, or a deployment window without old writers. This is a temporary data-compatibility mechanism, not permission for permanent Go API aliases. Test every supported writer/read combination.
4. **Backfill:** update bounded batches with an idempotent predicate. Stop halfway, rerun, and verify that concurrent user changes are not overwritten. Count/check remaining rows using a read consistent with the migration's verification needs.
5. **Switch reads:** make the new binary read the new field according to the agreed fallback window. Check newly created and preexisting rows. Observe error/conflict and incomplete-backfill metrics before expanding traffic.
6. **Constrain:** enforce non-null or new uniqueness only after data is compliant and all live writers satisfy it. Test the failing-data path and the expected lock/availability budget on representative scale.
7. **Contract:** remove the old field and temporary read/write bridge only after the oldest incompatible binary and consumer are excluded by the release policy. Exercise the post-contract schema and state that earlier application rollback is no longer supported.

At each checkpoint, identify the exact safe stop state, permitted binary versions, data verification query, operator decision, and rollback/forward-recovery action. A checksum-valid migration directory does not prove data compatibility or acceptable lock duration. Test extension creation, indexes, permissions, and nontransactional migration steps separately when the project uses them.

Representative upgrade fixtures include old nullable values, duplicates that would violate a proposed constraint, large/Unicode values, previously valid enum values, foreign-key relationships, and partially processed jobs. Keep them synthetic and versioned; do not commit production exports or private data. Test backup/restore separately from schema replay: reconstructing an empty database is not restoring a real one.

## 8. Complete change walkthroughs

### A. Add a use case: change a user's email

1. **Write the consumer contract.** Decide who may change the email, normalization/uniqueness rules, whether verification is required, and what the client sees on missing user, duplicate email, and stale version. Reuse existing auth/domain rules. Do not invent verification or event delivery if the requirement is just a local change.
2. **Identify the boundary.** Add the mutation input to `internal/core/port/in/command`, and the result and interface method to `internal/core/port/in`, implemented by `internal/core/service/usecase/user`. Keep existing Query and result ownership unchanged; migrate all Command callers directly without parent-package aliases. Apply the ctx-inclusive five-parameter rule and entity pointer/named-collection contracts. Put email/transition invariants in `internal/core/domain`. Extend `internal/core/port/out` only for a needed provider query or repository mutation such as conditional email change. Keep HTTP, Chi, Ent types, and SQL errors out of these ports.
3. **Start with the failing behavior.** Domain boundaries; service success; rejected actor; duplicate; stale version; canceled request. Assert result/state and absence of forbidden mutations, not a preferred internal helper sequence.
4. **Implement persistence.** Add reviewed schema/migration changes only if the invariant needs them. Use `internal/adapter/out/persistence/postgres/provider` for reads, `repository` for writes and scope assembly, `db` for reusable connection/transaction mechanics, and adapter-local mapping such as `postgres/dao/user_mapper.go`. Map the exact relevant constraint to a semantic conflict and preserve unexpected causes. Pass `ctx` and use the same transaction-bound provider/repository handles if several operations must be consistent.
5. **Expose the transport.** Add request/response mapping in `internal/adapter/in/http/dto/user_mapper.go`, handler delegation through the inbound port, and route/middleware registration in the router. Use composition in `cmd/api/main.go` for concrete dependencies, not a handler-created repository.
6. **Challenge the actual guarantee.** Two callers target the same email; two edits carry the same version; a later write fails; the database is unavailable. Check HTTP error mapping separately from durable state. Add compatibility cases for consumers if the public contract changed.
7. **Finish the release.** Update project-owned guidance/API documentation and the operation matrix if the behavior changes operations. Remove obsolete callers/paths. Review the diff against the invariant and report checks actually executed plus remaining environmental gaps.

The finished change is not merely a new handler returning `200`: it includes the chosen domain behavior, durable conflict handling, mapped errors, migrated callers, tests at the relevant boundaries, and an applicable rollout path.

### B. Add an optional external event after user creation

1. **Decide whether delivery is required.** If no consumer needs the event, do not add it. If best-effort delivery is acceptable, document exactly what can be lost and how failure affects the API. If the business requires eventual delivery of every committed creation, adopt the durable approach in [reliability and events](reliability-and-events.md).
2. **Define the public event contract.** Name/version, stable event ID, aggregate identity, occurrence time, minimal safe payload, and consumer compatibility. A new event is an external API, not an export of the internal User or Ent entity.
3. **Choose atomic intent.** For durable delivery, user persistence and outbox intent share the service's local transaction. A broker publish inside the transaction does not make the database and broker atomic. Keep broker implementation details behind output ports and wiring.
4. **Build the producer checks.** Successful use case leaves one user and one intent; failure after either write leaves neither; a retry/idempotent request follows the adopted identity semantics. The event payload round-trips against its contract without leaking internal fields.
5. **Build worker/recovery checks.** Failure before publish; failure after publish before marking delivered; duplicate replay; lease expiry; poison payload; budget exhaustion; restart with pending rows. Synchronize a test publisher's acknowledgment barrier or use the real broker in an isolated environment. Do not sleep and hope to hit the crash window.
6. **Verify the consumer effect.** If deduplication is promised, duplicate event IDs yield one durable business effect under concurrent consumption. Event ordering, broker retention, and cross-service reconciliation are separate decisions; do not claim them from an outbox row count.
7. **Roll out compatibly.** Deploy schema/readers before activating production, control activation through accepted configuration, observe backlog age and failures, and preserve pending intents during rollback. Stopping the worker is not permission to discard its backlog. Remove temporary paths when the cutover is complete.

For a non-durable best-effort event, omit outbox machinery intentionally and test the agreed failure semantics. Never label that path “reliable delivery.”

### C. Split a growing module without prematurely creating a microservice

1. **Find the cause.** Review changes and invariants: are unrelated rules coupled, does one service coordinate too many unrelated operations, or are folders merely large? Size alone is not a bounded-context boundary.
2. **Draw ownership.** Assign commands, domain types, tables, and transactions to explicit owners. Map which existing callers need which capabilities. Identify cross-owner invariants before moving code; a package move does not remove their transaction requirement.
3. **Characterize public behavior.** Preserve existing consumer contracts and create integration cases for workflows that cross the proposed boundary. Capture the dependency/import graph before the change.
4. **Move one coherent slice.** Keep the canonical responsibilities and adapt names to the existing project. Introduce a consumer-owned narrow port only where it decouples a real dependency. Do not duplicate domain models casually or create a universal `common` package to break import cycles.
5. **Migrate every caller.** Rewire composition, tests, DTO/domain/DAO mappers, and transactions. Remove obsolete aliases, forwarding interfaces, empty packages, and duplicate rules. A deliberate temporary deployment-data bridge is different from indefinite source compatibility shims.
6. **Enforce the boundary.** Run import rules and behavioral contracts. Verify that neither core imports an adapter and that the split did not move business rules into HTTP or persistence to escape a cycle.
7. **Reassess operations only if process boundaries change.** An in-process module split does not need a broker, distributed transaction, network retries, or independent deployments. If separate deployment is truly required, design failure, authorization, data ownership, and compatibility before claiming the split complete.

### D. Adapt an existing project with deliberate exceptions

1. **Read its authority.** Locate its canonical instructions, current framework, accepted docs, schema lifecycle, and representative working code. Map canonical roles to actual files before proposing edits. Do not rename `application` to `core/service` merely to match a diagram.
2. **Characterize a vertical slice.** Choose one real request through transport, use case, and persistence. Record actual context propagation, errors, transaction scope, authorization, and public compatibility. Add useful missing behavior checks before structural changes.
3. **Record applicability.** Use the project's adoption record: adopted, deferred, not applicable, or open, with a reason. For example: SQLite is the deployed database, so PostgreSQL-specific SQLSTATE tests are not applicable; actual SQLite durability/concurrency tests remain required. “No external consumers” can defer event infrastructure, not database uniqueness checks.
4. **State exceptions precisely.** Record rule, exact packages, reason, risk, compensating check, owner, and revisit trigger. An existing generated Ent edge may be exempt from a generic generated-code lint; a service importing Ent is not silently acceptable because the test passes.
5. **Migrate incrementally.** First ensure caller contexts and safe error mapping; then isolate the use-case seam; then correct a specific transaction/invariant gap. Keep public behavior stable unless a reviewed requirement changes it. Each checkpoint must remain deployable with its stated compatibility window.
6. **Install project-owned guidance.** Put accepted mappings/rules in the project's selected instruction/docs surface, with only the approved reading link in canonical guidance. The shared handbook is reference material, not a second competing authority. Preserve human edits on rerun and show a reviewable diff.
7. **Close the exception or keep it honest.** If it remains deliberate, enforce its compensating checks and revisit trigger. Do not quietly claim full adherence or leave every change dependent on a future total rewrite.

## 9. Architecture enforcement and framework drift

Documentation explains intent; it cannot reject a forbidden import. Choose enforcement proportional to the boundary:

| Mechanism | Useful enforcement | Limitation |
| --- | --- | --- |
| Go `internal` packages and package APIs | Prevent some cross-tree imports and access to unexported members | `internal` does not prevent sibling `core` from importing an adapter |
| Compiler/interface assertions | Confirm concrete adapter method signatures | Cannot prove semantics, transactions, or dependency direction |
| Parsed import checks using `go list` or `go/packages` | Reject core imports of HTTP/Chi/Ent/adapters; restrict composition and module edges | Must cover build tags/platforms and transitive exceptions deliberately |
| Maintained dependency linter/custom `go/analysis` analyzer | CI failure with exact import/type violation | Requires ownership, pinned configuration, and exception handling |
| Review checklist | Detect orchestration in handlers, leaked ORM entities, duplicated rules, overbroad ports | Human review is not an automatic gate |
| Source-text assertion | Detect a specific file/string convention | Comments, aliases, generated code, or dead code can satisfy it without behavior |

A useful import policy forbids `internal/core/...` from importing `internal/adapter/...`, `net/http`, the selected router package, and Ent-generated packages. Allow service imports of ports and domain, and port imports of domain; domain must not import either port package or service. Do not use an undifferentiated “all internal imports forbidden” pattern. Check runtime source and test source separately so integration tests may compose real adapters without weakening production rules. Explicitly cover generated DAO directories without allowing those generated types to leak into ports.

Also check usecase/shared/orchestration peer-call bans, including calls through
inbound interfaces and same-package methods that an import linter cannot see.
Keep `persistence/<engine>/db` independent of provider/repository assembly, and
exercise a transaction with scoped reads as well as writes when the invariant
requires them. Read-provider naming is not permission to query a replica or root
pool during an atomic workflow.

Prefer structured package data to substring searches: collect package/import edges, classify by canonical-to-actual mapping, and fail on exact forbidden edges with file/package context. Include a tiny forbidden-import fixture when maintaining an architecture checker, so a broken checker cannot turn every CI run green. If a selected build tag can introduce an adapter dependency into core, the CI matrix must exercise that tag. These are architectural checks, not evidence of rollback or safe HTTP behavior.

### Go quality checks without overstating enforcement

Follow [coding conventions](coding-conventions.md) for the sole added Go quality
runner, golangci-lint. Validate the project-owned config against the selected
compatible binary and use the same fixed release/config locally and in CI.
Exercise a temporary four-total/five-total parameter declaration and its
Command-based correction; `ctx` counts and the receiver does not.

The configured built-ins are not a complete architecture or formatting policy:
inspect entity versus value semantics, named pointer collections, dependency
roles, peer calls and blank lines between all handwritten function declarations.
Do not add gofumpt, standalone duplicate linters or an unrequested custom
analyzer to fill a coverage gap. Generated-code exclusions must leave handwritten
adapter mappers and production import rules in scope. Tooling/config approval
does not authorize global installs, application refactors, broad formatting or
automatic `--fix`.

### Detect and resolve guidance/framework drift

When dependencies, generators, or guidelines change:

1. Compare the accepted project rules to actual imports, constructor wiring, migrations, public contracts, and pinned dependency/generator configuration. Separate a changed API from a changed invariant.
2. Confirm the relevant official documentation for the deployed/pinned versions. Do not copy a latest-version Ent/Chi example into an older project and silently update the architecture decision.
3. Adapt at the boundary: framework middleware lives in the inbound adapter; Ent transaction/client changes live in persistence/composition; core ports remain transport/persistence neutral. If a core contract truly must change, migrate every caller explicitly.
4. Update focused examples, contract fixtures, dependency rules, and project guidance together. Keep local decisions and deliberate exceptions current. Remove obsolete guidance rather than leaving two contradictory recipes.
5. Report the exact verification scope. A documentation link check establishes that a link resolves, not that guidance is semantically correct. A generated-code diff establishes generation, not backward compatibility.

A scheduled review can detect slow drift, but the strongest trigger is a change touching the relevant boundary. Avoid automatically overwriting the accepted project handbook from the shared source: project decisions and human edits carry authority.

## 10. Selecting commands and reporting evidence

The following commands are a menu for a target Go project after its test packages, tags, dependencies, and disposable infrastructure exist; they are not commands that necessarily apply to the harness-flow repository itself.

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

Choose package and test names from the actual project. Pin the CI environment and keep provisioning explicit. `-count=1` disables cached successes for a fresh integration run; repeated tests increase exposure to scheduling variability but are not a substitute for a barrier. A race-enabled job requires a supported Go toolchain/platform and may need its own resource budget.

For the provided executable teaching slice, follow [the scoped Go example README](../../examples/go/README.md) and its actual commands. It is a SQLite + standard-library HTTP adaptation with the same layer responsibilities. It is not the default Chi/Ent/PostgreSQL production integration, a production authentication model, or a broker/outbox deployment. Passing it demonstrates only its exercised paths and selected SQLite semantics. Run the production adapter's own integration and operational suites for production claims.

### An evidence statement must identify the boundary

Use a report such as:

> Domain boundaries and HTTP error mapping passed in the selected package suite. PostgreSQL integration passed against the specified engine/version with private schemas: rollback, duplicate-key race, and versioned updates. Migration replay and old-binary compatibility were exercised for the listed release pair. No broker, production authorization policy, ingress/load, or restore rehearsal was exercised; no claim is made for those boundaries.

Populate such a statement only with actual results. If a required suite could not run, say which command/environment was missing and which invariant remains unverified. A build failure, a skipped suite, and a passing suite are different evidence states. Do not describe an unexecuted proposed test as coverage or present a successful generic reasoning exercise as a failed baseline.

Keep these distinctions explicit:

- A compiler pass proves type/build consistency for selected packages, tags, and platforms—not business correctness.
- A source-text test proves the text assertion—not runtime dependency wiring or persistence.
- A unit test with a fake proves the service's behavior under that fake's semantics—not DB uniqueness, network cancellation, or delivery.
- A real-DB test proves its exercised statements/adapters under the selected engine/configuration—not every interleaving, query plan, upgrade path, or outage.
- The race detector finds shared-memory races on executed paths—not database races, deadlocks in all schedules, or exactly-once effects.
- A migration replay proves schema construction on that fixture—not old-writer compatibility, production lock duration, or restore.
- A contract suite proves tested consumer/producer examples—not every unknown third-party consumer.
- A staging smoke test proves the exercised deployment path—not a capacity, security, or disaster-recovery certification.
- A benchmark is meaningful only with its workload, data size, environment, and uncertainty. High coverage percentages are not a guarantee that the important invariant was asserted.
