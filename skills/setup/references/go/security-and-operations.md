# Security and operational boundaries

Layering supplies neither authentication, authorization nor operational readiness. This chapter owns those boundaries; [adoption](../adoption.md) records approved policy. Do not infer roles, tenancy, ownership or email visibility from a User model. The [local SQLite/stdlib HTTP example](../../examples/go) is not production-security evidence; the default production profile remains Chi/Ent/PostgreSQL/Zerolog.

## 1. Baseline, conditional controls, and policy decisions

| Classification | Rule |
| --- | --- |
| **Required baseline** | Define exposed endpoints and trust boundaries; bound input/work; enforce domain and database invariants; return safe errors; manage secrets; propagate context; own resources and shutdown; provide deploy/recovery evidence. |
| **Required when any operation is non-public** | Verify identity using the selected real identity/session provider; authorize the requested action and object, not just the route. |
| **Required when tenancy exists** | Resolve tenant membership from trusted policy; constrain every relevant read/write/list/join/job/cache/event to the correct tenant. |
| **Required when credentials are browser-managed** | Adopt the appropriate cookie/session/CSRF controls; CORS does not replace CSRF protection. |
| **Required when external integrations exist** | Validate destination and response, protect credentials, authenticate webhooks, bound retries, and resolve ambiguous effects. |
| **Optional** | Distributed tracing, rate-limit service, separate worker deployment, service mesh, specialized policy engine, or circuit breaker. Adopt to solve an identified requirement. |
| **Needs project decision** | Public/private API policy, identity provider, session revocation, object/field/action rights, tenant membership, existence concealment, audit retention, SLOs, backup RPO/RTO, and incident ownership. |

Missing identity policy blocks protected endpoints; never hardcode `admin`, trust `X-User-ID`, or equate a valid JWT with authorization.

### Placement and responsibility

- HTTP router/middleware own public/protected groups, authentication, bounded input/trace IDs, recovery and admission; trust forwarding headers only from configured proxies. Handlers/DTOs parse, map explicit application input/result and render typed outcomes—not business rules.
- Input ports carry explicit actor inputs; services enforce action/object policy for HTTP, jobs and other callers. Domain owns business invariants, not JWT/HTTP/Ent. Follow [architecture](architecture.md) for usecase/shared/orchestration dependencies, including peer-call bans.
- Output ports expose needed persistence/policy/vendor capabilities; reuse existing policy rather than invent abstractions. Under `persistence/postgres`, `provider` reads, `repository` guards writes/translates constraints, `db` owns lifecycle/private `txCtx` resolution without importing provider/repository, and `dao` separates generated Ent from handwritten mapping. Apply trusted scope to reads **and** writes; a transaction is not authorization. Read [data and transactions](data-and-transactions.md) when implementing these adapters.
- Identity/vendor integrations remain outside persistence; its “provider” means database reads.
- `internal/config` owns typed startup settings; existing `internal/pkg/errors`/`logger` own small helpers, not business policy/service locators. `cmd/api/main.go` composes clients/pools/health/lifecycle, not authorization.

## 2. Authentication is not authorization

**Authentication** establishes verified identity/public status; **authorization** permits an actor/action/object/state/scope. Signatures, unguessable IDs, route protection and yesterday's permission cannot replace current checks. Deny by default.

### Authenticate at the inbound adapter

Scoped middleware; imports: `context`, `net/http`, `strings`. The project must supply a real provider/library-backed `TokenVerifier` satisfying this contract, not arbitrary-claim acceptance:

