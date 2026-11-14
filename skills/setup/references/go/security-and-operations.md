# Security and operational boundaries

A layered architecture protects dependency direction; it does not automatically authenticate callers, authorize objects, protect secrets, or survive a failed deployment. Use this reference with [architecture](architecture.md), [coding conventions](coding-conventions.md), [layers](layers.md), [domain](domain.md), [data and transactions](data-and-transactions.md), and [reliability and events](reliability-and-events.md). The [adoption process](../adoption.md) determines which project-owned rules become authoritative.

Authentication and tenancy require explicit project policy and implementation. Do not expose raw `err.Error()` over HTTP or combine error strings in `CustomError` without preserving causes. Do not invent ownership, roles, email visibility, or tenancy rules simply because a model has a User entity. The [runnable local example](../../examples/go) is a deliberate SQLite/stdlib HTTP adaptation, not proof of production security or operational readiness. The canonical production profile remains Chi, Ent, PostgreSQL, and Zerolog.

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

A missing identity policy is an unresolved prerequisite for a protected endpoint, not permission to hardcode `admin`, trust `X-User-ID`, or treat any valid JWT as authorization.

### Placement and responsibility

- `internal/adapter/in/http/router.go`: route registration, public/protected groups, and middleware ordering. Chi middleware does not own business invariants.
- HTTP middleware: transport authentication, request ID/trace extraction, body/time limits where appropriate, safe recovery, and coarse admission controls. Trust proxy headers only from a configured trusted proxy chain.
- Handler/DTO files: parse and validate transport shape, get verified principal, map explicit application input/result, and map typed errors to the public contract.
- `internal/core/port/in` (`inport`) and `internal/core/service/usecase/<domain>`: explicit actor/use-case inputs; action/object authorization at the operation boundary so jobs and non-HTTP callers cannot bypass it. Shared application capabilities and cross-domain orchestration use the dependency rules in [architecture](architecture.md); neither peer-service interfaces nor orchestration-to-usecase calls bypass those rules.
- `internal/core/domain`: business invariants independent of a particular token, HTTP header, or Ent entity. Domain policy and access policy may collaborate but are not the same concept.
- `internal/core/port/out` (`outport`): capabilities for read providers, write repositories, authorization data/policy, and external operations when needed. Do not add a policy abstraction if the project's existing application policy is sufficient.
- `internal/adapter/out/persistence/postgres/{provider,repository,db,dao}`: parameterized read queries in `provider`; guarded writes and constraint translation in `repository`; reusable pool/begin/rollback/commit and private context-handle resolution in `db`; handwritten mapping alongside, not inside, generated `dao/ent`. Existing adapters use `txCtx` to select the transaction without shared-field mutation. Trusted scope predicates apply to both reads and writes; a transaction context is not authorization. `db` must not import providers/repositories. Database least privilege remains an operational boundary.
- External identity/payment/vendor adapters remain outside persistence; a persistence provider is a read adapter, not a vendor integration.
- `internal/config`: typed configuration loading/validation; not runtime secret logging.
- `internal/pkg/errors` and `internal/pkg/logger`: small shared error/logging helpers consistent with the project, not a new service locator or business-policy package.
- `cmd/api/main.go`: construct verified dependencies, pools, clients, signal handling, health endpoints, and lifecycle. No business authorization in `main`.

## 2. Authentication is not authorization

**Authentication** establishes a verified identity or anonymous/public status. **Authorization** decides whether that actor may perform this action on this object, in this state and scope. A valid signature, an unguessable ID, an authenticated route, or a successful request yesterday does not establish permission today. Deny by default and check every protected request.

### Authenticate at the inbound adapter

The following is a **section-scoped Go middleware fragment**, not an identity-provider implementation. Imports: `context`, `net/http`, and `strings`. The project must supply a production `TokenVerifier` backed by its selected provider/library. Its stated contract is a real prerequisite, not a mock that accepts arbitrary claims.

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

