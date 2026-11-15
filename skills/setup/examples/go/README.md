# Runnable Go architecture example

Create a user and audit row atomically, then read the user through real HTTP and
SQLite adapters. This [blueprint adaptation](../../references/go/architecture.md)
uses standard-library `net/http` and `database/sql`, **not the canonical
Chi/Ent/PostgreSQL profile**. No mock production adapter, external service,
generated code or test-only production switch is required.

Its API deliberately differs: `POST /users`, `GET /users/{id}`, `GET /health`,
direct user JSON and `{"error":"..."}` failures. The canonical profile instead
uses `/users/` create/list, `/healthz` and `{trid,code,result}` with `{msg}` errors.
This example supplies no list, correlation envelope or compatibility redirects;
preserve an existing application's wire contract when adapting it.

## Prerequisites and exact commands

Go 1.23+, a C compiler and `CGO_ENABLED=1` are required by the pinned
`github.com/mattn/go-sqlite3 v1.14.53`. Use Xcode Command Line Tools on macOS or
the distribution compiler on Linux. Do not set `GODEBUG=httpmuxgo121=1`: the
router uses method-aware ServeMux patterns. The walkthrough needs `curl`, not
SQLite CLI. This module is independent of the JavaScript repository.

```sh
cd skills/setup/examples/go
go mod tidy
CGO_ENABLED=1 go test ./...
CGO_ENABLED=1 go test -race ./...

database_dir="$(mktemp -d)"
CGO_ENABLED=1 go run ./cmd/api -listen 127.0.0.1:8080 -database "$database_dir/users.db"
```

`go mod tidy` resolves the pinned dependency and real checksums. Use a fresh
database for walkthrough ID 1. Defaults are `127.0.0.1:8080` and `users.db`;
`-database` is a filesystem path, not a DSN, with an existing writable parent.
Tables initialize at startup and persist across restarts. Occupied ports and
unusable databases fail startup rather than silently falling back to memory.
**Keep this unauthenticated teaching service on loopback, not a public network.**

Ctrl-C/SIGTERM stops admission, drains handlers for up to ten seconds and closes
the database. Drain timeout force-closes connections and reports failure. For
process/deployment checks, build and signal the binary directly, not `go run`:

```sh
CGO_ENABLED=1 go build -o /tmp/architecture-handbook-api ./cmd/api
/tmp/architecture-handbook-api -listen 127.0.0.1:8080 -database /tmp/architecture-handbook-users.db
```

## HTTP walkthrough

From another terminal:

```sh
# 200: {"status":"ok"}, a bounded database reachability probe.
curl -i http://127.0.0.1:8080/health

# 201: Location /users/1, normalized fields and generated creation timestamp.
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"  Alice  ","email":"ALICE@Example.com"}'

# 200: the same persisted user.
curl -i http://127.0.0.1:8080/users/1

# 409: {"error":"email already exists"}; no second user/audit.
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Another Alice","email":"alice@example.com"}'

# Both 400: {"error":"invalid request"}.
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' -d '{"name":" ","email":"broken"}'
curl -i -X POST http://127.0.0.1:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bob","email":"bob@example.com","admin":true}'

# 400, 400, then 404: {"error":"user not found"} for the last request.
curl -i http://127.0.0.1:8080/users/0
curl -i http://127.0.0.1:8080/users/not-a-number
curl -i http://127.0.0.1:8080/users/999999
```

Success shape: `{"id":1,"name":"Alice","email":"alice@example.com","created_at":"<generated instant>"}`.
Bodies are limited to 1 MiB; malformed, oversized, trailing or unknown-field JSON
returns 400. Arrays are rejected; null/empty objects fail domain validation.
Unexpected application/storage failures return 500 `{"error":"internal server error"}`;
failed/timed-out health checks return 503 `{"error":"service unavailable"}`.
Raw SQL, triggers, driver messages and stacks stay private; causes remain wrapped.
Unmatched routes/unsupported methods retain ServeMux 404/405 behavior, not this
JSON promise. GET patterns also support HEAD.

## Code map and ownership

| Owner | Source and responsibility |
| --- | --- |
| Composition | [`cmd/api/main.go`](cmd/api/main.go): flags, concrete dependencies, server/database lifecycle |
| Domain | [`internal/core/domain/user.go`](internal/core/domain/user.go): invariants, entity and semantic errors |
| Inbound contract | [`port/in/user.go`](internal/core/port/in/user.go) and [`command/user.go`](internal/core/port/in/command/user.go): interface and mutation input |
| Application/outbound | [`service/usecase/user.go`](internal/core/service/usecase/user.go), [`port/out/user.go`](internal/core/port/out/user.go), [`transaction.go`](internal/core/port/out/transaction.go): concrete `UserUseCase`/`NewUserUseCase`, read/write and transaction ports |
| HTTP | [`router.go`](internal/adapter/in/http/router.go), [`handler/`](internal/adapter/in/http/handler), [`dto/user_mapper.go`](internal/adapter/in/http/dto/user_mapper.go): routes, protocol/errors and wire mapping |
| SQLite mechanics | [`db/database.go`](internal/adapter/out/persistence/sqlite/db/database.go), [`db/transaction.go`](internal/adapter/out/persistence/sqlite/db/transaction.go): schema/pool, private scope, executor and lifecycle |
| SQLite behavior | [`provider/`](internal/adapter/out/persistence/sqlite/provider) and [`repository/`](internal/adapter/out/persistence/sqlite/repository): read/row mapping versus user/audit writes |