```go
type Principal struct {
    Subject string
}

type TokenVerifier interface {
    // Verify validates the configured issuer, audience, algorithm, signature,
    // time claims, and the project's session/token acceptance policy.
    Verify(context.Context, string) (Principal, error)
}

type principalKey struct{}

func PrincipalFrom(ctx context.Context) (Principal, bool) {
    p, ok := ctx.Value(principalKey{}).(Principal)
    return p, ok && p.Subject != ""
}

func RequireBearer(verifier TokenVerifier, next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
        if !ok || !strings.EqualFold(scheme, "Bearer") || token == "" ||
            strings.ContainsAny(token, " \t\r\n") {
            w.Header().Set("WWW-Authenticate", "Bearer")
            http.Error(w, "authentication required", http.StatusUnauthorized)
            return
        }
        principal, err := verifier.Verify(r.Context(), token)
        if err != nil || principal.Subject == "" {
            w.Header().Set("WWW-Authenticate", "Bearer")
            http.Error(w, "authentication required", http.StatusUnauthorized)
            return
        }
        ctx := context.WithValue(r.Context(), principalKey{}, principal)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

Reuse the accepted JSON error renderer when required; never log tokens/expose verifier errors. Privately distinguish verifier outage from invalid credentials; safe `503` versus `401` is policy, never fail-open. Bound headers/tokens and rate-limit before expensive cryptography.

Configure issuer/key set, allowed algorithms, audience, expiry/not-before, bounded clock skew, rotation and session acceptance. Reject attacker-selected keys/URLs; parsing JWTs is not verification. Use provider libraries, not ad hoc hashing/cryptography.

Cookie sessions require `Secure`, `HttpOnly`, appropriate `SameSite`, expiry/rotation/revocation, fixation and state-changing CSRF controls. Restrict CORS origins/methods/headers; credentialed arbitrary-origin reflection is unsafe. CORS is not CSRF protection, and bearer clients need not copy cookie policy.

### Authorize at the use-case/object boundary

Pass the verified actor explicitly through the input port, not `*http.Request`, middleware context keys, JWT maps or caller roles. Jobs require defined service capabilities, not implicit admin rights.

Scoped `service/usecase/user` example; imports: `context`, `errors`, `fmt`, `example.com/project/internal/core/domain` (replace module path). `Actor`/`UserReadPolicy` are conditional extensions from approved policy, not changes to canonical User fields/`UserUseCase` or implicit allow-authenticated policy:

```go
type Actor struct {
    Subject string
}

type UserProvider interface {
    FindByID(context.Context, int) (*domain.User, error)
}

type UserReadPolicy interface {
    AuthorizeRead(context.Context, Actor, *domain.User) error
}

type UseCase struct {
    userProvider UserProvider
    policy       UserReadPolicy
}

var ErrMissingActor = errors.New("missing actor")

func (s *UseCase) GetUser(ctx context.Context, actor Actor, id int) (*domain.User, error) {
    if actor.Subject == "" {
        return nil, ErrMissingActor
    }
    user, err := s.userProvider.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("find user: %w", err)
    }
    if err := s.policy.AuthorizeRead(ctx, actor, user); err != nil {
        return nil, fmt.Errorf("authorize user read: %w", err)
    }
    return user, nil
}
```

The local interfaces expose fragment dependencies; real ports belong in `internal/core/port/out` (`outport`). Reuse its existing `UserProvider`, not a parallel contract. Preliminary action checks may avoid loading; object checks need trusted object/policy data. Returning an entity does not authorize exposing every field.

For mutations, guard relevant policy inputs with a consistent transaction/version strategy when ownership/roles/membership can race. Define the required consistency; a DB transaction cannot make an arbitrary remote policy lookup atomic.

### Tenant boundaries are conditional, not invented

**Required with tenancy.** Resolve requested scope from verified membership/policy, never trust query/body/`X-Tenant-ID` or unverified claims. Pass scope explicitly through ports; apply it inside reads/writes/lists/joins/caches/exports/jobs/events, not handler-side filtering.

**SQL shape only, conditional on tenancy:**

```sql
UPDATE tenant_documents
   SET title = $1, version = version + 1
 WHERE tenant_id = $2 AND id = $3 AND version = $4
RETURNING id, version;
```

`$2` is trusted scope; object-edit permission remains separate. Scope relevant foreign/unique keys too. PostgreSQL RLS adds defense, but owners/privileged roles may bypass it; pooled session state must not leak tenants. Token middleware plus an unscoped ID query is insufficient, regardless of UUIDs/hidden buttons.

**Verify:** approved actor × action × object/state matrix; default denial, anonymous/cross-user/cross-tenant cases, lists/exports/fields, revoked membership, jobs, idempotency replay and concurrent policy changes. Decide forbidden-versus-missing `404` concealment explicitly.

## 3. Validate input size, shape, meaning, and output separately

**Required baseline.** Transport shape, domain invariants and DB constraints protect different boundaries. Keep JSON decoding in HTTP and `NewUser` validation/normalization in domain; do not duplicate email policy in middleware.

Complete decoding helper; imports: `encoding/json`, `errors`, `io`, `mime`, `net/http`. Accept one JSON value, reject unknown fields, and bound streamed bytes—not just `Content-Length`:

```go
type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