Use the project's standard error renderer instead of `http.Error` if it promises a JSON error envelope. Do not log the token or return verifier errors to callers. Distinguish verifier infrastructure outage from invalid credentials in private telemetry; a project may choose a safe `503` rather than `401` for an unavailable verifier, but it must never fail open. Rate-limit authentication attempts and bound token/header size before expensive cryptography.

Configure the verifier to trust the intended issuer and key set, pin acceptable algorithms, validate audience and expiry/not-before with bounded clock skew, and handle key rotation without accepting attacker-selected keys/URLs. JWT parsing without verification is not authentication. Do not implement password hashing or JWT cryptography ad hoc. Follow the chosen provider's validation requirements.

For cookie sessions, specify `Secure`, `HttpOnly`, appropriate `SameSite`, expiration/rotation/revocation, session fixation protection, and CSRF protection for state-changing requests. Restrict CORS to intended origins/methods/headers; do not combine arbitrary origin reflection with credentials. Bearer-token APIs have a different browser threat model; do not blindly copy a cookie policy onto every client.

### Authorize at the use-case/object boundary

A handler passes a verified application actor explicitly into an input-port call. The core must not depend on `*http.Request`, a middleware context key, JWT claim maps, or a client-supplied role. Background jobs need a defined service actor/capability policy; they do not become administrators because there is no HTTP request.

This **section-scoped application example** belongs in `internal/core/service/usecase/user` and shows the authorization boundary without choosing a business permission policy or replacing the canonical `UserUseCase` contract. Imports: `context`, `errors`, `fmt`, and `example.com/project/internal/core/domain` (replace the example module path). The User fields are unchanged. `UserReadPolicy` must be implemented from approved project policy; “allow all authenticated users” is not an implicit implementation. The actor-aware signature is a project-specific extension when this authorization policy is adopted.

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

Place actual port definitions in `internal/core/port/out` and import them as `outport`, rather than defining duplicate interfaces in each consumer. They are local here to make the fragment's dependencies explicit; reuse the project's existing `UserProvider` rather than creating a parallel read contract. A preliminary action check can prevent unauthorized loading; object checks still need the relevant trusted object/policy data. Returning a domain entity pointer here does not authorize the handler to expose every field.

For a mutation, check the relevant object/action policy and execute the guarded write under a consistent transaction/version check when policy inputs can change concurrently. Otherwise a role, ownership, or membership change can race a stale authorization decision. Define what authorization consistency the project requires; do not claim that merely wrapping an arbitrary remote policy lookup in a database transaction makes it atomic.

### Tenant boundaries are conditional, not invented

**Required when tenancy exists.** Never derive an effective tenant solely from a query parameter, JSON body, unverified claim, or `X-Tenant-ID`. A selected tenant is untrusted input until verified membership/policy resolves it. Carry the resolved scope explicitly through ports and apply it to reads, writes, list filters, joins, caches, exports, and worker events. Do not query all rows then filter in the handler.

**SQL shape only, for a project that actually has tenancy:**

```sql
UPDATE tenant_documents
   SET title = $1, version = version + 1
 WHERE tenant_id = $2 AND id = $3 AND version = $4
RETURNING id, version;
```

Here `$2` is resolved trusted scope, and policy still decides whether the actor can edit the particular document. The tenant predicate prevents cross-tenant mutation; it does not by itself grant edit permission. Foreign keys/unique constraints should include tenant scope where appropriate. PostgreSQL row-level security can add defense in depth, but table owners/privileged roles can bypass it, and pooled connection/session state must not leak tenants.

**Wrong:** verify a token in middleware, then `repo.FindByID(r.PathValue("id"))` with no object policy; or use the body's tenant ID as the query scope. UUIDs and hidden buttons do not prevent horizontal access.

**Verification:** maintain an approved actor × action × object/state matrix; test denied-by-default, anonymous access, cross-user and cross-tenant IDs, list/export leaks, field-level rights, revoked membership, background-job callers, replayed idempotency results, and concurrent authorization changes. Decide whether missing/forbidden objects share a public `404` to conceal existence; do not invent that policy from a framework default.

