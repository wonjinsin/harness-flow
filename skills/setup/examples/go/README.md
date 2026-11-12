# Runnable Go architecture example

This is a self-contained executable adaptation of the [Go architecture handbook](../../references/go/architecture.md). It preserves the handbook's layer layout and dependency direction, but **deliberately selects standard-library `net/http` and `database/sql` with SQLite instead of the canonical Chi / Ent / PostgreSQL profile**. It does not change that canonical default or demonstrate the behavior of those other adapters.

The complete use case is **create a user and its audit record in one local database transaction**, followed by retrieval. There are no mock production adapters, test-only production switches, external services, or generated files required to understand the implementation.

The HTTP contract is also a conscious simplification, **not a replacement for the canonical profile's API**. That profile uses `/users/` for creation/listing, `/users/{id}` for retrieval, `/healthz` for health, and a `{trid, code, result}` response envelope with error results shaped as `{msg}`. This executable instead implements `POST /users` (without the trailing slash), `GET /users/{id}`, and `GET /health`; successful user responses are direct user objects, errors use `{"error":"..."}`, and no list endpoint or request-correlation envelope is included. Its router does not promise compatibility redirects from the canonical paths. Preserve or explicitly migrate an existing project's external contract when adapting these layers.

## Prerequisites and exact commands

- Go 1.23 or newer. Method-aware `ServeMux` routes and integer ranges require modern Go; do not set `GODEBUG=httpmuxgo121=1`.
- A working C compiler and `CGO_ENABLED=1`, required by the pinned `github.com/mattn/go-sqlite3 v1.14.53` driver. On macOS, install the Xcode Command Line Tools if a C compiler is not already available. On Linux, install the distribution's C compiler toolchain.
- `curl` for the HTTP walkthrough. The optional `sqlite3` CLI is not needed by the service or tests.

From the repository root:

```sh
cd skills/setup/examples/go
go mod tidy
CGO_ENABLED=1 go test ./...
CGO_ENABLED=1 go test -race ./...
```

`go mod tidy` resolves the pinned release and writes real `go.sum` entries. No checksums are fabricated in this teaching source. The module has no dependencies on the surrounding JavaScript repository.

Start with a new database so the walkthrough's first user has ID `1`:

```sh
database_dir="$(mktemp -d)"
CGO_ENABLED=1 go run ./cmd/api -listen 127.0.0.1:8080 -database "$database_dir/users.db"
```

The equivalent defaults are `-listen 127.0.0.1:8080 -database users.db`. The database's parent directory must already exist and be writable. The service creates its tables at startup and preserves data on restart. `-database` is a filesystem path, not a raw SQLite DSN; DSN options are owned by the adapter. The default interface is loopback: **do not expose this unauthenticated teaching service to a network**. An occupied port or unusable database causes startup to fail, not an in-memory fallback.

Send requests from another terminal. Press Ctrl-C in the service terminal, or send SIGTERM to the running binary, to stop accepting new connections, allow active handlers up to ten seconds to finish, and close the database. On a shutdown timeout the server force-closes connections and reports an error. For deployment experiments, build and signal the binary directly rather than treating `go run` as a process supervisor:

```sh
CGO_ENABLED=1 go build -o /tmp/architecture-handbook-api ./cmd/api
/tmp/architecture-handbook-api -listen 127.0.0.1:8080 -database /tmp/architecture-handbook-users.db
```

## HTTP walkthrough

All of these commands show the response status and headers with `-i`.

```sh
# 200, {"status":"ok"}; this probes database reachability.
curl -i http://127.0.0.1:8080/health

# 201 with Location: /users/1, normalized name/email, and a creation timestamp.
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"  Alice  ","email":"ALICE@Example.com"}'

# 200, the same persisted user representation.
curl -i http://127.0.0.1:8080/users/1

# 409, {"error":"email already exists"}; no second user or audit is committed.
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Another Alice","email":"alice@example.com"}'

# 400, {"error":"invalid request"}.
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":" ","email":"not-an-email"}'

# Unknown JSON fields are rejected with 400, not silently bound to domain state.
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bob","email":"bob@example.com","admin":true}'

# 400 for a non-positive or malformed ID; 404 for a valid but missing ID.
curl -i http://127.0.0.1:8080/users/0
curl -i http://127.0.0.1:8080/users/not-a-number
curl -i http://127.0.0.1:8080/users/999999
```

Successful creation returns a JSON object shaped like this; the actual timestamp is generated at creation:

```json
{"id":1,"name":"Alice","email":"alice@example.com","created_at":"2026-01-01T12:00:00Z"}
```

| Situation | Status | Public response |
| --- | --- | --- |
| Create succeeds and commits | 201 | User JSON and `Location` |
| Get succeeds | 200 | User JSON |
| Malformed/oversized body, trailing JSON, unknown field, invalid domain input or ID | 400 | `{"error":"invalid request"}` |
| User does not exist | 404 | `{"error":"user not found"}` |
| Normalized email already exists | 409 | `{"error":"email already exists"}` |
| Unexpected persistence/use-case failure | 500 | `{"error":"internal server error"}` |
| Health database check fails or times out | 503 | `{"error":"service unavailable"}` |

The request body limit is 1 MiB. An array instead of an object is rejected; `null` or an empty object cannot satisfy domain validation. Error responses never expose SQL statements, trigger messages, raw driver errors, or stack traces. Underlying causes remain wrapped for internal inspection and server-side logging. Unmatched routes and unsupported methods retain standard `ServeMux` 404/405 behavior rather than promising this JSON envelope for every possible HTTP response. The `GET` route patterns also support `HEAD` through `ServeMux`.

## Code map and ownership

```text
cmd/api/main.go                                Composition, flags, lifecycle
internal/core/domain/user.go                   User invariants and semantic errors
internal/core/port/in/user.go                  Commands and use-case interface
internal/core/port/out/user.go                 Context-aware reader and transaction ports
internal/core/service/user.go                  Create/get orchestration
internal/adapter/in/http/router.go             Method/path registration only
internal/adapter/in/http/handler/user.go        Transport, safe status mapping
internal/adapter/in/http/handler/health.go      Bounded database readiness check
internal/adapter/in/http/dto/user_mapper.go     Request/response shapes and mapping
internal/adapter/out/persistence/db.go          Driver, connection policy, initial schema
internal/adapter/out/persistence/user_repo.go   SQL access and real transaction writers
internal/adapter/out/persistence/user_mapper.go Explicit persisted-row mapping
```

Dependencies flow inward: HTTP handler → `inport.UserService` → service → `outport` interfaces → concrete persistence adapter selected by `main`. The domain and service import neither HTTP nor SQL. HTTP and persisted-row mapping are separate; neither database rows nor HTTP request types cross a core port.

### Creation boundary

1. The DTO decoder accepts one JSON value with known fields and constructs a `CreateUserCommand`.
2. `domain.NewUser` trims the name, requires 1–100 valid UTF-8 characters, and validates a plain email address of at most 254 bytes. This example **chooses** to trim and lowercase the entire email, including its local part; a real product must decide its own identity normalization policy. Syntax validation does not establish address ownership or deliverability.
3. The service calls `WithinTransaction` once. It does not perform a racy "email exists" precheck.
4. The adapter opens a real `sql.Tx` and supplies an unexported writer object whose user and audit methods both call that same `sql.Tx`. The callback has no base-database writer to accidentally use.
5. The service inserts the user, obtains its database ID, and writes `user.created` with that ID. The schema enforces unique email and an audit foreign key. Only the users table's unique constraint is translated into `ErrEmailConflict`; a failing audit is not mislabeled as a duplicate email.
6. A callback error, panic, or cancellation triggers rollback. The adapter checks the transaction context before commit. The service returns a created user only after commit succeeds.

Transaction writers must not escape the callback, start nested transactions, or be used concurrently. Reading through the base repository from inside this callback would also wait for the one occupied connection; the port intentionally supplies only the writers needed by this use case. Extend a transaction-specific port if a future operation genuinely requires transaction-bound reads.

`r.Context()` reaches the service, transaction callback, and every SQL operation. The readiness probe derives a one-second deadline from its request context. A disconnect after a successful commit does not undo that commit; cancellation is not a guarantee that a previously submitted operation never happened. There is no idempotency key protocol to resolve an ambiguous client outcome here.

### SQLite connection and schema policy

Every connection is configured with `_foreign_keys=on`, `_busy_timeout=5000`, and `_txlock=immediate` in the driver DSN. Foreign-key enforcement is connection-local in SQLite, so setting it once with an arbitrary pooled `PRAGMA` would be insufficient. The adapter permits **one open connection**, serializing local database operations and avoiding unsupported expectations of parallel SQLite writers. Concurrent requests still race for the use-case result; the database unique constraint decides the winner. Another process can hold a file lock long enough to fail this service's operation. The busy timeout is a SQLite lock-wait setting, not an application retry policy, and it should not be treated as a strict request-deadline guarantee under all driver scheduling conditions.