var (
    ErrInvalidBody      = errors.New("invalid request body")
    ErrBodyTooLarge     = errors.New("request body too large")
    ErrUnsupportedMedia = errors.New("unsupported media type")
)

func DecodeCreateUser(w http.ResponseWriter, r *http.Request) (CreateUserRequest, error) {
    mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
    if err != nil || mediaType != "application/json" {
        return CreateUserRequest{}, ErrUnsupportedMedia
    }
    const maxBody = 16 << 10
    r.Body = http.MaxBytesReader(w, r.Body, maxBody)
    defer r.Body.Close()
    dec := json.NewDecoder(r.Body)
    dec.DisallowUnknownFields()

    var input *CreateUserRequest
    if err := dec.Decode(&input); err != nil {
        var tooLarge *http.MaxBytesError
        if errors.As(err, &tooLarge) {
            return CreateUserRequest{}, ErrBodyTooLarge
        }
        return CreateUserRequest{}, ErrInvalidBody
    }
    if input == nil {
        return CreateUserRequest{}, ErrInvalidBody
    }
    var extra any
    if err := dec.Decode(&extra); err != io.EOF {
        var tooLarge *http.MaxBytesError
        if errors.As(err, &tooLarge) {
            return CreateUserRequest{}, ErrBodyTooLarge
        }
        return CreateUserRequest{}, ErrInvalidBody
    }
    return *input, nil
}
```

Map sentinels to the accepted `400`/`413`/`415` contract and domain failures through its taxonomy. Reject overflowing IDs, unsupported sorts, negative/excessive pages and unbounded batches. Parameterize SQL values; identifiers/order expressions need fixed allowlists, not placeholders or caller concatenation.

**Needs project decision:** strict/tolerant JSON compatibility. `encoding/json` accepts duplicate keys and case-insensitive field matches despite `DisallowUnknownFields`; signing/auth/interoperability may require stricter parsing. This helper is not canonical JSON. Bound decompressed data, uploads, file counts and fields where used; compressed edge limits do not necessarily bound memory.

Map authorized response DTO fields explicitly (`http/dto/user_mapper.go`), never entire Ent/domain objects. Email visibility is policy. Bound exports/pagination; use JSON content type and `html/template` for HTML. Apply destination-specific validation to headers, paths, redirects and URLs. Request DTOs prevent mass assignment of fields such as `IsAdmin`; validation is not permission.

**Verify:** chunked/false lengths, empty/null/multiple/malformed/unknown/ambiguous JSON under chosen policy, size/Unicode/overflow/page edges, SQL metacharacters as values, and authorized output fields. Fuzz high-risk parsers.

## 4. Preserve private causes; map public failures deliberately

**Required baseline.** Separate stable application category, private cause and public message. Persistence maps structured Ent/driver constraint outcomes, not message substrings; core decisions never depend on driver details.

Preserve `CustomError` causes instead of concatenating strings. Scoped shared type for existing `internal/pkg/errors`; no imports:

```go
type Code string

const (
    Invalid     Code = "invalid_input"
    NotFound    Code = "not_found"
    Forbidden   Code = "forbidden"
    Conflict    Code = "conflict"
    Unavailable Code = "unavailable"
    Internal    Code = "internal"
)

type Failure struct {
    Code  Code
    Op    string
    Cause error
}

func (e *Failure) Error() string {
    if e.Cause == nil {
        return e.Op + ": " + string(e.Code)
    }
    return e.Op + ": " + string(e.Code) + ": " + e.Cause.Error()
}

func (e *Failure) Unwrap() error { return e.Cause }
```

`Op` is fixed developer text, never raw input. `%w` preserves cause; exposing concrete causes as an API remains a decision. Never serialize `Failure.Error()`.

Complete HTTP mapper; imports: `context`, `encoding/json`, `errors`, `net/http`; `apperrors` aliases the preceding shared type (e.g. `example.com/project/internal/pkg/errors`). `requestID` is validated/generated. This **alternative** JSON shape is not permission to migrate the canonical `{trid, code, result}`, four-digit codes and error `result: {msg}` in [layers](layers.md); reuse the target's accepted renderer.

```go
type PublicError struct {
    Code      string `json:"code"`
    Message   string `json:"message"`
    RequestID string `json:"request_id,omitempty"`
}