## 3. Validate input size, shape, meaning, and output separately

**Required baseline.** HTTP validation protects the transport boundary; domain constructors protect business invariants; database constraints protect concurrent persistence. None substitutes for the others. `NewUser` normalization/validation belongs in the domain, while JSON decoding belongs in `internal/adapter/in/http/dto` or the handler. Avoid a second, conflicting email-normalization rule in middleware.

This complete **section-scoped decoding helper** uses imports `encoding/json`, `errors`, `io`, `mime`, and `net/http`. It does not create a User or decide who may do so. It accepts exactly one JSON value, rejects unknown fields, and limits the actual streamed body rather than trusting `Content-Length`:

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

Map the three safe sentinel errors to the project's `400`, `413`, and `415` contract. Map required/length/business-field failures from the domain through the same public error taxonomy. Reject path/query number overflow, unsupported sort fields, negative/excessive page sizes, and unbounded batch sizes. Parameterize SQL values; use a fixed allowlist to select SQL identifiers/order expressions because placeholders do not bind identifiers. Do not concatenate caller-supplied SQL.

**Needs project decision:** strict versus tolerant JSON compatibility. `encoding/json` accepts duplicate keys and matches struct fields case-insensitively; `DisallowUnknownFields` does not change that. If duplicate/case-ambiguous fields are unsafe for a signing, authorization, or interoperability contract, adopt a parser/validation strategy that rejects them and test it. Do not silently claim the helper supplies canonical JSON. Bound decompressed data, multipart uploads, file counts, and per-field lengths when those formats exist; an edge proxy's compressed-body limit may not bound application memory.

Output is also a boundary. Map an explicit response DTO in `internal/adapter/in/http/dto/user_mapper.go`; never serialize the Ent entity or indiscriminately expose the entire domain object. Whether email is public is a policy decision, not a consequence of the model having an Email field. Bound pagination and generated exports. Use `application/json`; use `html/template` for HTML rather than writing unescaped input. Do not put user-controlled input into header names, filesystem paths, redirects, or URL destinations without destination-specific validation. Validation is not permission.

**Wrong:** decode directly into a persistence entity that includes `IsAdmin`, then save it; accept unknown fields and assume they cannot affect future versions; or accept a body limit but return an unlimited list. These are mass-assignment and resource-exhaustion boundaries, not clean-architecture preferences.

**Verification:** chunked/lying `Content-Length`, empty/null/multiple values, malformed/unknown/duplicate fields under the selected policy, oversized input and output, invalid UTF-8/Unicode normalization where meaningful, overflow IDs, pagination maxima, SQL metacharacters as plain values, and response DTOs containing only authorized fields. Use fuzzing for parsers where appropriate.

## 4. Preserve private causes; map public failures deliberately

**Required baseline.** Preserve the original error for diagnosis and classification. Separate a stable application error category from the private cause and from the public message. Do not classify by `strings.Contains(err.Error(), "duplicate")`. Translate known Ent/driver constraint outcomes in persistence into application categories; keep driver-specific details out of the core's decision surface.

Combining strings in `CustomError` without a proper cause chain loses error identity; preserve the cause instead. This **section-scoped shared error type**, suitable for the existing `internal/pkg/errors` convention, needs no imports:

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

`Op` is a fixed developer-defined operation, not raw input. Wrapping with `%w` preserves a cause; whether callers are allowed to rely on the concrete cause is an API decision. The HTTP boundary must **not** serialize `Failure.Error()` just because the category is safe.

A complete **section-scoped HTTP mapper** follows. Imports: `context`, `encoding/json`, `errors`, and `net/http`; `apperrors` aliases the project's existing shared error package, e.g. `example.com/project/internal/pkg/errors`. Its enum/type are the preceding fragment. The `requestID` is already validated/server-generated, not copied unsafely from an arbitrary header.

