# Go layers: implementation and review examples

Read [architecture](architecture.md) before implementing: it owns the canonical tree, imports, default API, command placement, and exact service-call bans. This chapter implements a Chi/Ent/PostgreSQL/Zerolog create/get/list slice. Preserve an existing project's compatible stack under its real engine name; this is not migration authority.

Fragments are scoped, not one compilable file. Combine fragments sharing a file/package; each introduces its imports/assumptions. Replace `example.com/app` with the target module and retain compatible dependency versions. Aliases are `inport`, `outport`, `httpadapter`; `command` is imported directly. “Handler” and `UserController` are one responsibility.

Before designing signatures or tooling, read [coding conventions](coding-conventions.md) for input thresholds, entity/value typing, naming, spacing, and lint coverage. Before extracting calculations or conversions, read [behavior ownership](behavior-ownership.md). Keep coordination at one level of abstraction and I/O/errors/transactions visible.

The [runnable example](../../examples/go) is a separate standard HTTP/SQLite adaptation, not an Ent implementation or production-profile evidence.

## 1. Start with the application contracts, not a JSON or database struct

### Inbound port and application data

**Required baseline.** Commands express intent; queries express selection; results express application outcomes. They are not HTTP DTOs just because they contain fields. Declare inbound command structs in `internal/core/port/in/command/user.go`, retaining the `*Command` names:

```go
package command

type CreateUserCommand struct {
    Name  string
    Email string
}
```

Keep interfaces, queries/results, and `ErrInvalidInput` in `internal/core/port/in/user.go`. Use `UserUseCase`, not an application-wide `UseCase`/`Service` interface. The parent imports `command` for its signatures:

```go
package in

import (
    "context"
    "errors"

    "example.com/app/internal/core/domain"
    "example.com/app/internal/core/port/in/command"
)

type ListUsersQuery struct {
    Offset int
    Limit  int
}

type UserPage struct {
    Users   domain.Users
    Offset  int
    Limit   int
    HasMore bool
}

var ErrInvalidInput = errors.New("invalid use-case input")

func (q ListUsersQuery) Normalize() (ListUsersQuery, error) {
    if q.Offset < 0 || q.Offset > 100000 || q.Limit < 0 || q.Limit > 100 {
        return ListUsersQuery{}, ErrInvalidInput
    }
    if q.Limit == 0 {
        q.Limit = 50
    }
    return q, nil
}

func NewUserPage(users domain.Users, q ListUsersQuery) UserPage {
    more := len(users) > q.Limit
    if more {
        users = users[:q.Limit]
    }
    return UserPage{
        Users: users, Offset: q.Offset, Limit: q.Limit, HasMore: more,
    }
}

type UserUseCase interface {
    CreateUser(context.Context, command.CreateUserCommand) (*domain.User, error)
    GetUser(context.Context, int) (*domain.User, error)
    ListUsers(context.Context, ListUsersQuery) (UserPage, error)
}
```