func WriteError(w http.ResponseWriter, err error, requestID string) {
    status := http.StatusInternalServerError
    body := PublicError{
        Code: "internal", Message: "request could not be completed", RequestID: requestID,
    }
    var failure *apperrors.Failure
    if errors.As(err, &failure) {
        switch failure.Code {
        case apperrors.Invalid:
            status = http.StatusBadRequest
            body.Code, body.Message = "invalid_input", "invalid request"
        case apperrors.NotFound:
            status = http.StatusNotFound
            body.Code, body.Message = "not_found", "resource not found"
        case apperrors.Forbidden:
            status = http.StatusForbidden
            body.Code, body.Message = "forbidden", "operation not permitted"
        case apperrors.Conflict:
            status = http.StatusConflict
            body.Code, body.Message = "conflict", "operation conflicts with current state"
        case apperrors.Unavailable:
            status = http.StatusServiceUnavailable
            body.Code, body.Message = "unavailable", "service temporarily unavailable"
        }
    } else if errors.Is(err, context.DeadlineExceeded) {
        status = http.StatusGatewayTimeout
        body.Code, body.Message = "deadline_exceeded", "request deadline exceeded"
    }
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Cache-Control", "no-store")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(body)
}
```

This example's bare-deadline `504` does not settle project `408`/`503`/`504` policy. On disconnect, stop/record cancellation instead of forcing nonstandard `499`. Timeout/`500` may follow commit/provider success; when that can happen, read [reconciliation](reliability-and-events.md), not “error means rollback.”

After headers, encoder failures require boundary telemetry, not another JSON document. Encode bounded DTOs first when pre-header detection is needed; never buffer unbounded downloads or introduce a second envelope.

The inbound owner in §6 emits one sanitized diagnostic; preserved causes may contain SQL parameters, DSNs, provider payloads or PII. Restrict/redact detailed channels. Recovery returns generic panic failures, never fabricated success.

**Verify:** multi-layer `errors.Is`/`errors.As`, synthetic secret-bearing DB errors absent from public JSON/headers/ordinary logs, unknown-category `500`, approved existence semantics and no success before commit.

## 5. Configuration and secrets are startup dependencies

**Required baseline.** Load typed `internal/config` once, validate before serving and inject constructors. No business-layer `os.Getenv`, insecure defaults or development-secret fallback.

Complete public-settings example; imports: `errors`, `fmt`, `os`, `time`. No printable secret fields:

```go
type Limits struct {
    RequestTimeout time.Duration
    ShutdownGrace  time.Duration
}