This fragment deliberately uses an **alternative public JSON shape** to make the
category/cause distinction visible. It is not the canonical profile's wire
contract. That profile retains `{trid, code, result}`, its four-digit code strings,
and error `result: {msg}` as shown in [layers](layers.md). Reuse that renderer or
the target project's accepted renderer; adopting cause preservation does not
authorize an envelope migration.

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

This example chooses `504` for a bare application deadline; projects must distinguish their API's `408`, `503`, and `504` semantics. If the client disconnected, normally stop work and record cancellation rather than trying to force a nonstandard `499` response. A timeout or `500` after a command may still have an unknown committed/provider outcome: error mapping cannot prove rollback. Follow [idempotency and reconciliation](reliability-and-events.md).

The encoder error above cannot be repaired after headers are written; wire write-failure telemetry at the response boundary without logging response contents or sending a second JSON document. For a handler that must detect encoding errors before sending headers, encode its bounded DTO before `WriteHeader`. Do not buffer unbounded downloads. Use the project's normal renderer rather than adding a conflicting second error envelope.

Log one private failure at the owning boundary, with a sanitized cause and stack only when useful; avoid identical errors at every layer. A private error can contain SQL parameters, DSNs, provider payloads, or personal data: retaining the cause does not mean it is safe to send to every log sink. Keep detailed diagnostics in restricted/redacted channels. Never pass a raw exception/SQL error to the client. Panic recovery emits a generic response, records a safe diagnostic, and does not turn unknown state into success.

**Verification:** wrap causes through several layers and assert `errors.Is`/`errors.As` still work. Inject a database error containing a fake password/email; assert it never enters public JSON, headers, or ordinary logs. Assert unknown categories fall back to `500`, denied outcomes match existence policy, and no path sends success before commit.

## 5. Configuration and secrets are startup dependencies

**Required baseline.** Load configuration once in `internal/config`, validate it before serving, pass typed values into constructors, and fail startup safely when required configuration is absent or inconsistent. Avoid scattered `os.Getenv` in business code and implicit insecure defaults. A production secret missing at startup must not fall back to a development secret.

A complete **section-scoped public-settings example**, imports `errors`, `fmt`, `os`, and `time`. It deliberately excludes secret-bearing fields from printable configuration:

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

The one-minute cap and ordering are example local API budgets, not universal values. Streaming/jobs have separate budgets; the orchestrator termination grace must exceed the full drain/cleanup plan. Validate database DSN, pool sizes, TLS mode, allowed issuer/audience, destination allowlists, and required credentials with their own constraints. Do not include invalid secret values in parse errors. Do not print an entire config struct, even with debug logging.

Use the deployment's secret manager or protected injected files/environment according to its threat model; neither committing `.env` nor base64-encoding a secret makes it protected. Restrict runtime access, redact credentials in logs/traces/crash reports, rotate with a procedure, and prove old credentials can be revoked. Use separate least-privilege runtime and migration database roles; the API should not need schema-owner privileges. Encryption in transit/at rest does not replace access control.

**Wrong:** `jwtSecret := getenv("JWT_SECRET", "secret")`, a source-controlled live DSN, or `log.Info().Interface("config", cfg)`. These create silent insecurity or credential disclosure.

**Verification:** absent/malformed config fails before readiness; config errors do not echo credentials; production rejects insecure transport settings; rotate a credential without losing the documented availability goal and confirm revocation. Keep real secrets out of fixtures and example commands.

## 6. Logging, traces, metrics, and audit have different jobs

**Required baseline.** Use structured logs with stable fields and levels. Record operation, route template, method, status, duration, outcome category, and a bounded correlation ID. Use Zerolog through the existing logger convention; do not introduce a second logger only to copy a snippet. Avoid raw paths with identifiers, request/response bodies, authorization headers, cookies, DSNs, personal email, payment data, and untrusted strings as field names. Sanitize log-injection characters and apply retention/access policy.