Dependencies point inward; core imports no HTTP/SQL, and `db` imports no provider
or repository. Command callers import the child package directly, without parent
aliases; queries/results stay in parent `in` when needed. Command imports are only
domain/stdlib, never parent/service/transport/ORM; context remains a separate argument.
Entity boundaries use `*domain.User` and defined `domain.Users []*User`; small values
stay values and missing lookups return `ErrNotFound`, never `(nil,nil)`. Apply the
[coding contracts](../../references/go/coding-conventions.md), including named input
at five total boundary parameters counting context but not receiver.

Audit is part of user creation, not another domain workflow: no empty shared or
orchestration packages are needed. There are only inserts because no update/delete
use case exists; later mutations belong to repositories, not read providers.

### Creation boundary

1. DTO decoding accepts one known-field JSON value and maps a `CreateUserCommand`.
2. `NewUser` trims the name and requires 1–100 valid UTF-8 characters without NUL;
   SQLite `length()` stops at NUL. Email must be a plain address of at most 254 bytes.
   Trimming and lowercasing the **entire** email is this example's policy, not a
   universal equivalence rule or proof of ownership/deliverability.
3. The application invokes `WithinTransaction(ctx, func(txCtx context.Context) error)`
   and calls its existing injected repositories with `txCtx`. Private adapter scope
   binds one `sql.Tx`, without repository bundles or shared-field mutation.
4. User insert yields the ID; audit records `user.created` with that ID/timestamp.
   Database unique-email and foreign-key constraints decide validity, not an existence
   precheck. Only the relevant user unique failure maps to `ErrEmailConflict`.
5. Callback error, panic or cancellation attempts rollback; cancellation is checked
   before commit. Success is returned only after commit. A later disconnect does
   not undo it, and this example supplies no idempotency protocol for unknown outcomes.

Each provider/repository resolves the executor per call: ordinary context selects
the pool, `txCtx` selects that transaction and permits read-own-writes. Outer-context
I/O inside the callback escapes it and can block on the occupied single connection.
Reject nested, expired and foreign-pool scopes; do not retain/share callback contexts
or resolve them to a fallback pool. `r.Context()` reaches SQL; readiness derives a
one-second timeout. Reuse the runner across workflows; validation/owner-locking
steps do not create a new runner. A single atomic statement needs no extra wrapper
unless it joins a wider invariant. Different runners need an incompatible policy,
not a mandatory UoW label. See [transaction rules](../../references/go/data-and-transactions.md).

### SQLite connection and schema policy

Every connection uses `_foreign_keys=on`, `_busy_timeout=5000`, `_txlock=immediate`;
one pooled PRAGMA would not enforce foreign keys on every connection. The pool has
**one open connection**: application calls may compete, but this is not a parallel
SQLite-writer implementation. Another process can exhaust the lock wait. Busy timeout
is neither a retry policy nor a strict cancellation-latency guarantee.

Tests use private on-disk `t.TempDir()` databases, avoiding `:memory:` pooling traps,
with database closure before directory cleanup and barriers instead of ordering sleeps.
Transactional `CREATE TABLE IF NOT EXISTS` initializes new files; it does not upgrade
old schemas or provide versioned migrations. Use a fresh file for another schema.

## Behavior checked by the suite

Run the module commands above; use `-run <TestName> -v` to focus on a named case.
The actual assertions, rather than a second copy of the test code, live in:

- [Domain tests](internal/core/domain/user_test.go): normalization, blank/101-character
  names, NUL and invalid address syntax.
- [Repository tests](internal/adapter/out/persistence/sqlite/repository/user_test.go):
  user/audit commit and read; trigger-rejected second write and retry; duplicate-write
  rollback then ordinary reuse of the same adapter; eight concurrent creates with
  one winner plus a direct SQL uniqueness violation; cancellation between writes and
  after the last write; same-context read-own-writes; expired/nested/foreign scopes;
  concurrent ordinary-call isolation; panic and commit-failure cleanup; foreign keys
  and retained driver causes. Counts are checked with a live context after rollback.
- [HTTP tests](internal/adapter/in/http/router_test.go): real router/service/SQLite
  success and read, Location, invalid bodies, duplicates, missing IDs and safe 500
  after trigger rejection. In-process tests do not exercise OS-signal shutdown.

## Deliberate limits

This is local transaction/request-path evidence, not production readiness:

- SQLite does not prove Chi middleware, generated Ent binding, PostgreSQL isolation,
  constraint classification or migrations. Run the actual selected adapters.
- One-connection application concurrency does not prove multi-process contention,
  crash durability, restore, load capacity, bounded driver cancellation or availability.
- A local audit is not an event publisher or tamper-proof security log. No outbox,
  broker/provider correctness, retries, idempotency or distributed exactly-once claim.
- No production authn/authz/tenancy, TLS, CORS, rate limiting, privacy or deployment
  guarantee: anyone who reaches this server can access its user data.
- Tests alone do not prove the running process or signal handling. Exercise the
  built binary and HTTP walkthrough separately.

Adopt additional mechanisms only for real requirements, using
[testing](../../references/go/testing-and-evolution.md) and
[security/operations](../../references/go/security-and-operations.md) for matching
failure and operational evidence.