These are HTTP/ORM-independent application types: no JSON tags, framework request/writer/context, ID-allocation object, or Ent entity. `GetUser(ctx, id)` needs no scalar wrapper. Follow [architecture's command dependency/migration rules](architecture.md#3-dependency-direction-is-about-imports-not-execution-order) when moving existing commands; use local `cmd` so it does not shadow the package.

`ListUsersQuery.Normalize` owns the accepted bounds/defaults for every caller.
`NewUserPage` consumes a normalized query and the bounded lookahead result; it
owns trimming and `HasMore` without copying the user collection. These are
application query/result behaviors, not JSON conversion or domain identity rules.

For protected operations, read [security and operations](security-and-operations.md) before selecting trusted actor/tenant and authorization contracts; JSON `TenantID` is not authenticated scope. Narrow `UserCreator`/`UserReader` interfaces are optional for genuinely different consumer subsets, not mandatory per-method wrappers.

### Outbound ports: separate reads from writes

Place this fragment in `internal/core/port/out/user.go`, importing `context`, `errors`, and `domain`. Adopting these context-aware contracts requires migrating existing implementations, mocks, and callers together; do not retain a mixed read/write repository as a compatibility shim.

```go
package out

var (
    ErrUserNotFound = errors.New("user not found")
    ErrEmailTaken   = errors.New("email already registered")
    ErrStorage     = errors.New("storage operation failed")
)

type UserProvider interface {
    FindByID(context.Context, int) (*domain.User, error)
    List(ctx context.Context, offset, limit int) (domain.Users, error)
}

type UserRepository interface {
    Insert(context.Context, *domain.User) (*domain.User, error)
}
```

`Insert` returns generated identity, never implicit update authority from a nonzero ID. `FindByID` returns inspectable not-found, not `(nil, nil)`; empty `List` succeeds, ordered `(created_at, id)` ascending. Public bounds remain application-owned; providers support bounded lookahead.

In the same outbound package, separate error category from private cause:

```go
type RepositoryError struct {
    Op    string
    Kind  error
    Cause error
}

func (e *RepositoryError) Error() string { return e.Op + ": " + e.Kind.Error() }

func (e *RepositoryError) Unwrap() error { return e.Cause }

func (e *RepositoryError) Is(target error) bool { return target == e.Kind }
```

Construction supplies known nonnil `Kind` and cause. `Is` preserves portable categories through `%w`; `Unwrap` preserves cancellation/diagnostics. `Error` excludes raw driver details/user data. Core branches on categories, never PostgreSQL types/constraint names. Reuse an existing correct `internal/pkg/errors` mechanism rather than adding a second system; before extending error/concurrency contracts, read [domain](domain.md) and [data and transactions](data-and-transactions.md).

**Wrong boundary contracts:**

```go
type UserUseCase interface {
    CreateUser(context.Context, dto.CreateUserRequest) (*ent.User, error)
}
type UserRepository interface {
    Query() *ent.UserQuery
    Begin(context.Context) (*ent.Tx, error)
}
```

These illustrative invalid signatures use HTTP `dto`/generated `ent`, precisely
the dependencies core must not import. Transaction contracts stay framework-neutral.


**Review target:** a service test can invoke the inbound contract and fake the outbound contract without importing HTTP, Ent, or PostgreSQL. Interface checks should describe real substitutability, not merely mirror a concrete adapter.

## 2. Domain: valid business state without delivery or storage

`internal/core/domain/user.go` owns the invariant. This scoped example imports standard `errors`, `net/mail`, `strings`, `time`, `unicode/utf8`. It uses exported `User` fields, pointer entities, and a defined `Users` collection—not pre-existing encapsulated state or named IDs.

**Example policies, requiring project agreement:** trim input, at most 100 name runes, one mailbox without display name, lowercase the whole email. Local-part lowercasing is not universal Internet semantics; normalization, lookup, and unique storage key must agree.

```go
package domain

var ErrInvalidUser = errors.New("invalid user")

type User struct {
    ID        int
    Name      string
    Email     string
    CreatedAt time.Time
}

type Users []*User

func NewUser(id int, name, email string, now time.Time) (*User, error) {
    name = strings.TrimSpace(name)
    email = strings.ToLower(strings.TrimSpace(email))
    if id < 0 || name == "" || utf8.RuneCountInString(name) > 100 || now.IsZero() {
        return nil, ErrInvalidUser
    }
    address, err := mail.ParseAddress(email)
    if err != nil || address.Name != "" || address.Address != email {
        return nil, ErrInvalidUser
    }
    return &User{ID: id, Name: name, Email: email, CreatedAt: now.UTC()}, nil
}
```

Application supplies time; domain reads no environment/connections/global logger. Every caller gets the invariant, even without HTTP validation. Exported fields permit later mutation: when lifecycle rules grow, add private state/transitions and explicit rehydration/accessors rather than copying validation across services. Before that change, read [domain modeling](domain.md); a small record needs no aggregate/event framework merely for terminology.

**Wrong domain ownership** (invalid contrast using HTTP `r`, Ent `client`,
and decoded HTTP `req`, not declarations to add to domain):

```go
func CreateUser(r *http.Request, client *ent.Client) error {
    return client.User.Create().SetName(r.FormValue("name")).Exec(r.Context())
}

u := &domain.User{Name: req.Name, Email: req.Email}
```

The first merges transport/storage with domain; the second bypasses construction.


**Review target:** domain tests cover empty/long names, accepted normalization, malformed addresses, and time/ID assumptions without booting a server or database. Check that changing the accepted normalization rule includes a data migration/conflict decision rather than silently changing identity semantics.

## 3. Application service: coordinate, do not translate protocols

Place this fragment in `internal/core/service/usecase/user/usecase.go`. The package is `user`; its `NewUseCase` implements `UserUseCase`. Returning an inbound interface is this example's convention; a concrete constructor return is also valid when the caller still depends on the boundary it needs.

```go
package user

import (
    "context"
    "fmt"
    "time"

    "example.com/app/internal/core/domain"
    inport "example.com/app/internal/core/port/in"
    "example.com/app/internal/core/port/in/command"
    outport "example.com/app/internal/core/port/out"
)

type useCase struct {
    userProvider outport.UserProvider
    userRepo     outport.UserRepository
    now          func() time.Time
}

func NewUseCase(userProvider outport.UserProvider, userRepo outport.UserRepository, now func() time.Time) inport.UserUseCase {
    return &useCase{userProvider: userProvider, userRepo: userRepo, now: now}
}

var _ inport.UserUseCase = (*useCase)(nil)

func (s *useCase) CreateUser(ctx context.Context, cmd command.CreateUserCommand) (*domain.User, error) {
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    u, err := domain.NewUser(0, cmd.Name, cmd.Email, s.now())
    if err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    created, err := s.userRepo.Insert(ctx, u)
    if err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    return created, nil
}

func (s *useCase) GetUser(ctx context.Context, id int) (*domain.User, error) {
    if id <= 0 {
        return nil, inport.ErrInvalidInput
    }
    u, err := s.userProvider.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get user: %w", err)
    }
    return u, nil
}

func (s *useCase) ListUsers(ctx context.Context, q inport.ListUsersQuery) (inport.UserPage, error) {
    q, err := q.Normalize()
    if err != nil {
        return inport.UserPage{}, err
    }
    users, err := s.userProvider.List(ctx, q.Offset, q.Limit+1)
    if err != nil {
        return inport.UserPage{}, fmt.Errorf("list users: %w", err)
    }
    return inport.NewUserPage(users, q), nil
}
```

One atomic insert needs no ceremonial application transaction. An email precheck is advisory under concurrency; the actual named unique violation decides conflict.

Composition supplies valid nonnil dependencies and `time.Now`; tests inject fixed time. Do not add fallback repositories/clocks. Before reusing operations, apply [architecture's exact service-call restrictions](architecture.md#service-areas-and-exact-call-restrictions): extract pure behavior into domain or genuine application/I/O reuse into shared, never chain peer operations.

The example query policy is default 50, max 100, offset max 100000—not universal limits. Normalize for all callers, shape the result in application, and request at most one extra row from the provider.

**Required when the use case is protected:** orchestrate authorization before exposing or mutating data, using an explicit policy and trusted scope. **Required when two writes share an invariant:** use the transaction contract from [data and transactions](data-and-transactions.md). **Required when publishing must survive crashes:** use the durable delivery contract from [reliability and events](reliability-and-events.md). Do not append `go publishEvent(...)` to this service and claim reliability.

**Wrong coordination** (invalid contrast with HTTP `dto`, generated `ent`,
and a hypothetical global `persistence` registry):

```go
func (s *useCase) CreateUser(_ context.Context, req dto.CreateUserRequest) (*ent.User, error) {
    client := persistence.GlobalClient()
    return client.User.Create().SetName(req.Name).SetEmail(req.Email).
        Save(context.Background())
}
```

Also reject error-text comparisons, HTTP status selection, or logging propagated
failures here before the inbound boundary logs them.


**Review target:** test query normalization and result shaping directly for invalid bounds, defaults, empty/exact/overfull pages, and no loss of returned users. Service checks use small provider/repository doubles and fixed time for rejected writes, normalized stored state, retained error categories, and coordination failures. Do not retest every pure rule through service mocks. See [testing and evolution](testing-and-evolution.md) for transaction/cancellation and real-adapter evidence.

## 4. HTTP DTO and mapper: preserve the wire contract deliberately

Place the following transport types in `internal/adapter/in/http/dto/user.go`; `time.Time` is the only non-primitive field here.

```go
package dto

type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

type UserResponse struct {
    ID        int       `json:"id"`
    Name      string    `json:"name"`
    Email     string    `json:"email"`
    CreatedAt time.Time `json:"created_at"`
}

type UserListResponse struct {
    Users   []UserResponse `json:"users"`
    Offset  int            `json:"offset"`
    Limit   int            `json:"limit"`
    HasMore bool           `json:"has_more"`
}

type ErrorResult struct {
    Msg string `json:"msg"`
}
```

Keep `ErrorResult` in `dto/response.go` and use the established `utils.StandardResponse` (`internal/pkg/utils/http.go`). This controller implements [architecture's default envelope](architecture.md#4-exact-responsibility-and-file-decisions), not bare JSON/problem details or a second helper. Existing helper relocation requires an explicit migration. Exposing `Email` is an API/access decision; protected lists may need narrower responses.

Put conversion in the **HTTP** mapper `internal/adapter/in/http/dto/user_mapper.go`:

```go
package dto

import (
    "example.com/app/internal/core/domain"
    inport "example.com/app/internal/core/port/in"
    "example.com/app/internal/core/port/in/command"
)

func (r CreateUserRequest) ToCommand() command.CreateUserCommand {
    return command.CreateUserCommand{Name: r.Name, Email: r.Email}
}

func ToUserResponse(u *domain.User) UserResponse {
    return UserResponse{
        ID: u.ID, Name: u.Name, Email: u.Email, CreatedAt: u.CreatedAt,
    }
}

func ToUserListResponse(page inport.UserPage) UserListResponse {
    users := make([]UserResponse, len(page.Users))
    for i, u := range page.Users {
        users[i] = ToUserResponse(u)
    }
    return UserListResponse{
        Users: users, Offset: page.Offset, Limit: page.Limit, HasMore: page.HasMore,
    }
}
```

Success guarantees nonnil users/elements; fix a violating adapter rather than fabricating a zero user. `domain.Users` holds entities, while `[]UserResponse` is a value projection. One pre-sized slice allocation is intentional; no reflection/JSON round-trip or accidental `null` for an empty list.

Mapping allowlists input/output independently: no client-set ID/time/role, nor accidental exposure of later domain fields, Ent edges, or password hashes.

**Wrong conversion** (independent invalid contrasts; `ent` is generated storage,
`domainUser`/`req` are existing values, and `w` is the HTTP writer):

```go
type CreateUserRequest = ent.User

json.NewEncoder(w).Encode(domainUser)

func ToCommand(req CreateUserRequest, repo outport.UserRepository) command.CreateUserCommand {
    repo.Insert(context.Background(), &domain.User{Name: req.Name})
    return command.CreateUserCommand{Name: req.Name, Email: req.Email}
}
```


**Review target:** DTO tests assert public field names, empty-list behavior, and the absence of internal fields. Mapper tests check allowed fields exactly. Application command tests should not require JSON serialization. Partial updates need an explicit omitted/null/value policy rather than using empty strings to mean all three; see [testing and evolution](testing-and-evolution.md) for compatibility cases.

## 5. HTTP controller: bounded decode, use-case call, safe response

`internal/adapter/in/http/handler/user.go` owns parsing/status/headers and depends on the inbound port. These shared-package fragments import standard `context`, `encoding/json`, `errors`, `fmt`, `io`, `mime`, `net/http`, `strconv`; Chi; Chi middleware as `chimw`; Zerolog; `dto`, `domain`, `inport`, `outport`; and existing `utils`. Middleware below installs the request logger.

```go
type UserController struct {
    userUseCase inport.UserUseCase
}

func NewUserController(userUseCase inport.UserUseCase) *UserController {
    return &UserController{userUseCase: userUseCase}
}

func (c *UserController) CreateUser(w http.ResponseWriter, r *http.Request) {
    req, err := decodeCreateUser(w, r)
    if err != nil {
        c.fail(w, r, err)
        return
    }
    u, err := c.userUseCase.CreateUser(r.Context(), req.ToCommand())
    if err != nil {
        c.fail(w, r, err)
        return
    }
    w.Header().Set("Location", "/users/"+strconv.Itoa(u.ID))
    c.respond(w, r, http.StatusCreated, dto.ToUserResponse(u))
}

func (c *UserController) GetUser(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.Atoi(chi.URLParam(r, "id"))
    if err != nil || id <= 0 {
        c.fail(w, r, &requestError{http.StatusBadRequest, "invalid_id", "invalid user ID"})
        return
    }
    u, err := c.userUseCase.GetUser(r.Context(), id)
    if err != nil {
        c.fail(w, r, err)
        return
    }
    c.respond(w, r, http.StatusOK, dto.ToUserResponse(u))
}
```

### Decode exactly one bounded JSON object

This HTTP-only helper limits bodies to 64 KiB, requires `application/json`, rejects unknown fields, `null`, and trailing JSON. Size/unknown-field tolerance are compatibility decisions. `DisallowUnknownFields` neither validates a full schema nor rejects duplicate keys; use an explicit validated policy if duplicate-key ambiguity matters.

```go
type requestError struct {
    status  int
    code    string
    message string
}

func (e *requestError) Error() string { return e.message }

func decodeCreateUser(w http.ResponseWriter, r *http.Request) (dto.CreateUserRequest, error) {
    mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
    if err != nil || mediaType != "application/json" {
        return dto.CreateUserRequest{}, &requestError{
            http.StatusUnsupportedMediaType, "unsupported_media_type", "expected application/json",
        }
    }
    r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
    decoder := json.NewDecoder(r.Body)
    decoder.DisallowUnknownFields()
    var req *dto.CreateUserRequest
    if err := decoder.Decode(&req); err != nil {
        return dto.CreateUserRequest{}, bodyError(err)
    }
    if req == nil {
        return dto.CreateUserRequest{}, &requestError{
            http.StatusBadRequest, "invalid_json", "expected a JSON object",
        }
    }
    var extra any
    if err := decoder.Decode(&extra); err != io.EOF {
        return dto.CreateUserRequest{}, bodyError(err)
    }
    return *req, nil
}

func bodyError(err error) error {
    var tooLarge *http.MaxBytesError
    if errors.As(err, &tooLarge) {
        return &requestError{
            http.StatusRequestEntityTooLarge, "body_too_large", "request body is too large",
        }
    }
    return &requestError{http.StatusBadRequest, "invalid_json", "invalid JSON body"}
}
```

`bodyError(nil)` deliberately rejects a successful second decode. It exposes no decoder text/client field names/internal traces. The server owns ordinary body closure, not domain.

### Classify errors once; serialize once

Keep error/status mapping and serialization in the handler, preserving the accepted envelope and safe messages. A different status policy is an explicit API compatibility decision, never a core status code.

```go
func (c *UserController) fail(w http.ResponseWriter, r *http.Request, err error) {
    if r.Context().Err() != nil {
        return
    }
    status, code, message := http.StatusInternalServerError, "internal", "internal server error"
    var input *requestError
    switch {
    case errors.As(err, &input):
        status, code, message = input.status, input.code, input.message
    case errors.Is(err, domain.ErrInvalidUser), errors.Is(err, inport.ErrInvalidInput):
        status, code, message = http.StatusBadRequest, "invalid_input", "invalid input"
    case errors.Is(err, outport.ErrUserNotFound):
        status, code, message = http.StatusNotFound, "not_found", "user not found"
    case errors.Is(err, outport.ErrEmailTaken):
        status, code, message = http.StatusConflict, "email_taken", "email already registered"
    case errors.Is(err, context.DeadlineExceeded):
        status, code, message = http.StatusGatewayTimeout, "timeout", "operation timed out"
    }
    if status >= 500 {
        zerolog.Ctx(r.Context()).Error().Err(err).Str("code", code).Msg("request failed")
    }
    c.respond(w, r, status, dto.ErrorResult{Msg: message})
}

func (c *UserController) respond(w http.ResponseWriter, r *http.Request, status int, value any) {
    envelope := utils.StandardResponse{
        TrID: chimw.GetReqID(r.Context()), Code: fmt.Sprintf("%04d", status), Result: value,
    }
    body, err := json.Marshal(envelope)
    if err != nil {
        zerolog.Ctx(r.Context()).Error().Err(err).Msg("encode response")
        status = http.StatusInternalServerError
        body = []byte(`{"trid":"","code":"0500","result":{"msg":"internal server error"}}`)
        w.Header().Del("Location")
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    if _, err := w.Write(body); err != nil {
        zerolog.Ctx(r.Context()).Debug().Err(err).Msg("write response")
    }
}
```

Marshal before committing headers. After `WriteHeader`/partial write, log delivery failure without writing a second `500` or retrying business work. The fixed encoding-error body retains the envelope with empty `trid`; request logs still carry correlation.

This explicit Chi `RequestID` adaptation fills `trid` via `chimw.GetReqID`. If retaining the default `TrID`, use its typed accessor; never install both ID generators. A canceled request gets no response (access status may be zero); a child deadline on a live request maps to `504`. Timeout does not prove a write failed to commit; before adding retries read [reliability](reliability-and-events.md).

`RepositoryError.Error` is sanitized, not every foreign `.Err(err)`. Before logging SQL/client-body/credential/sensitive-field errors, apply [security and operations](security-and-operations.md)'s redaction and single-owner policy; retained causes are not permission to dump them.

**Wrong HTTP path** (independent invalid handler fragment with generated `ent`
and a captured Ent `client`; these are not imports/dependencies to add):

```go
var req ent.User
json.NewDecoder(r.Body).Decode(&req)
row, err := client.User.Create().SetName(req.Name).Save(context.Background())
if err != nil {
    http.Error(w, err.Error(), http.StatusInternalServerError)
    return
}
json.NewEncoder(w).Encode(row)
```


**Review target:** HTTP tests exercise bad content type, empty/null/malformed/extra JSON, unknown fields under the accepted policy, oversized bodies, invalid path/query numbers, category-to-status mapping, public error redaction, and exactly one use-case call. Use-case failures must not accidentally serialize an Ent object or fall through into a second response.

## 6. Chi router and middleware: wire transport behavior, not business behavior

### Router

Place this fragment in `internal/adapter/in/http/router.go`, using `chi`, Chi middleware as `chimw`, the custom middleware package as `httpmw`, `handler`, `inport`, and `zerolog` imports.

```go
package http

func NewRouter(userUseCase inport.UserUseCase, log zerolog.Logger) *chi.Mux {
    r := chi.NewRouter()
    r.Use(chimw.RequestID)
    r.Use(httpmw.RequestLogger(log))
    r.Use(chimw.Recoverer)

    healthController := handler.NewHealthController()
    r.Get("/healthz", healthController.Check)

    userController := handler.NewUserController(userUseCase)
    r.Route("/users", func(r chi.Router) {
        r.Post("/", userController.CreateUser)
        r.Get("/", userController.ListUsers)
        r.Get("/{id}", userController.GetUser)
    })
    return r
}
```

Routes preserve `GET /healthz`, `POST /users/`, `GET /users/`, `GET /users/{id}`. Redirect/slash normalization is not implicit. Before configuring CORS origins/credentials, forwarded-IP trust, or client-provided correlation headers, read [security and operations](security-and-operations.md). Never trust arbitrary `RealIP` forwarding headers.

Use one canonical `RequestID` or `TrID`; it proves neither transaction, tenant, authentication nor idempotency. Registration order matters: logger wraps recovery, which wraps handlers. Framework timeout cannot stop context-ignoring I/O; request budgets and server timeouts are distinct.

### Request-scoped logger and access-log ownership

This fragment belongs in `internal/adapter/in/http/middleware/http_logger.go`, with standard `net/http`, `time`, Chi middleware as `chimw`, and `zerolog` imports. It uses Chi's wrapper rather than a hand-rolled response writer that might drop optional HTTP interfaces.

```go
func RequestLogger(log zerolog.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            requestLog := log.With().Str("request_id", chimw.GetReqID(r.Context())).Logger()
            r = r.WithContext(requestLog.WithContext(r.Context()))
            ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
            started := time.Now()
            defer func() {
                status := ww.Status()
                if status == 0 && r.Context().Err() == nil {
                    status = http.StatusOK
                }
                requestLog.Info().
                    Str("method", r.Method).
                    Int("status", status).
                    Int("bytes", ww.BytesWritten()).
                    Dur("duration", time.Since(started)).
                    Bool("canceled", r.Context().Err() != nil).
                    Msg("http request")
            }()
            next.ServeHTTP(ww, r)
        })
    }
}
```

This deliberately avoids request bodies, authorization headers, query strings, and raw paths that may embed personal identifiers. Add a normalized route template, if needed, through the router's supported route context, not an unbounded user-controlled label. HTTP request logging does not replace business audit records.

**Logging owner:** middleware emits one access record; the owning inbound HTTP/worker/CLI boundary emits one unexpected-failure record. Domain/service/provider/repository/outbound adapters return contextual failures without logging them again. Before introducing exceptions, audit, or other signals, read [security's cross-inbound ownership policy](security-and-operations.md#6-logging-traces-metrics-and-audit-have-different-jobs). Metrics/audits are separate; sensitive audits need their own schema/access/retention/atomicity, not an access-log line.

**Wrong routing/middleware** (invalid contrasts: `emailExists`/`saveUser` stand
for direct persistence helpers; `userService`/`defaultUser` are captured dependencies):

```go
r.Post("/users", func(w http.ResponseWriter, r *http.Request) {
    if emailExists(r.FormValue("email")) {
        http.Error(w, "duplicate", http.StatusConflict)
        return
    }
    saveUser(r.FormValue("name"), r.FormValue("email"))
})

func CreateDefaultUser(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userService.CreateUser(context.Background(), defaultUser)
        next.ServeHTTP(w, r)
    })
}
```


Authentication extraction can be middleware; resource-level permission and domain eligibility still belong to a trusted application policy/use case. A middleware that loads every possible entity, performs writes, or commits generic request-wide transactions obscures those boundaries.

**Review target:** router tests assert route/method selection and middleware order; middleware tests assert context propagation, status observation, optional writer behavior for the features actually used, and absence of secrets in logs. No test should need to create a real user merely to prove CORS registration.

## 7. Persistence: map, execute with context, classify exact failures

### Schema input and generated Ent output are different owners

Handwrite `internal/adapter/out/persistence/postgres/dao/schema/user.go`; generate rows/builders/predicates under `dao/ent`. This schema imports `time`, `entgo.io/ent`, `schema/field`, `schema/index` and declares the named email key and composite list index:

```go
package schema

type User struct { ent.Schema }

func (User) Fields() []ent.Field {
    return []ent.Field{
        field.Int("id"),
        field.String("name").NotEmpty(),
        field.String("email").NotEmpty(),
        field.Time("created_at").Default(time.Now).Immutable(),
    }
}

func (User) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("email").Unique().StorageKey("users_email_key"),
        index.Fields("created_at", "id"),
    }
}
```

`StorageKey` is a migration decision: keep one email-uniqueness declaration and inspect actual constraint names/driver behavior. Schema, generated output, and deployed migration must agree. Never patch generated rows/SQL or destructively synchronize schema at ordinary startup; before schema changes read [data and transactions](data-and-transactions.md).

### Domain/Ent mapper

This shared handwritten `postgres/dao/user_mapper.go` imports `time`, `domain`, generated `ent`; exported helpers serve provider/repository, not core. A single-owner mapper may stay local. Never put mapping in generic `db` or generated output.

```go
package dao

type UserWriteData struct {
    Name      string
    Email     string
    CreatedAt time.Time
}

func ToUserWriteData(u *domain.User) UserWriteData {
    return UserWriteData{Name: u.Name, Email: u.Email, CreatedAt: u.CreatedAt}
}

func ToDomainUser(row *ent.User) *domain.User {
    return &domain.User{
        ID: row.ID, Name: row.Name, Email: row.Email, CreatedAt: row.CreatedAt,
    }
}
```

Exported fields permit direct hydration here. Encapsulated domain needs an explicit rehydration API/error contract, not a creation constructor that invents time/identity or rejects historical state under new rules. Load required associations explicitly; mapping performs no lazy queries or new normalization. The named write-data struct is optional swap protection, not a reason for reflection/universal converters; read [domain](domain.md) before changing reconstruction rules.

### Exact storage error mapping shared by the adapters

Keep this real shared classification helper in `internal/adapter/out/persistence/postgres/dao/user_error.go`. Imports are standard `errors`, generated `ent`, `outport`, and PostgreSQL `github.com/jackc/pgx/v5/pgconn`. This classifier is **pgx-specific**; adapt error inspection to the actual driver instead of adding pgx merely for the snippet. `RepositoryError` is the outbound storage error shape used for both read and write failures.

```go
package dao

func UserStoreError(op string, err error) error {
    kind := outport.ErrStorage
    var pg *pgconn.PgError
    switch {
    case ent.IsNotFound(err):
        kind = outport.ErrUserNotFound
    case errors.As(err, &pg) && pg.Code == "23505" && pg.ConstraintName == "users_email_key":
        kind = outport.ErrEmailTaken
    }
    return &outport.RepositoryError{Op: op, Kind: kind, Cause: err}
}

```

### Write-only repository

Put this fragment in `internal/adapter/out/persistence/postgres/repository/user_repo.go`, importing standard `context`, generated `ent`, `dao`, `domain`, `outport`, and `postgresdb` (the adapter's `db` package). `postgresdb.Client` is defined in [data and transactions](data-and-transactions.md#4-concrete-ent-adaptation):

```go
package repository

type userRepo struct {
    client *ent.Client
}

func NewUserRepository(client *ent.Client) outport.UserRepository {
    return &userRepo{client: client}
}

var _ outport.UserRepository = (*userRepo)(nil)

func (r *userRepo) Insert(ctx context.Context, u *domain.User) (*domain.User, error) {
    client, err := postgresdb.Client(ctx, r.client)
    if err != nil {
        return nil, dao.UserStoreError("insert user", err)
    }
    data := dao.ToUserWriteData(u)
    row, err := client.User.Create().
        SetName(data.Name).
        SetEmail(data.Email).
        SetCreatedAt(data.CreatedAt).
        Save(ctx)
    if err != nil {
        return nil, dao.UserStoreError("insert user", err)
    }
    return dao.ToDomainUser(row), nil
}
```

### Read-only provider

Put this fragment in `internal/adapter/out/persistence/postgres/provider/user_provider.go`, importing standard `context`, generated `ent` and `ent/user`, `dao`, `domain`, `outport`, and the same `postgresdb` resolver:

```go
package provider

type userProvider struct {
    client *ent.Client
}

func NewUserProvider(client *ent.Client) outport.UserProvider {
    return &userProvider{client: client}
}

var _ outport.UserProvider = (*userProvider)(nil)

func (p *userProvider) FindByID(ctx context.Context, id int) (*domain.User, error) {
    client, err := postgresdb.Client(ctx, p.client)
    if err != nil {
        return nil, dao.UserStoreError("find user", err)
    }
    row, err := client.User.Query().Where(user.IDEQ(id)).Only(ctx)
    if err != nil {
        return nil, dao.UserStoreError("find user", err)
    }
    return dao.ToDomainUser(row), nil
}

func (p *userProvider) List(ctx context.Context, offset, limit int) (domain.Users, error) {
    client, err := postgresdb.Client(ctx, p.client)
    if err != nil {
        return nil, dao.UserStoreError("list users", err)
    }
    rows, err := client.User.Query().
        Order(ent.Asc(user.FieldCreatedAt), ent.Asc(user.FieldID)).
        Offset(offset).Limit(limit).All(ctx)
    if err != nil {
        return nil, dao.UserStoreError("list users", err)
    }
    users := make(domain.Users, len(rows))
    for i, row := range rows {
        users[i] = dao.ToDomainUser(row)
    }
    return users, nil
}
```

`Insert` persists a valid `NewUser(0, ...)` candidate and returns generated identity. Updates need their own accepted affected-row/version semantics; do not conditionally update inside `Insert`.

Only pgx SQLSTATE `23505` on `users_email_key` means email conflict here—not every Ent constraint error. Other keys/FKs/check/null failures retain generic category and cause. Exercise actual PostgreSQL/Ent/driver names/wrapping, not invented error strings.

Pass `ctx` to every terminal Ent call; no stored context, `Background`, or panic-on-error `SaveX`/`AllX`. Providers read and repositories write directly through generated Ent, without forwarding through each other/another DAO.

Before atomic multi-adapter work, read [data and transactions](data-and-transactions.md): existing injected adapters resolve `txCtx` per call to `tx.Client()`, base only when scope is absent; invalid/expired/foreign scopes fail closed. `db` owns lifecycle/binding, workflow owns owner/tenant checks/locks. No field swaps, repository bundles, owner-policy-specific runners, outer-context or captured-root I/O.

**Wrong persistence** (independent invalid contrasts; `err`/`rows` are query results
and `dto` is the HTTP package that persistence must not import):

```go
func (p *userProvider) FindByID(id int) (*ent.User, error) {
    return p.client.User.Get(context.Background(), id)
}

if ent.IsConstraintError(err) {
    return outport.ErrEmailTaken
}

return dto.UserListResponse{Total: len(rows)}
```


**Review target:** integration tests against the chosen PostgreSQL/Ent/driver exercise inserted IDs, round-trip timestamps, absent rows, zero-row lists, stable ordering for equal timestamps, cancellation/deadlines, the actual email unique key under concurrent inserts, and an unrelated constraint failure that must not map to email conflict. Tests that need transaction semantics must prove rollback and root-versus-transaction client binding.

## 8. List pagination is an end-to-end contract

The use case and provider above already implement default/max bounds, one-row lookahead, deterministic ordering, and truthful `has_more`. Complete the HTTP side in `handler/user.go`; imports are standard `net/http`/`strconv` and `dto`/`inport`.

```go
func pagination(r *http.Request) (inport.ListUsersQuery, error) {
    values := r.URL.Query()
    q := inport.ListUsersQuery{}
    for _, field := range []struct {
        name string
        dst  *int
    }{{"offset", &q.Offset}, {"limit", &q.Limit}} {
        raw, exists := values[field.name]
        if !exists {
            continue
        }
        if len(raw) != 1 || raw[0] == "" {
            return inport.ListUsersQuery{}, &requestError{
                http.StatusBadRequest, "invalid_pagination", "invalid pagination",
            }
        }
        n, err := strconv.Atoi(raw[0])
        if err != nil {
            return inport.ListUsersQuery{}, &requestError{
                http.StatusBadRequest, "invalid_pagination", "invalid pagination",
            }
        }
        *field.dst = n
    }
    return q, nil
}

func (c *UserController) ListUsers(w http.ResponseWriter, r *http.Request) {
    q, err := pagination(r)
    if err != nil {
        c.fail(w, r, err)
        return
    }
    page, err := c.userUseCase.ListUsers(r.Context(), q)
    if err != nil {
        c.fail(w, r, err)
        return
    }
    c.respond(w, r, http.StatusOK, dto.ToUserListResponse(page))
}
```

Parsing rejects repeated/empty/noninteger/overflow values; application owns ranges/defaults for every caller. Zero limit means default here; making explicit `limit=0` invalid requires preserving supplied-versus-omitted intent and recording that policy.

With limit 2, fetch at most 3: three rows produce two with `has_more=true`; two produce `false`, never `total=2`. A real total needs provider count and a decision about list/count snapshot consistency.

Unique tie-breakers stabilize one dataset, not successive offset pages under concurrent changes. When workload/semantics require keyset pagination, use an opaque validated full-ordering-tuple cursor and matching predicate/index; preserve published API compatibility. Before changing this contract read [data and transactions](data-and-transactions.md) and [testing and evolution](testing-and-evolution.md).

**Review target:** missing/default/negative/oversized/repeated/overflow input, empty/exact/lookahead pages, tied timestamps, documented concurrent-change behavior. Never pass arbitrary sort to SQL, treat `-1` as unlimited, or label page length `total`.

## 9. Config, database construction, shared packages, composition

### Configuration owns process input

**Required baseline.** Keep config loading/validation in `internal/config/config.go`. This complete small parsing example uses standard `fmt`, `strconv`, and `time`; its loader receives a lookup function so a unit test need not mutate global environment. The `Database` type is also used by the next fragment.

```go
package config

type Database struct {
    DSN            string
    MaxOpen        int
    MaxIdle        int
    MaxLifetime    time.Duration
    ConnectTimeout time.Duration
}

func LoadDatabase(lookup func(string) (string, bool)) (Database, error) {
    dsn, ok := lookup("DATABASE_URL")
    if !ok || dsn == "" {
        return Database{}, fmt.Errorf("DATABASE_URL is required")
    }
    maxOpen := 20
    if raw, ok := lookup("DB_MAX_OPEN"); ok {
        n, err := strconv.Atoi(raw)
        if err != nil || n < 1 || n > 1000 {
            return Database{}, fmt.Errorf("DB_MAX_OPEN must be between 1 and 1000")
        }
        maxOpen = n
    }
    maxIdle := 5
    if maxIdle > maxOpen {
        maxIdle = maxOpen
    }
    return Database{
        DSN: dsn, MaxOpen: maxOpen, MaxIdle: maxIdle,
        MaxLifetime: 30 * time.Minute, ConnectTimeout: 5 * time.Second,
    }, nil
}
```

Pool/time values are example decisions. Preserve environment names, secret sourcing, HTTP budgets, and validation conventions; report no DSN/rejected secrets. Validate once before traffic—not in requests, repositories, or domain—and fail on parsing errors.

### Database resources are adapter infrastructure

Put client creation in `internal/adapter/out/persistence/postgres/db/client.go` (`package db`). This fragment uses standard `context`, `database/sql`, `errors`, `fmt`, Ent's `dialect` and `dialect/sql` as `entsql`, generated `ent`, and `config`. Register pgx's SQL driver once through a side-effect import in `cmd/api/main.go` (or the project's existing driver-registration owner), not in domain or service. Keep pool/client lifecycle and generic transaction mechanics here, never business SQL, domain mapping, or imports of provider/repository.

```go
func NewEntClient(ctx context.Context, cfg config.Database) (*ent.Client, error) {
    db, err := sql.Open("pgx", cfg.DSN)
    if err != nil {
        return nil, fmt.Errorf("open database driver: %w", err)
    }
    db.SetMaxOpenConns(cfg.MaxOpen)
    db.SetMaxIdleConns(cfg.MaxIdle)
    db.SetConnMaxLifetime(cfg.MaxLifetime)
    pingCtx, cancel := context.WithTimeout(ctx, cfg.ConnectTimeout)
    defer cancel()
    if err := db.PingContext(pingCtx); err != nil {
        closeErr := db.Close()
        if closeErr != nil {
            return nil, errors.Join(
                fmt.Errorf("ping database: %w", err),
                fmt.Errorf("close database: %w", closeErr),
            )
        }
        return nil, fmt.Errorf("ping database: %w", err)
    }
    driver := entsql.OpenDB(dialect.Postgres, db)
    return ent.NewClient(ent.Driver(driver)), nil
}
```

Success transfers driver/database-close ownership to the Ent client; failed ping closes what was opened and retains primary+cleanup errors. For older toolchains use the existing cause-preserving equivalent to `errors.Join`. `sql.Open` alone proves no connectivity. Do not close the shared client per operation or log raw connection errors; before production lifecycle work read [security and operations](security-and-operations.md) for redaction and stop-work-before-persistence-close ordering.

### `pkg` is not a business backdoor

Retain cohesive `internal/pkg/{constants,errors,logger,utils}` mechanics, not another service layer:

- Shared stable constants only; user policy stays domain-owned, HTTP symbols must not pull transport into core.
- One cause-retaining error mechanism; domain/port categories may remain with their owners.
- Logger construction/typed context integration, not per-transition domain logging or a global repository registry.
- Reused helpers only: no `utils.ExecuteUseCase(any)`, SQL/DTO mapping, or central validation bag. Mechanical email normalization does not transfer ownership of identity policy out of domain.

### Composition selects all concrete adapters

`cmd/api/main.go` knows concrete adapter and use-case constructors for ordinary wiring. This fragment is inside a startup function whose `startupCtx`, validated `cfg`, and root `log` are already in scope. Standard imports include `fmt`/`time`; `db`, `provider`, and `repository` import matching `internal/adapter/out/persistence/postgres/` packages; `user` imports `internal/core/service/usecase/user`; `httpadapter` aliases the HTTP adapter.

```go
client, err := db.NewEntClient(startupCtx, cfg.Database)
if err != nil {
    return fmt.Errorf("initialize persistence: %w", err)
}
defer func() {
    if err := client.Close(); err != nil {
        log.Error().Err(err).Msg("close persistence")
    }
}()

userProvider := provider.NewUserProvider(client)
userRepo := repository.NewUserRepository(client)
userUseCase := user.NewUseCase(userProvider, userRepo, time.Now)
router := httpadapter.NewRouter(userUseCase, log)
```

Complete `http.Server`, readiness, startup failure propagation, and bounded shutdown using [security and operations](security-and-operations.md). This is wiring, not a full `main`: no child-goroutine `log.Fatal` that bypasses defers. Review invalid config, driver registration, bounded ping, failed-creation cleanup, and directly constructible test dependencies; reuse existing lifecycle conventions rather than adding another loader/container.

## 10. Named types and interface placement without ceremony

**Optional, valuable when IDs can be confused.** The example's `User.ID` is `int`. A project with both user and tenant IDs might deliberately adopt named domain types:

```go
// Scoped alternative in core/domain; not an alias for the source's existing fields.
type UserID int
type TenantID int

func NewUserID(value int) (UserID, error) {
    if value <= 0 {
        return 0, ErrInvalidUser
    }
    return UserID(value), nil
}
```

A named type is not an alias: `type UserID = int` does not prevent accidentally passing a tenant ID. Update the actual domain fields, commands, port signatures, DTO mappers, persistence conversions, mocks, and tests together if adopting this change. `strconv.Atoi` remains HTTP parsing; `domain.NewUserID` validates the application/domain representation; `int(id)` belongs at the storage boundary when Ent still uses integers. Do not maintain a parallel int-based API indefinitely as a convenience shim.

**Wrong:** a function with six positional `int` IDs that repeatedly swaps tenant and user, or adding wrappers to every string solely because named types look architectural. A type should encode useful meaning/invariants, not add conversion work without preventing mistakes. See [domain](domain.md).

For boundary placement follow [architecture](architecture.md#2-the-canonical-tree); put compile-time interface assertions beside implementations. Domain may own abstractions its rules need, but never import repository ports to query invariants.

Private adapter helper interfaces are fine for genuine builder reuse, not a universal exported `BaseRepository[T]`. Express `ReserveInventory` rather than generic `Save(any)`/unrestricted update maps/casts. Consumer-owned core ports do not require interfaces for constructors, mappers, loggers, or configuration.

## 11. The vertical slice as a reviewable change

Trace the concrete create path in §§1–7: route → bounded DTO decode → `command.CreateUserCommand` → inbound port → `domain.NewUser` → repository → DAO write mapping → `Save(ctx)`/migrated unique key → DAO domain mapping → response allowlist/Location/status. [Architecture](architecture.md#4-exact-responsibility-and-file-decisions) owns placement; use each section's review target for changed boundaries rather than duplicating that checklist.

Domain results suffice here. Richer reads may use an application-owned projection/outbound query capability, never Ent or HTTP DTOs in core or a new copy at every call. Trivial mappers need no interface/manager/facade.

Before claiming guarantees beyond this slice, read the applicable owner: [testing](testing-and-evolution.md) for executable evidence, [domain](domain.md) for invariants/identity, [data](data-and-transactions.md) for atomicity/concurrency, [reliability](reliability-and-events.md) for delivery/retry, [security](security-and-operations.md) for trust/resource/logging/lifecycle. Public CRUD proves none of protected-data, transaction, reliable-event, or idempotency guarantees by itself.