**Error-log ownership across inbound adapters:** HTTP handlers, worker/job consumers, and CLI command boundaries own one unexpected-failure diagnostic per execution; choose either the adapter or its framework's final error handler, not both. Domain code, services/use cases, providers, repositories, and outbound adapters return errors with useful context and preserved causes without logging them. Changing the log level does not excuse duplication. Exceptions require an explicit project-owned reason and a single logging owner, such as startup/shutdown failures that cannot reach an inbound boundary. Access records, operation metrics, and required audit records remain separate signals, not duplicate failure diagnostics.

- **Correlation/request ID:** ties observations together. Accept inbound IDs only under a bounded format/trust policy or generate a new one. `TrID` is such an identifier, **not a database transaction**, idempotency key, or proof of a committed operation.
- **Trace/span context:** carries causal execution metadata. Use the OpenTelemetry propagator's validation/sampling and trusted ingress rules. Never put credentials or sensitive attributes into baggage; propagation may send it to another organization.
- **Database transaction:** is a resource/atomicity boundary created by `BeginTx`/Ent `Tx` and completed with commit/rollback. A logging middleware cannot create it just by setting `TrID`.
- **Business operation/event ID:** is a durable identity under its own uniqueness and retention contract. Do not use a new request ID to deduplicate retries.
- **Audit record:** is a project-defined security/business record with access, tamper resistance, and retention requirements. A sampled application log is not automatically an audit trail. Record actor/action/target/result without unnecessary secret content; if an audit record must be atomic with a mutation, persist it in the same local transaction or durable outbox.

A **Zerolog field-shape fragment** for an inbound boundary uses an existing `zerolog.Logger` and `time.Time` supplied by middleware:

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

The variables are already bounded/sanitized metadata; this fragment is not an HTTP response wrapper. If wrapping `ResponseWriter`, preserve optional interfaces required by streaming/hijacking or use the framework's tested wrapper. Do not break WebSockets just to log status. Logging every successful request may itself be optional at high volume; service-level metrics remain necessary to the selected SLO.

**Metrics:** use bounded labels such as route template, method, status class, operation, and safe error category. Do not use user ID, email, request/trace ID, arbitrary URL, key, or provider message as a metric label. Measure request rate/errors/latency; DB pool wait/in-use; dependency latency/timeouts; worker saturation; and, if adopted, oldest outbox age, delivery attempts, inbox mismatches, poison queue depth, unknown provider outcomes, and reconciliation age. Alert on impact and actionable backlog, not merely every logged error. Trace sampling must not erase the only required audit evidence.

**Verification:** inspect emitted logs/traces/metrics under success, denied access, malformed input, provider errors, and panic. Propagate a dependency failure through the shared inner layers to each supported HTTP, worker, or CLI boundary: assert one owning failure diagnostic per execution, none from the inner layers or a second framework handler, and preservation of distinct access/metrics/audit signals. Seed fake secret/PII markers and assert absence in ordinary telemetry. Verify route labels remain bounded across random object IDs and that correlation works across an outbox using safe causation metadata, without claiming one database transaction spans the trace.

## 7. Health endpoints describe traffic eligibility, not business success

**Required for a managed long-running service.** Keep health output small and non-sensitive. Restrict management endpoints/pprof to the intended network and authorization policy.

- **Liveness:** can the process make progress? Usually a cheap process-local check. Do not fail liveness just because PostgreSQL or a provider is temporarily unavailable; restarting all replicas can worsen that outage.
- **Readiness:** should this instance receive new traffic? Include startup completion, shutdown/draining state, and only dependencies required for its promised traffic. An API whose every route requires the database may need a bounded database check; an optional email provider usually should not gate every route.
- **Startup probe:** where supported, distinguish slow initialization from a dead process instead of extending all liveness delays.

A complete **section-scoped readiness handler** imports `context`, `database/sql`, `net/http`, `sync/atomic`, and `time`. The composition root owns the database and ready flag. This probe does not run migrations or imply every SQL permission/schema is correct:

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