func LoadLimits() (Limits, error) {
    parse := func(name string) (time.Duration, error) {
        value := os.Getenv(name)
        if value == "" {
            return 0, fmt.Errorf("%s is required", name)
        }
        duration, err := time.ParseDuration(value)
        if err != nil || duration <= 0 || duration > time.Minute {
            return 0, fmt.Errorf("%s must be a positive duration at most one minute", name)
        }
        return duration, nil
    }
    requestTimeout, err := parse("REQUEST_TIMEOUT")
    if err != nil {
        return Limits{}, err
    }
    grace, err := parse("SHUTDOWN_GRACE")
    if err != nil {
        return Limits{}, err
    }
    if grace <= requestTimeout {
        return Limits{}, errors.New("SHUTDOWN_GRACE must exceed REQUEST_TIMEOUT")
    }
    return Limits{RequestTimeout: requestTimeout, ShutdownGrace: grace}, nil
}
```

One-minute caps/ordering are illustrative local-API budgets, not universal policy. Streams/jobs and orchestrator drain/cleanup need their own composed budgets. Validate DSN/pools/TLS, issuer/audience, allowlists and credentials; never echo invalid secrets or print whole config structs.

Use approved secret-manager/protected runtime injection; committed `.env` and base64 are not protection. Restrict access, redact telemetry/crash reports, rotate and prove revocation. Separate least-privilege runtime/migration DB roles; encryption does not replace authorization.

**Verify:** missing/malformed/insecure production config fails before readiness without secret disclosure; rotation/revocation meet agreed availability. No real secrets in fixtures/commands.

## 6. Logging, traces, metrics, and audit have different jobs

**Required baseline.** Use existing Zerolog structured conventions, stable fields/levels and bounded sanitized metadata: operation, route template, method, status, duration, category and correlation ID. Exclude raw ID paths, bodies, auth/cookies, DSNs, email/payment data and untrusted field names; apply access/retention policy.

**Single failure-diagnostic owner:** each HTTP, worker/job or CLI execution logs once at its inbound boundary **or** framework final handler, never both. Domain/services/providers/repositories/outbound adapters enrich and return preserved errors **without logging**, at any level. Explicit project exceptions still name one owner (e.g. lifecycle failure with no inbound boundary). Access records, metrics and required audit are distinct signals.

- **Correlation/`TrID`:** bounded trusted/generated observation identity, not a transaction, idempotency key or commit proof.
- **Trace/span context:** validated/sampled under trusted ingress rules; no secrets in baggage that may cross organizations.
- **Database transaction:** actual begin/commit/rollback resource boundary; middleware IDs cannot create one.
- **Business/event ID:** durable identity with separate uniqueness/retention, not a fresh request ID.
- **Audit:** defined actor/action/target/result evidence with access/tamper/retention controls, not sampled logs. Persist atomically with mutation/outbox when required, minimizing secrets.

Inbound Zerolog field-shape fragment using an existing logger and middleware `time.Time`:

```go
logger.Info().
    Str("request_id", requestID).
    Str("route", routeTemplate).
    Str("method", method).
    Int("status", status).
    Dur("duration", time.Since(started)).
    Str("outcome", outcomeCode).
    Msg("http request completed")
```

Variables are sanitized metadata, not a response wrapper. A wrapper must preserve required streaming/hijacking interfaces (or use the framework's tested wrapper). Successful-request logs may be optional at volume; chosen SLO metrics remain necessary.

**Metrics:** bounded route/method/status/operation/category labels, never user/email/trace/key/URL/provider messages. Measure request/dependency latency/errors, DB pool wait/use and worker saturation; adopted async features add oldest backlog, attempts, mismatches, poison depth and unknown/reconciliation age. Alert on actionable impact/backlog. Sampling cannot erase required audit evidence.

**Verify:** success/denial/input/provider/panic telemetry; one diagnostic at each supported inbound kind, none in inner layers/second handler, distinct access/metrics/audit; no synthetic secret/PII leakage; bounded labels across random IDs; safe outbox causation without claiming a trace is a transaction.

## 7. Health endpoints describe traffic eligibility, not business success

**Required for managed long-running services.** Small non-sensitive probes; restrict management/pprof access.

- **Liveness:** cheap process progress, not dependency availability; restarting replicas can amplify outages.
- **Readiness:** initialized, non-draining and able to serve promised traffic. Check required dependencies within bounds, not every optional email provider.
- **Startup probe:** distinguishes slow initialization from dead process.

Complete readiness handler; imports: `context`, `database/sql`, `net/http`, `sync/atomic`, `time`. Composition owns pool/flag; a probe neither migrates nor proves permissions/schema correctness:

```go
type Health struct {
    DB    *sql.DB
    Ready atomic.Bool
}

func (h *Health) Liveness(w http.ResponseWriter, _ *http.Request) {
    w.WriteHeader(http.StatusOK)
}