Tests use distinct on-disk databases in `t.TempDir()`, not the shared-name or per-connection traps of `:memory:` databases. No sleep is used to order concurrent calls or cancellation. Closing the database occurs before test temporary-directory cleanup.

`CREATE TABLE IF NOT EXISTS` initializes a new teaching database in a transaction. **It is not a versioned migration system** and does not upgrade incompatible tables from another application or a future schema. Deliberately use a new file for a different schema; production migration ownership and rollout compatibility remain project decisions.

## What the tests establish

Run the whole suite from this module with `CGO_ENABLED=1 go test ./...`. Focused boundary checks are:

```sh
CGO_ENABLED=1 go test ./internal/core/domain -run TestNewUser -v
CGO_ENABLED=1 go test ./internal/adapter/out/persistence -run TestAuditConstraintFailureRollsBackFirstWrite -v
CGO_ENABLED=1 go test ./internal/adapter/out/persistence -run TestConcurrentDuplicateEmailHasOneWinnerAndDatabaseConstraint -v
CGO_ENABLED=1 go test ./internal/adapter/out/persistence -run TestCancellationBetweenTransactionWritesRollsBackPersistedUser -v
CGO_ENABLED=1 go test ./internal/adapter/in/http -v
```

- **Domain:** external consumers observe rejection of empty/long names, malformed emails and display-name/multiple-address input, plus the declared normalization policy.
- **Real commit/read:** service creation persists one user and one audit with the correct relationship and timestamp; retrieval reconstructs the same domain values.
- **Actual rollback of the first write:** a real SQLite trigger rejects the audit insert after the user insert. Calling the real service produces a trigger constraint error, and direct queries find zero users and zero audits. Removing the trigger permits creation with the same email, demonstrating that the failed attempt did not reserve it.
- **Concurrent uniqueness:** eight goroutines start from a channel barrier and invoke the real service against the same database. Exactly one succeeds and seven observe `ErrEmailConflict`; only one user and one audit remain. A direct SQL duplicate insert also fails with SQLite's unique-constraint error, proving the invariant is not only an application precheck. The one-connection policy means this is concurrent application-call coverage, **not a multi-connection or multi-process writer stress test**.
- **Cancellation between actual writes:** a real transaction callback inserts a user, cancels its context, and attempts the transaction-bound audit insert. The resulting cancellation is checked, then a separate live context queries persisted state and finds zero users/audits. This test exercises the output transaction port directly to deterministically place cancellation between writes; it does not introduce a fake transaction or a production test hook.
- **Foreign key:** direct insertion of an audit for a missing user fails with SQLite's foreign-key constraint error.
- **HTTP behavior:** in-process `httptest` requests use the real router, service and SQLite adapter for success, retrieval, invalid bodies, duplicates, missing IDs, and safe 500 responses after a real trigger rejection. These tests assert status, response contents and persisted state, not implementation source text or mock-call echoing.

## Deliberate limits

This example demonstrates a local transaction and layered request path, not production readiness. In particular, it does **not** prove:

- Chi middleware behavior, generated Ent transaction-client binding, PostgreSQL isolation, PostgreSQL constraint/error mapping, or production migration behavior. Port the adapter and rerun database-native integration tests for those choices.
- Multi-process contention handling, crash/power-loss durability testing, backup/restore, load capacity, driver cancellation latency bounds, or high availability.
- Distributed atomicity, message publication, outbox delivery, retries, idempotency, external payment/email correctness, or exactly-once execution. The audit row is local data, not an event publisher.
- Production authentication, authorization, tenant isolation, TLS, CORS policy, rate limiting, secure deployment, or a complete privacy/logging policy. User data is public to anyone who can reach this local server; audits are relational records, not tamper-proof security evidence.
- A separate process-level HTTP smoke test or an OS-signal shutdown test merely because the in-process suite passes. Exercise the actual `go run` or built service and the `curl` walkthrough when validating the runnable application.

Add those mechanisms only when the project requires them, with explicit project-owned decisions and suitable verification. See the [data and transaction guidance](../../references/go/data-and-transactions.md), [testing guidance](../../references/go/testing-and-evolution.md), and [security/operations guidance](../../references/go/security-and-operations.md) before promoting this teaching profile into a deployed service.