For Ent, use a supported owned SQL-driver/pool health capability rather than reaching through unsafe casts. Readiness checking the database on every probe can create load; choose probe frequency/timeouts and optional short caching based on fleet size. Database ping proves connectivity, not migration compatibility or successful business transactions. Validate compatible schema during deployment/startup using the project's migration process, not destructive auto-migration from the probe.

**Verification:** startup is unready until initialization finishes; shutdown sets unready; a database outage changes readiness only as designed and does not trigger liveness restart storms; optional provider failure does not unnecessarily remove healthy read capacity.

## 8. Timeouts, resource budgets, and graceful shutdown

**Required baseline.** Bound HTTP header/body handling, application work, database wait/query/lock time, outgoing calls, queue prefetch, goroutines, and memory. Budgets must compose: an inner dependency cannot consume more than the remaining outer deadline; returning a timeout response does not stop code that ignores cancellation. A Chi timeout middleware sets a context deadline; handlers/ports/adapters must actually honor it. Never wrap context-ignorant work in a leaking goroutine and call the problem solved.

For a non-streaming JSON API, a **composition fragment** is:

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

This fragment uses `net/http` and `time`; `cfg`, `router`, and `db` are already constructed typed dependencies. Values are illustrative, not a universal SLO. Configure transaction/query/lock deadlines separately. Size total DB connections across **all replicas and workers**, leaving migration/admin headroom. A pool cap can trade overload for queueing; measure wait time and shed load before queues become unbounded. Align proxy, server, application, client, broker, and orchestrator budgets. Streaming, server-sent events, uploads, and hijacked connections require explicit per-route deadlines/lifecycle rather than copying these whole-request limits.

### Drain before destroying dependencies

The following **section-scoped Go lifecycle function** is complete for an already initialized HTTP server with finite requests, no hijacked connections, and no independent workers. Imports: `context`, `errors`, `net/http`, and `time`. Call it from `cmd/api/main.go` with a signal context, a positive budget, and a readiness callback; the caller owns/ultimately closes database and transport resources after it returns.

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

`context.Background()` is intentional **only for bounded shutdown cleanup** because the signal/request context is already canceled; it must not replace ordinary request contexts. `Shutdown` stops listeners and waits for active HTTP connections to become idle, but does not wait for arbitrary worker goroutines or hijacked connections. `Close` after timeout forces connection closure, not database rollback or guaranteed goroutine termination. Bound and propagate request contexts independently; if handlers ignore cancellation, do not close shared dependencies while claiming they finished.

This function marks initialized readiness around server startup; for an environment requiring listener-bound evidence before readiness, bind the listener synchronously and use `Serve(listener)`, marking ready only after a successful bind. A separate health listener and external routing propagation delay need an explicit drain plan. Do not add a fixed sleep without accounting for the deployment's actual routing behavior.

For applications with workers, extend the lifecycle deliberately: mark unready; stop accepting new jobs/claims; let in-flight requests and jobs finish under the shared shutdown budget; cancel remaining work; wait for owned goroutines; only then close broker channels, HTTP idle connections, and the database. If timeout forces termination, uncommitted transactions must roll back and unacked messages/expired leases must be recoverable. Never acknowledge unfinished work during shutdown. Track WebSockets/streams through a separate registry and close/wait policy. Reserve part of the orchestrator termination budget for forced cleanup rather than giving all of it to HTTP drain.

**Wrong:** `defer db.Close()` followed by `os.Exit`, or close the DB first while handlers/workers still use it. `log.Fatal`/`os.Exit` bypass deferred cleanup. Also wrong: derive every active request from a signal context that is canceled immediately, then claim requests were allowed to drain.

**Verification:** terminate during a slow request, local commit, provider ambiguity, and queue processing where applicable. Assert new work is rejected/unready, owned work ends within the budget, resources close in order, no ack precedes commit, and restart recovers pending durable work. Test listener startup failure and shutdown deadline expiration. Do not infer graceful behavior merely because a SIGTERM handler exists.