func (h *Health) Readiness(w http.ResponseWriter, r *http.Request) {
    if !h.Ready.Load() {
        http.Error(w, "not ready", http.StatusServiceUnavailable)
        return
    }
    ctx, cancel := context.WithTimeout(r.Context(), 200*time.Millisecond)
    defer cancel()
    if err := h.DB.PingContext(ctx); err != nil || !h.Ready.Load() {
        http.Error(w, "not ready", http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusOK)
}
```

For Ent, use supported owned pool health capabilities, not unsafe casts. Size probe frequency/timeouts/cache for fleet load. Ping proves connectivity only; deployment/startup validates schema compatibility, never destructive auto-migration in probes.

**Verify:** unready during startup/drain; dependency outage affects only designed readiness, no liveness restart storm or unnecessary loss of unrelated capacity.

## 8. Timeouts, resource budgets, and graceful shutdown

**Required baseline.** Bound headers/bodies, work/query/lock/pool waits, outbound calls, prefetch, goroutines and memory. Inner budgets fit remaining outer deadlines. Chi timeout middleware cannot stop context-ignorant code; leaking a goroutine around it is no fix.

Non-streaming JSON API composition fragment:

```go
server := &http.Server{
    Addr:              cfg.ListenAddress,
    Handler:           router,
    ReadHeaderTimeout: 2 * time.Second,
    ReadTimeout:       5 * time.Second,
    WriteTimeout:      8 * time.Second,
    IdleTimeout:       60 * time.Second,
    MaxHeaderBytes:    16 << 10,
}
db.SetMaxOpenConns(cfg.DBMaxOpen)
db.SetMaxIdleConns(cfg.DBMaxIdle)
db.SetConnMaxLifetime(cfg.DBConnectionLifetime)
```

Imports: `net/http`, `time`; typed `cfg`, `router`, `db` already exist. Values are illustrative, not an SLO. Configure transaction/query/lock budgets separately; fleet-wide DB caps include workers and migration/admin headroom. Measure pool wait and shed overload before unbounded queueing. Align proxy/server/application/client/broker/orchestrator budgets. Streams/uploads/hijacked connections need per-route lifetime policies.

### Drain before destroying dependencies

Complete lifecycle function for initialized HTTP with finite requests, **no workers/hijacked connections**; imports: `context`, `errors`, `net/http`, `time`. `cmd/api/main.go` supplies signal context, positive grace/readiness callback, then closes pools/transports after return:

```go
func ServeUntilCanceled(
    signalCtx context.Context,
    server *http.Server,
    setReady func(bool),
    grace time.Duration,
) error {
    if grace <= 0 {
        return errors.New("shutdown grace must be positive")
    }
    if err := signalCtx.Err(); err != nil {
        setReady(false)
        return err
    }
    serveErr := make(chan error, 1)
    go func() { serveErr <- server.ListenAndServe() }()
    setReady(true)

    select {
    case err := <-serveErr:
        setReady(false)
        if errors.Is(err, http.ErrServerClosed) {
            return nil
        }
        return err
    case <-signalCtx.Done():
        setReady(false)
    }

    shutdownCtx, cancel := context.WithTimeout(context.Background(), grace)
    defer cancel()
    err := server.Shutdown(shutdownCtx)
    if err != nil {
        _ = server.Close()
    }
    listenErr := <-serveErr
    if err != nil {
        return err
    }
    if listenErr != nil && !errors.Is(listenErr, http.ErrServerClosed) {
        return listenErr
    }
    return nil
}
```

Fresh bounded `context.Background()` is intentional for cleanup after signal cancellation, never ordinary requests. `Shutdown` waits for HTTP idle connections, not workers/hijacks; forced `Close` proves neither rollback nor goroutine exit. Context-ignorant handlers are not finished, so do not claim safe dependency closure.

If readiness requires listener-bound evidence, bind synchronously and `Serve(listener)`. Separate health listeners/routing propagation need an actual drain plan, not an unexplained sleep.

With workers: mark unready, stop admission/claims, drain requests/jobs within the shared budget, cancel remaining work, join goroutines, then close broker/transports/DB. Preserve rollback/unacked/lease recovery on forced exit; never ack unfinished work. Track streams/hijacks separately and reserve forced-cleanup time. `os.Exit`/fatal logging bypass defers; canceling all request parents immediately is not graceful drain.

**Verify:** termination during slow requests/commit/provider ambiguity/jobs; admission stops, bounded work joins, ordered closure, commit-before-ack and restart recovery. Include listener failure/deadline expiration; SIGTERM handling alone proves nothing.

## 9. Deployments and database changes need compatibility evidence

**Required for persistent production services.** Persistence/deployment owns versioned reviewed migrations, schema version and one authorized executor/lock, using separate credentials. Ent schemas/development `Schema.Create` do not prove production migration safety; use the selected Ent/Atlas workflow.

The rollout plan must specify:

1. **Before:** supported schema/DB/extensions and coexisting app/event versions; expected locks/runtime/disk/connections.
2. **Expand:** compatible structures and bounded locks; PostgreSQL concurrent indexes have special transaction/failure rules.
3. **Backfill:** bounded restartable observable batches protected against concurrent writes/duplicates, not one table-wide transaction.
4. **Switch:** mixed-version-safe reads/writes and constraint verification; dual writes are optional and introduce a consistency window.
5. **Contract:** remove old fields/paths after dependent instances/jobs/consumers and rollback windows end—not permanent shims.
6. **Failure:** distinguish safe binary rollback from destructive schema/data reversal; down migrations cannot restore deleted data. Prefer reviewed forward repair where needed.

Use immutable reproducible artifacts, least-privilege runtime/network/filesystem and reviewed dependencies/vulnerability policy. Go vulnerability checks are not security proof. Keep debug/admin mutations private; canary stop decisions use actual errors/latency/consistency, not probes alone.

**Verify:** representative disposable DB migrations, lock/backfill cost, mixed-version traffic, interrupted/resumed backfill and failed-rollout repair. Record exercised environment/results, not empty directories or “production-ready” claims.

## 10. Recovery, backups, and repair are part of the design

**Needs project decision:** RPO/data-loss limit, RTO/outage limit, backup retention/location/encryption/access, restore owner and reconstructible event/provider state.

**Required for irreplaceable data:** monitor scheduled backups, retain required PostgreSQL base/WAL history, secure keys separately and rehearse isolated restore plus constraints/schema/startup checks. Dumps, file backups and continuous archiving differ; use the managed provider's actual recovery contract, not assumptions from DB settings.

Recovery includes external time:

- Snapshots cannot unsend/refund/rewind brokers; locally pending work may already have happened remotely.
- Restored outbox/inbox state may republish/reapply effects. Reconcile broker replay, key/inbox retention and provider deduplication horizons with the restore point, preserving stable IDs before irreversible resubmission—not “replay everything.”
- Repair is protected mutation: authorized bounded scope, preview where feasible, audit/idempotency and explicit irreversible-change approval, not hidden ad hoc edits.
- Name reachable incident access/escalation, secret rotation, communication and rollback/repair owners plus silent-corruption detection; no complex platform is mandatory.

**Verify:** isolated restore with live outbound effects disabled, schema/invariants/startup, sampled broker/provider reconciliation and measured RPO/RTO. Exercise credential loss, poison/stuck work/deletion where applicable. Report restored/reconciled state, not merely successful backup.

## 11. External integration security

**Required with external calls.** Outbound adapters own protocol, services business decisions, injected config credentials. When effects can repeat/be ambiguous, also read [reliability and events](reliability-and-events.md).

- **Destinations:** prefer fixed validated HTTPS. Caller URLs require scheme/host/DNS/address/port/redirect/egress controls for the deployment, including internal/metadata ranges. Prefix checks/one DNS lookup cannot stop rebinding or redirects; never disable TLS verification.
- **Credentials:** provider-scoped least privilege, no query-string secrets or forwarding inbound auth to unrelated providers. Explicit redirect credential policy, rotation/revocation and redacted URL userinfo/headers.
- **Responses:** bound bytes/complexity, status/schema and permitted transitions; close bodies. Compromised providers can return hostile data; no direct Ent decoding or permission from unchecked fields.
- **Webhooks:** actual provider library/procedure, configured keys, bounded **raw signed bytes**, timestamp/replay policy and library constant-time verification. Verify before effects; IP allowlists alone fail. Deduplicate stable provider IDs and guard transactional transitions, including repeats/reordering; use supported secret-rotation overlap. Never decode/re-encode signed bytes first.
- **Callbacks/uploads:** separately authorize destination and readable data. Scope/expire storage credentials/URLs; bound content and apply upload scanning policy only where uploads exist.
- **Failure:** bounded rates/concurrency/quotas and truthful unknown outcomes; invalid signatures/auth failures are not automatically transient.

**Verify:** invalid/expired/altered signatures, duplicate/reordered webhook IDs, forbidden redirects/rebinding, key rotation, hostile/oversized responses and accepted-but-disconnected commands under the actual provider contract.

## 12. Evidence required before claiming the boundary is guarded

Use section verification cases for each promised boundary; optional mechanisms are not release prerequisites without the corresponding requirement. When choosing test placement/scenarios, read [testing and evolution](testing-and-evolution.md); record adoption/open policy through [adoption](../adoption.md).

State unexercised identity, tenant, session, integration, lifecycle, migration and recovery controls explicitly. A clean tree, sample middleware or passing unit suite cannot establish operational readiness.