## 9. Deployments and database changes need compatibility evidence

**Required for persistent production services.** The migration lifecycle belongs to the persistence/deployment boundary, not a handler. Ent schema definitions are not evidence that a migration is safe against an existing production database.

Use a versioned migration process with a recorded schema version and a single authorized executor/lock. Separate runtime credentials from migration credentials. For Ent/PostgreSQL, follow the selected Ent/Atlas migration workflow rather than assuming development `Schema.Create` supplies reviewed production changes.

A project-owned rollout plan must answer:

1. **Before deployment:** what app versions coexist; can old and new code read/write the expanded schema and event versions; what schema/database/extension versions are supported; what locks, runtime, disk space, and connection headroom are expected?
2. **Expand:** add compatible structures first, often nullable columns/indexes; verify lock timeout and online/concurrent-index restrictions. PostgreSQL `CREATE INDEX CONCURRENTLY` has special transaction and failure semantics; do not put it blindly inside a migration transaction.
3. **Backfill:** run bounded, restartable, observable batches using a stable progress condition; protect against concurrent writes and duplicate work. Do not hold one transaction across the entire table merely to simplify a script.
4. **Switch:** deploy code that can coexist with the old version; verify the new reads/writes and constraints. Dual writes introduce their own consistency window and are not a mandatory strategy.
5. **Contract:** remove old fields/paths only after old app instances, jobs, consumers, and rollback windows no longer depend on them. This temporary migration compatibility is not a permanent shim.
6. **Failure:** distinguish safe application rollback from unsafe data/schema reversal. A down migration cannot recreate deleted data. Prefer a reviewed forward repair when reversal is destructive.

Deploy immutable, reproducible artifacts; use least-privilege runtime/network/filesystem settings, reviewed dependency updates, and the project's vulnerability scanning policy. Go's vulnerability tooling helps identify reachable known vulnerabilities; it does not prove the application is secure. Keep debug endpoints and admin mutation tools out of public routing. Make a canary/rollout stop decision from actual error/latency/consistency signals, not only healthy process probes.

**Verification:** apply the migration to a representative disposable database; measure locks/backfill duration and validate old/new app compatibility under concurrent traffic; interrupt/resume a backfill; rehearse failed rollout and forward repair. Empty test directories provide no such evidence. Record the actual exercised commands/environment/results in project records, not fabricated “production-ready” claims.

## 10. Recovery, backups, and repair are part of the design

**Needs project decision:** recovery point objective (maximum tolerable data loss), recovery time objective (maximum tolerable outage), backup retention/location/encryption/access, restore owner, and whether event/provider state can be reconstructed. A backup file existing is not proof of recovery.

**Required for irreplaceable persisted data:** schedule and monitor backups; retain required PostgreSQL WAL/base backups for the selected recovery approach; secure keys and backup access separately; rehearse restore to an isolated environment and verify data/constraints/application startup. Distinguish SQL dumps, file-level backups, and continuous archiving when choosing the recovery approach. Use the managed provider's documented recovery mechanism when applicable; do not assume database settings imply managed backup coverage.

Recovery must account for external time:

- Restoring a database snapshot does not un-send email, refund a charge, or rewind a broker. A restored local pending operation may already have completed externally.
- Outbox rows restored as unpublished can publish again; consumers/inboxes restored to an earlier point may reapply effects. Broker retention, inbox/key retention, and provider deduplication windows must be reconciled with the restore point.
- Keep stable operation/event identities where possible and reconcile external outcomes before resubmitting irreversible work. A global “replay everything” script is not a safe repair plan.
- A repair command is a protected mutation: require authorization, bounded scope, dry-run/preview where feasible, audit records, idempotency, and an explicit review/approval policy for irreversible changes. Do not edit production records ad hoc and hide the evidence.
- Define incident access, escalation, secret rotation, rollback/forward repair, customer communication ownership, and how to detect silent corruption. Not every project needs a complex incident platform; every critical service needs a reachable owner and usable procedure.

**Verification:** restore a backup, start the app, inspect schema version and key invariants, reconcile a sample of provider/broker operations, and measure actual RPO/RTO. Exercise a lost credential, poison event, stuck workflow, and accidental deletion according to adopted features. Keep restore environments isolated from live outbound notifications/payments. Recovery evidence must include what was restored and reconciled, not just “backup succeeded.”

## 11. External integration security

**Required when making external calls.** Keep provider details in outbound adapters, business decisions in services, and credentials in injected runtime configuration. Apply the reliability rules in [reliability and events](reliability-and-events.md) as well as these security controls:

- **Destinations:** prefer a fixed validated HTTPS base URL. If arbitrary URLs are a product requirement, define SSRF controls for scheme, hostname, DNS resolution, address ranges, ports, redirects, and network egress. A string prefix or one initial DNS check is insufficient against redirects/rebinding. Block internal/metadata endpoints according to the deployment network policy. Do not disable TLS verification to make development certificates work.
- **Credentials:** use least-privilege, provider-scoped keys; do not send credentials in query strings or forward inbound authorization headers to an unrelated provider. Treat redirect credential behavior explicitly. Rotate and revoke keys; redact URL/userinfo and headers in diagnostics.
- **Responses:** bound bytes and parsing complexity, validate required fields and allowed state transitions, check status/content contract, and close bodies. A trusted provider can still return malformed or hostile data after compromise. Do not deserialize a provider response directly into an Ent entity or grant permissions from an unchecked remote field.
- **Webhooks:** use the provider's official verification library/procedure, raw bounded request bytes when signatures cover those bytes, a configured secret/key, timestamp/replay tolerance, and constant-time cryptographic verification supplied by the library. IP allowlists alone are not authentication. Verify before acting; then deduplicate the stable provider event/operation ID and apply a guarded transaction. Handle duplicates and out-of-order delivery. Rotate webhook secrets under the provider's supported overlap policy.
- **Outbound callbacks/uploads:** distinguish where a caller may send data from what they may read. Protect object storage credentials/URLs with scope and expiry; enforce content limits and malware/content policy when uploads exist. Do not add file-scanning infrastructure to an app with no uploads.
- **Failure:** bound rate and concurrency, recognize provider quotas, and report unknown outcomes truthfully. Security failures such as invalid signatures or authentication rejection are not automatically transient retries.

**Wrong:** accept an arbitrary callback URL, follow redirects with credentials, parse a signed webhook into a struct then re-encode it for signature verification, or return a full provider error/body to the caller.

**Verification:** invalid/expired signatures, replayed webhook IDs, changed signed bytes, duplicate/out-of-order notifications, redirect to a forbidden address, credential rotation, malicious/oversized provider responses, and accepted-but-disconnected provider commands. Use the actual integration's verification contract rather than assuming identical rules across providers.

## 12. Evidence required before claiming the boundary is guarded

Use [testing and evolution](testing-and-evolution.md) for test placement and [adoption](../adoption.md) to record adopted, deferred, not-applicable, and open decisions. Do not require every optional mechanism to release a simple local CRUD service; require evidence for every guarantee actually promised.

- **Local boundary:** cancellation and limits, domain/database invariants, safe response mapping, authorized field mapping, no resource leaks, and startup/config failure behavior.
- **Protected API:** real identity validation, explicit action/object rights, denied-by-default paths, tenant isolation if relevant, session/CSRF controls if relevant, and no secret/PII leakage.
- **Operated service:** readiness/liveness separation, bounded drain, workload/resource measurements, safe migrations/deployment compatibility, and restore/recovery proof against the declared objectives.
- **Distributed side effects:** durable intent and acknowledgment order, duplicates/replay/poison handling, provider ambiguity/reconciliation, and authorized repair procedures where adopted.

State unexercised controls and missing policy decisions explicitly. A clean directory tree, sample middleware, or passing unit suite is not itself operational proof.
