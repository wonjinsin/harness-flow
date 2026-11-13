# Go layers: implementation and review examples

Use this chapter with the [canonical tree and dependency contract](architecture.md). The examples show a complete create/get/list vertical slice at the important boundaries, with scoped fragments rather than a single compilable file. Replace `example.com/app` with the target module; retain that project's compatible dependency versions. Fragments sharing a file/package are meant to be combined; imports are described where useful rather than repeated around every method. The [runnable example](../../examples/go) is a separate standard-library HTTP/SQLite adaptation, not an Ent implementation of these fragments.

**Default profile:** use Chi, Ent, PostgreSQL, Zerolog; inbound ports remain in `internal/core/port/in`, outbound ports in `internal/core/port/out`. Use import aliases `inport`, `outport`, and `httpadapter` where package names would be ambiguous. The example HTTP object is `UserController`; “handler” and “controller” below are one responsibility, not two layers.

**Portable principles:** separate transport, application, domain, and persistence representations; carry the operation context through I/O; express contracts through application-owned types; enforce domain rules for every caller; and compose concrete dependencies only at the process boundary. The commands, errors, context signatures, and pagination below illustrate these contracts; adopting them requires migrating existing implementations and callers together.

**Readability baseline:** follow [behavior ownership](behavior-ownership.md).
Each orchestration method should read naturally from top to bottom at one level
of abstraction. Domain owns composed decisions and collection calculations;
application inputs/results and adapter-local DTO/DAO mappers own their respective
validation and conversion details. Keep I/O, errors, and transactions visible.

## 1. Start with the application contracts, not a JSON or database struct

### Inbound port and application data

**Required baseline.** Put the following boundary in `internal/core/port/in/usecase.go`. Commands express intent; queries express selection; results express application outcomes. They are not DTOs just because they contain fields. The import set is standard `context`/`errors` and `internal/core/domain`.

```go
package in

type CreateUserCommand struct {
    Name  string
    Email string
}

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

type UserService interface {
    CreateUser(context.Context, CreateUserCommand) (*domain.User, error)
    GetUser(context.Context, int) (*domain.User, error)
    ListUsers(context.Context, ListUsersQuery) (UserPage, error)
}
```

This contract does not know that creation arrived through `POST`, that pagination came from a query string, or that users are stored with Ent. A worker can construct a command without a fake HTTP request. Do not put `json` tags, an `http.ResponseWriter`, a Chi context, a database ID allocation object, or an ORM entity in it. A command does not need a wrapper for every scalar operation: `GetUser(ctx, id int)` is reasonable when there is only one input and no meaningful ambiguity.

`ListUsersQuery.Normalize` owns the accepted bounds/defaults for every caller.
`NewUserPage` consumes a normalized query and the bounded lookahead result; it
owns trimming and `HasMore` without copying the user collection. These are
application query/result behaviors, not JSON conversion or domain identity rules.

**Needs project decision.** Protected use cases need a trusted actor/tenant representation and authorization semantics; this public CRUD illustration does not implement an identity system. Do not let a `TenantID` in an untrusted JSON body stand in for authenticated scope. See [security and operations](security-and-operations.md).

**Optional.** Split the inbound interface into `UserCreator`, `UserReader`, or other narrow capability interfaces when callers genuinely need different subsets. A controller that uses all three operations can depend on the small `UserService` above. Do not split mechanically into dozens of interfaces or introduce `ApplicationFacade`/`UserManager` that only forwards every method.

### Outbound port: express what the service needs

Place this fragment in `internal/core/port/out/repository.go`, importing `context`, `errors`, and `domain`. If an existing repository has `Save`, `FindByID`, `FindByEmail`, and `List` without contexts, adopting the explicit insert behavior and context-aware methods below requires migrating its implementations, mocks, and callers together.

```go
package out

var (
    ErrUserNotFound = errors.New("user not found")
    ErrEmailTaken   = errors.New("email already registered")
    ErrStorage     = errors.New("storage operation failed")
)

type UserRepository interface {
    Insert(context.Context, *domain.User) (*domain.User, error)
    FindByID(context.Context, int) (*domain.User, error)
    List(ctx context.Context, offset, limit int) (domain.Users, error)
}
```

The insert contract returns a persisted domain value, including the generated ID. It does not silently decide to update when an input happens to carry a nonzero ID. `FindByID` returns `ErrUserNotFound` when absent, not `(nil, nil)`. `List` returns an empty collection without error when there are no matches and applies a stable `(created_at, id)` ascending order. The service may request one extra row for `has_more`; the bounded public limit remains application-owned.

For this example, keep error category and retained diagnostic cause separate. In the same outbound port package:

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

All construction sites below supply a non-nil known `Kind` and cause. `errors.Is(err, outport.ErrEmailTaken)` remains true through a service's `%w` wrap; `Unwrap` retains the original cause for cancellation and diagnostics. The error string intentionally excludes raw SQL/driver detail, which may contain user data. Core consumers branch on the port's categories, never on driver error types. A richer shared error implementation can live in the existing `internal/pkg/errors` when the project needs one; do not add this example as a second error system alongside an already correct one. [Domain](domain.md) and [data and transactions](data-and-transactions.md) cover larger error/concurrency contracts.

The reason to preserve causes is not to make a PostgreSQL error part of the public contract. Only the declared categories are portable promises; changing persistence must not require a handler to inspect a PostgreSQL constraint name.

**Plausible violations:**

```go
// Wrong: both ports depend on adapter types and storage mechanics.
type UserService interface {
    CreateUser(context.Context, dto.CreateUserRequest) (*ent.User, error)
}
type UserRepository interface {
    Query() *ent.UserQuery
    Begin(context.Context) (*ent.Tx, error)
}
```

These signatures make it impossible to change HTTP or storage without changing core. A transaction capability is valid when needed, but its callback/contracts must stay framework-neutral; see the complete design in [data and transactions](data-and-transactions.md).

**Review target:** a service test can invoke the inbound contract and fake the outbound contract without importing HTTP, Ent, or PostgreSQL. Interface checks should describe real substitutability, not merely mirror a concrete adapter.

## 2. Domain: valid business state without delivery or storage

**Required baseline.** `internal/core/domain/user.go` owns user invariants. The default example uses an exported `User` with `ID int`, `Name`/`Email string`, `CreatedAt time.Time`, `Users []*User`, and a validating/normalizing `NewUser`. Preserve that understanding; do not assume it has private state or named IDs already.

The following is a scoped example with standard-library imports `errors`, `net/mail`, `strings`, `time`, and `unicode/utf8`. It adopts explicit example policies: at most 100 name runes, a single mailbox address without a display name, trimming input, and lowercasing the entire email. **Needs project decision:** email equivalence and internationalization are business rules; lowercasing the local part is not a universal Internet rule. Match normalization, lookup, and the unique database key to the accepted policy.

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

The application supplies time; the domain does not read environment variables, open connections, or depend on a global logger. A non-HTTP caller receives the same invariant protection. HTTP format validation may give better feedback, but it cannot be the sole enforcement point.

Exported fields are a deliberate simplicity trade-off: a caller can still mutate them after construction. **Required when lifecycle transitions/invariants become complex:** move transitions behind methods/private state and provide explicit rehydration/accessors as appropriate, rather than duplicating validation in every service. Do not add a full aggregate/event framework to a small record solely because a comment calls `User` an aggregate root. See [domain modeling](domain.md) for identity, value objects, aggregates, and concurrency.

**Wrong:**

```go
// Wrong: a domain method is now coupled to transport and storage.
func CreateUser(r *http.Request, client *ent.Client) error {
    return client.User.Create().SetName(r.FormValue("name")).Exec(r.Context())
}

// Wrong: construction succeeds even when the only invariant lives in a handler.
u := &domain.User{Name: req.Name, Email: req.Email}
```

The first combines three owners. The second bypasses the constructor and assumes every future caller will repeat HTTP validation.

**Review target:** domain tests cover empty/long names, accepted normalization, malformed addresses, and time/ID assumptions without booting a server or database. Check that changing the accepted normalization rule includes a data migration/conflict decision rather than silently changing identity semantics.

## 3. Application service: coordinate, do not translate protocols

Place this fragment in `internal/core/service/user_service.go`, importing standard `context`, `fmt`, `time`, `domain`, and the aliased ports. It implements the inbound contract above. The example constructor returns an inbound interface; returning a concrete implementation is also valid Go when the project's existing convention prefers it. The architectural requirement is that the caller depends on the boundary it needs.

```go
package service

type userService struct {
    repo outport.UserRepository
    now  func() time.Time
}

func NewUserService(repo outport.UserRepository, now func() time.Time) inport.UserService {
    return &userService{repo: repo, now: now}
}

var _ inport.UserService = (*userService)(nil)

func (s *userService) CreateUser(ctx context.Context, cmd inport.CreateUserCommand) (*domain.User, error) {
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    u, err := domain.NewUser(0, cmd.Name, cmd.Email, s.now())
    if err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    created, err := s.repo.Insert(ctx, u)
    if err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    return created, nil
}

func (s *userService) GetUser(ctx context.Context, id int) (*domain.User, error) {
    if id <= 0 {
        return nil, inport.ErrInvalidInput
    }
    u, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get user: %w", err)
    }
    return u, nil
}

func (s *userService) ListUsers(ctx context.Context, q inport.ListUsersQuery) (inport.UserPage, error) {
    q, err := q.Normalize()
    if err != nil {
        return inport.UserPage{}, err
    }
    users, err := s.repo.List(ctx, q.Offset, q.Limit+1)
    if err != nil {
        return inport.UserPage{}, fmt.Errorf("list users: %w", err)
    }
    return inport.NewUserPage(users, q), nil
}
```

This is a single-write create use case. It needs the database's atomic insert/unique constraint, not a ceremonial application transaction around one insert. A prior `FindByEmail` can improve a user-facing path but cannot prove absence under concurrency and may compare an unnormalized address. The example omits it deliberately and classifies the actual unique violation.

`now` is a small injectable function, not a clock service framework. Composition supplies `time.Now`; a test can supply a fixed function. Constructors assume composition supplies valid non-nil dependencies; validate dependency wiring according to the project's startup convention, not by adding silent fallback repositories or clocks.

The list policy chooses default 50, maximum 100, and maximum offset 100000. These numbers are **project decisions**, not universal limits. The service invokes the query's normalization so worker/CLI callers receive the same checks; the result owns page shaping. HTTP parsing alone is insufficient. The repository returns at most the requested bounded count, including one lookahead row.

**Required when the use case is protected:** orchestrate authorization before exposing or mutating data, using an explicit policy and trusted scope. **Required when two writes share an invariant:** use the transaction contract from [data and transactions](data-and-transactions.md). **Required when publishing must survive crashes:** use the durable delivery contract from [reliability and events](reliability-and-events.md). Do not append `go publishEvent(...)` to this service and claim reliability.

**Wrong:**

```go
func (s *userService) CreateUser(_ context.Context, req dto.CreateUserRequest) (*ent.User, error) {
    // Wrong: drops cancellation, bypasses domain, and selects infrastructure.
    client := persistence.GlobalClient()
    return client.User.Create().SetName(req.Name).SetEmail(req.Email).
        Save(context.Background())
}
```

A subtler wrong version decodes correctly but checks `err.Error() == "duplicate email"`, sets an HTTP status inside the service, or logs every returned error before the handler logs it again. These are also boundary violations.

**Review target:** test query normalization and result shaping directly for invalid bounds, defaults, empty/exact/overfull pages, and no loss of returned users. Service checks use a small repository double and fixed time for rejected writes, normalized stored state, retained error categories and orchestration failures. Do not retest every pure rule through service mocks. See [testing and evolution](testing-and-evolution.md) for transaction/cancellation and real-adapter evidence.

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

Keep `ErrorResult` in the existing `dto/response.go`. **Default wire style:** responses use `utils.StandardResponse` from `internal/pkg/utils/http.go`: `trid` is a string, `code` is a four-digit string, and `result` is omitted when empty. Creation returns code `"0201"`; ordinary success uses `"0200"`; the baseline error codes are `"0400"`, `"0404"`, `"0409"`, and `"0500"`. An error result is `{"msg": safeMessage}`, never a raw internal error string. The controller below preserves that envelope rather than adopting a different problem-details or bare-response default. Reuse a target project's established helper; do not create a second envelope authority. Moving an existing transport helper out of `utils` can be a deliberate cleanup, but is not a prerequisite or a silent layout change. Exposing `Email` is also an explicit API/data-access decision; an authenticated list may need a narrower representation.

Put conversion in the **HTTP** mapper `internal/adapter/in/http/dto/user_mapper.go`, importing `domain` and `inport`:

```go
func (r CreateUserRequest) ToCommand() inport.CreateUserCommand {
    return inport.CreateUserCommand{Name: r.Name, Email: r.Email}
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

The application/repository contracts promise non-nil users on success and non-nil elements in a result list. If an implementation violates that, correct the implementation; do not turn an impossible nil row into a fake zero user. The list mapper allocates one response slice, pre-sized to the result. That boundary allocation is intentional; avoid reflection, repeated appends without a reason, and a JSON round-trip merely to copy fields. An empty list becomes `[]`, not `null`, under this chosen wire contract.

A mapper is an allowlist. The request cannot set `ID`, `CreatedAt`, a role, or internal state because those fields are not mapped. The response will not accidentally expose a later-added domain field, an ORM edge, or a password hash. Changes to wire names and response visibility remain local to HTTP rather than changing every caller of the application command.

**Wrong:**

```go
// Wrong: one struct is now a wire contract, ORM object, and business object.
type CreateUserRequest = ent.User

// Wrong: zero-copy convenience couples the public API to future domain fields.
json.NewEncoder(w).Encode(domainUser)

// Wrong: mapping is no longer a pure representation conversion.
func ToCommand(req CreateUserRequest, repo outport.UserRepository) inport.CreateUserCommand {
    repo.Insert(context.Background(), &domain.User{Name: req.Name})
    return inport.CreateUserCommand{Name: req.Name, Email: req.Email}
}
```

**Review target:** DTO tests assert public field names, empty-list behavior, and the absence of internal fields. Mapper tests check allowed fields exactly. Application command tests should not require JSON serialization. Partial updates need an explicit omitted/null/value policy rather than using empty strings to mean all three; see [testing and evolution](testing-and-evolution.md) for compatibility cases.

## 5. HTTP controller: bounded decode, use-case call, safe response

**Required baseline.** `internal/adapter/in/http/handler/user.go` owns HTTP parsing/status/headers. The following fragments share one handler package and use standard `context`, `encoding/json`, `errors`, `fmt`, `io`, `mime`, `net/http`, `strconv`, plus Chi, Chi middleware as `chimw`, Zerolog, `dto`, `domain`, `inport`/`outport`, and the existing `utils` envelope type. The constructor needs the inbound port, not the repository. The request logger is installed by middleware in the next section.

```go
type UserController struct {
    svc inport.UserService
}

func NewUserController(svc inport.UserService) *UserController {
    return &UserController{svc: svc}
}

func (c *UserController) CreateUser(w http.ResponseWriter, r *http.Request) {
    req, err := decodeCreateUser(w, r)
    if err != nil {
        c.fail(w, r, err)
        return
    }
    u, err := c.svc.CreateUser(r.Context(), req.ToCommand())
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
    u, err := c.svc.GetUser(r.Context(), id)
    if err != nil {
        c.fail(w, r, err)
        return
    }
    c.respond(w, r, http.StatusOK, dto.ToUserResponse(u))
}
```

### Decode exactly one bounded JSON object

This helper belongs with the HTTP handler or a cohesive HTTP-only helper, not in domain. It implements an example 64 KiB limit, `application/json` media type, unknown-field rejection, rejection of `null`, and rejection of trailing JSON. Exact size and unknown-field compatibility policy are **project decisions**; do not change an established API's tolerance by accident. `DisallowUnknownFields` is not a full JSON schema validator and does not reject duplicate JSON keys; if duplicate-key ambiguity matters for the endpoint, use an explicit validated decoding policy.

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

`bodyError(nil)` is intentional when a second successful decode finds another value: that is still an invalid single-object body. The helper does not return decoder text, field names supplied by the client, or internal validation traces. The server owns ordinary request-body closure; this helper does not defer a second unrelated lifecycle inside domain.

### Classify errors once; serialize once

Keep these fragments in the handler package. The error-to-HTTP mapping is transport-owned; the controller preserves the default four-digit code/envelope and `{"msg": safeMessage}` error result. The project may deliberately choose different status/error semantics, but record any compatibility change without moving status codes into core.

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

The response is marshaled before headers are committed. After `WriteHeader` or a partial write, a write failure cannot be repaired by writing another `500` body. The final log records delivery failure only; it does not retry business work. The fixed encoding-error response preserves the envelope and exposes no data; its `trid` is empty because the failure path uses a fixed safe body, while the request-scoped log still contains correlation. `TrID` middleware is the default correlation style; this chapter's explicit Chi `RequestID` adaptation uses `chimw.GetReqID` to populate the same `trid` field. If retaining `TrID`, use its existing typed context accessor instead. Do not install both independent ID generators.

For an already-canceled request the helper returns without attempting a response. Its access-log status may remain zero, meaning no response was observed, not a real HTTP status; middleware records cancellation explicitly. A database child deadline with a still-live request can map to `504` in this example. An operation timeout does not prove that a write did not commit; retry/idempotency policy is a separate [reliability](reliability-and-events.md) decision.

The example's `RepositoryError.Error()` is sanitized. Do not assume every foreign error passed to `.Err(err)` is safe: raw SQL errors, HTTP client bodies, credentials, and sensitive field values need adapter-level sanitization and a project logging policy. Detailed cause retention does not authorize dumping that chain into logs. See [security and operations](security-and-operations.md).

**Wrong:**

```go
// Wrong: unbounded decode, ignored errors, bypassed use case, raw diagnostic exposure.
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

func NewRouter(users inport.UserService, log zerolog.Logger) *chi.Mux {
    r := chi.NewRouter()
    r.Use(chimw.RequestID)
    r.Use(httpmw.RequestLogger(log))
    r.Use(chimw.Recoverer)

    healthController := handler.NewHealthController()
    r.Get("/healthz", healthController.Check)

    userController := handler.NewUserController(users)
    r.Route("/users", func(r chi.Router) {
        r.Post("/", userController.CreateUser)
        r.Get("/", userController.ListUsers)
        r.Get("/{id}", userController.GetUser)
    })
    return r
}
```

This fragment reuses the health controller and preserves `GET /healthz`, `POST /users/`, `GET /users/`, and `GET /users/{id}`. Slash-normalization or redirect behavior must be explicit rather than assumed. The default middleware concerns also include CORS, `TrID`, and IP handling. **Needs project decision:** CORS origins/credentials and trusted proxy handling. Do not copy a middleware named `RealIP` and trust arbitrary forwarded headers from the Internet; choose behavior appropriate to the deployment. See [security and operations](security-and-operations.md).

`RequestID` in this example is an explicit alternative to `TrID`; choose one canonical correlation mechanism instead of generating two unrelated IDs. A request ID is not a transaction ID, tenant, authentication credential, or idempotency key. If correlation headers are accepted from clients, apply the project's validation/trust policy rather than using them as authorization evidence.

Middleware registration order is significant: the request logger wraps recovery so a recovered response is visible to it, and recovery wraps handlers. A framework timeout alone cannot make uncooperative work stop; service and persistence must propagate/check the context. Request deadline budgets and `http.Server` timeouts are separate operational settings.

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

**Required baseline ownership:** middleware emits one access record; the HTTP error boundary emits one unexpected-failure record; service/repository usually return enriched errors without re-logging the same failure. An adapter may emit its own operation metrics or a meaningful event, but four identical error logs for one failed request are not observability. Domain code does not log successful construction on every invocation.

**Required when security-sensitive actions occur:** audit logging has its own schema, access controls, retention, and sometimes atomicity requirements. It is not merely the middleware's access line. [Security and operations](security-and-operations.md) covers this distinction.

**Wrong:**

```go
r.Post("/users", func(w http.ResponseWriter, r *http.Request) {
    // Wrong: routing owns the repository and business rule.
    if emailExists(r.FormValue("email")) {
        http.Error(w, "duplicate", http.StatusConflict)
        return
    }
    saveUser(r.FormValue("name"), r.FormValue("email"))
})

// Wrong: a cross-cutting transport wrapper starts an application workflow.
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

**Default profile.** Handwrite schema declarations in `internal/adapter/out/persistence/dao/schema/user.go`; generate the client/entities/builders/predicates under `dao/ent`. The example schema has integer ID, nonempty name/email, unique email, immutable creation time, and a creation-time index. Ent generates a storage representation, not the application's domain entity.

This schema fragment gives the example's unique constraint an explicit storage key and a composite list index. It uses `time`, `entgo.io/ent`, and Ent's `schema/field` and `schema/index` packages:

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

Declaring `StorageKey` is an intentional schema/migration decision. There is only one email uniqueness declaration in this example; do not also leave an unrelated field-level unique index and then guess which one failed. Inspect the real migrated constraint/index names and driver behavior when adapting the classifier below. Schema code, generated output, and deployed migration must agree. Do not run destructive schema synchronization as ordinary production startup. See [data and transactions](data-and-transactions.md).

**Wrong:** patching generated `dao/ent/user.go` to add a business method or changing generated SQL but not schema/migrations. The next generation discards that change, and another deployment may have a different database. Generated code must remain reproducible from owned inputs and the project's pinned toolchain.

### Domain/Ent mapper

Keep this mapper in `internal/adapter/out/persistence/user_mapper.go`, not the HTTP DTO folder. It imports `time`, `domain`, and generated `ent`.

```go
type userWriteData struct {
    name      string
    email     string
    createdAt time.Time
}

func toEntUserData(u *domain.User) userWriteData {
    return userWriteData{name: u.Name, email: u.Email, createdAt: u.CreatedAt}
}

func toDomainUser(row *ent.User) *domain.User {
    return &domain.User{
        ID: row.ID, Name: row.Name, Email: row.Email, CreatedAt: row.CreatedAt,
    }
}
```

The example's exported domain fields make rehydration a direct assignment. If domain becomes encapsulated, introduce its explicit rehydration API and handle its error contract; do not call a creation constructor that substitutes `time.Now`, generates new IDs, or rejects valid historical data under newly changed rules. Mapping should not lazily query associations or normalize stored values differently from creation. Load precisely the state needed by the operation in the repository, then map it.

The named write-data struct is optional but useful when several same-typed fields would be easy to swap. For a tiny mapper a direct constructor chain is also acceptable. Neither calls for reflection or a universal entity converter. See [domain](domain.md) for reconstruction and historical invariant changes.

### Context-aware repository and exact error mapping

The following fragments share `internal/adapter/out/persistence/user_repo.go`. Imports include standard `context`, `errors`, generated `ent`, generated `ent/user`, `domain`, `outport`, and PostgreSQL `github.com/jackc/pgx/v5/pgconn`. This classifier is **pgx-specific**, consistent with a pgx-backed PostgreSQL deployment; if the actual target uses another driver, adapt the error inspection instead of adding pgx only for this snippet.

```go
type userRepo struct {
    client *ent.Client
}

func NewUserRepository(client *ent.Client) outport.UserRepository {
    return &userRepo{client: client}
}

var _ outport.UserRepository = (*userRepo)(nil)

func userStoreError(op string, err error) error {
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

func (r *userRepo) Insert(ctx context.Context, u *domain.User) (*domain.User, error) {
    data := toEntUserData(u)
    row, err := r.client.User.Create().
        SetName(data.name).
        SetEmail(data.email).
        SetCreatedAt(data.createdAt).
        Save(ctx)
    if err != nil {
        return nil, userStoreError("insert user", err)
    }
    return toDomainUser(row), nil
}

func (r *userRepo) FindByID(ctx context.Context, id int) (*domain.User, error) {
    row, err := r.client.User.Query().Where(user.IDEQ(id)).Only(ctx)
    if err != nil {
        return nil, userStoreError("find user", err)
    }
    return toDomainUser(row), nil
}

func (r *userRepo) List(ctx context.Context, offset, limit int) (domain.Users, error) {
    rows, err := r.client.User.Query().
        Order(ent.Asc(user.FieldCreatedAt), ent.Asc(user.FieldID)).
        Offset(offset).Limit(limit).All(ctx)
    if err != nil {
        return nil, userStoreError("list users", err)
    }
    users := make(domain.Users, len(rows))
    for i, row := range rows {
        users[i] = toDomainUser(row)
    }
    return users, nil
}
```

The application supplies valid insert candidates from `domain.NewUser(0, ...)`; the adapter never treats an input ID as a request to update. It returns generated database identity explicitly. An update operation needs its own accepted semantics, including affected-row/version checks when lost updates matter; do not bolt a conditional update onto `Insert`.

A broad `ent.IsConstraintError(err)` does **not** prove duplicate email. The failure could be another unique key, a foreign key, a check constraint, or a nullability problem. In this example only SQLSTATE `23505` on the explicitly named email key maps to `ErrEmailTaken`. All other failures retain a generic storage category and the original cause. Driver wrapping behavior and actual constraint names must be exercised against the real PostgreSQL/Ent stack; unit-testing an invented error string is not sufficient evidence.

Pass `ctx` to every Ent terminal operation. Do not store context on `userRepo`, replace it with `Background`, or use panic-on-error helpers such as `SaveX`/`AllX` for ordinary request failure handling. An in-process service deadline is useful only if the database call receives it.

**Required when a use case needs an atomic multi-repository write:** repository instances inside the callback must use `tx.Client()` or the equivalent transaction-bound driver, not this root client. Do not merely accept a transaction context while continuing to query `r.client`. See [data and transactions](data-and-transactions.md) for the full transaction implementation and failure handling.

**Wrong:**

```go
func (r *userRepo) FindByID(id int) (*ent.User, error) {
    // Wrong: hides cancellation and leaks the storage representation.
    return r.client.User.Get(context.Background(), id)
}

if ent.IsConstraintError(err) {
    return outport.ErrEmailTaken // Wrong: conflates unrelated failures and drops cause.
}

// Wrong: current page length is not the number of matching rows in the database.
return dto.UserListResponse{Total: len(rows)}
```

**Review target:** integration tests against the chosen PostgreSQL/Ent/driver exercise inserted IDs, round-trip timestamps, absent rows, zero-row lists, stable ordering for equal timestamps, cancellation/deadlines, the actual email unique key under concurrent inserts, and an unrelated constraint failure that must not map to email conflict. Tests that need transaction semantics must prove rollback and root-versus-transaction client binding.

## 8. List pagination is an end-to-end contract

The service and repository above already implement default/max bounds, one-row lookahead, deterministic ordering, and truthful `has_more`. Complete the HTTP side in `handler/user.go`; imports are standard `net/http`/`strconv` and `dto`/`inport`.

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
    page, err := c.svc.ListUsers(r.Context(), q)
    if err != nil {
        c.fail(w, r, err)
        return
    }
    c.respond(w, r, http.StatusOK, dto.ToUserListResponse(page))
}
```

This query parser rejects repeated pagination keys, empty values, non-integers, and integer overflow rather than quietly treating them as zero. Numerical range/default policy remains in the application, protecting non-HTTP callers. Zero `limit` deliberately means default in this example; if public `limit=0` should instead be invalid, distinguish omitted and supplied values in the HTTP mapping and record the chosen application semantics.

A request with `limit=2` may fetch three rows. If it gets three, the application returns the first two with `has_more=true`; if it gets two, `has_more=false`. It does not call two rows a total of two. If the API needs `total`, add a repository count capability and define whether list/count must share a snapshot. A separate count on a live database may disagree under concurrency; this is a consistency decision, not a mapper bug.

Offset pages can skip or repeat records when earlier rows change between requests. The tie-breaker makes ordering deterministic for a given dataset, not snapshot-consistent across requests. **Required when workload or semantics demand it:** adopt keyset pagination with an opaque validated cursor encoding the full ordering tuple, a matching predicate/index, and a compatibility policy. Do not silently switch a published API from offset to cursor. [Data and transactions](data-and-transactions.md) and [testing and evolution](testing-and-evolution.md) cover the relevant query and compatibility concerns.

**Wrong:** accepting arbitrary `sort` and passing it straight to SQL; returning all rows because a client supplied `limit=-1`; ordering only by nonunique `created_at`; or constructing `Total: len(page.Users)` in a mapper. All can appear reasonable in a successful single-page test and still violate the contract.

**Review target:** missing/default/negative/oversized/repeated/overflow values, empty pages, exactly-full pages, lookahead pages, equal timestamps, and concurrent changes under the documented pagination consistency model.

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

The pool/time values are example project decisions, not universal capacity recommendations. A complete project config should preserve its existing environment names, secret sourcing, HTTP budgets, and validation conventions. Never include the DSN or rejected secret value in validation messages. Validate configuration once before accepting traffic, not separately in every repository method.

**Wrong:** `os.Getenv("DATABASE_URL")` in `core/domain`, parsing pool size in every request, ignoring parsing errors, or embedding a production password in a shared constant.

### Database resources are adapter infrastructure

Put client creation in `internal/adapter/out/persistence/db.go`. This fragment uses standard `context`, `database/sql`, `errors`, `fmt`, Ent's `dialect` and `dialect/sql` as `entsql`, generated `ent`, and `config`. Register pgx's SQL driver once through a side-effect import in `cmd/api/main.go` (or the project's existing driver-registration owner), not in domain or service.

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

After successful construction the returned Ent client owns the underlying driver/database close. On failure this function closes what it opened and preserves both primary and cleanup errors. This example uses `errors.Join`; an older target toolchain needs its existing equivalent cause-preserving mechanism, not a silent loss of the ping failure. Do not log raw connection errors without the project's redaction policy. The production shutdown sequence must stop serving/working before closing persistence; see [security and operations](security-and-operations.md).

**Wrong:** treating `sql.Open` as proof of connectivity, leaking `db` after a failed ping, running schema mutation on every request, or closing the shared client at the end of a repository operation.

### `pkg` is not a business backdoor

Keep the existing `internal/pkg/{constants,errors,logger,utils}` organization, but require cohesion:

- `constants` may hold genuinely shared stable symbols. A user name limit belongs with user policy when it is not shared infrastructure; an HTTP header constant must not drag `net/http` into domain.
- `errors` may hold the project's single error mechanism, with proper wrapping/category semantics. Business-specific error categories can remain with domain or the owning port. Avoid a second custom error framework.
- `logger` can construct the Zerolog logger and expose typed context integration. Domain does not depend on it to log every transition.
- `utils` is not a destination for `CreateUser`, SQL builders, DTO mapping, or all validation. Keep HTTP helpers transport-local and domain helpers domain-local. Extract only genuinely reused, cohesive mechanics.

For example, a small normalization helper is mechanically simple, but the **choice** to lowercase email is domain policy; its placement must not make an HTTP-only helper the hidden owner of identity semantics.

**Wrong:** `utils.ExecuteUseCase(any)`, a `constants` package importing persistence, or a global `logger.UserRepository` registered at startup. Broad shared packages can conceal exactly the coupling the visible layers were intended to prevent.

### Composition selects all concrete adapters

`cmd/api/main.go` is the only place that should need to know both the concrete repository and service constructors for ordinary wiring. This fragment is inside a startup function whose `startupCtx`, validated `cfg`, and root `log` are already in scope. Standard imports include `fmt`/`time`; `httpadapter` aliases the HTTP adapter.

```go
client, err := persistence.NewEntClient(startupCtx, cfg.Database)
if err != nil {
    return fmt.Errorf("initialize persistence: %w", err)
}
defer func() {
    if err := client.Close(); err != nil {
        log.Error().Err(err).Msg("close persistence")
    }
}()

users := service.NewUserService(persistence.NewUserRepository(client), time.Now)
router := httpadapter.NewRouter(users, log)
```

Then compose the actual `http.Server`, startup failure propagation, readiness, and bounded graceful shutdown using the project's operational chapter. This fragment deliberately is not a fake complete `main`; it demonstrates the ownership of construction and cleanup without hiding lifecycle work in a handler. Do not call `log.Fatal` inside a child goroutine and assume deferred cleanup will run: process exit bypasses normal defers. [Security and operations](security-and-operations.md) owns the full lifecycle guidance.

**Review target:** invalid configuration fails before requests; driver registration is present; startup ping is bounded; resource creation failures clean up; no global service locator is needed; domain/service tests can instantiate their dependencies directly. Use existing lifecycle/error conventions rather than adding a second container or configuration loader solely to match the example.

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

**Required baseline interface placement:** keep application boundary interfaces in the canonical core port directories. Implementations are structs in adapters or service. Put compile-time assertions beside implementations, as shown above. The domain may define a meaningful behavior abstraction if its own rules need it; it must not import a repository simply to query its own invariants.

A persistence implementation may have private helper interfaces when several query builders genuinely share behavior. Those are not new application ports and should not be exported as a universal `BaseRepository[T]`. Avoid a generic CRUD contract whose unrestricted update map bypasses domain operations. A use case that needs `ReserveInventory` should express that business capability, not `Save(any)` plus a sequence of adapter-specific casts.

Prefer consumer-owned interfaces and concrete implementations, not interfaces designed up front for mocking. This profile's core ports are consumer/application-owned architectural contracts; they are not a rule to generate an interface for every constructor, mapper, logger, or configuration struct. Canonical package/file placement and portable interface design can coexist.

## 11. The vertical slice as a reviewable change

To add an HTTP operation in this architecture, identify the exact representation at each handoff:

```text
router.go: POST /users/
  handler/user.go: decodeCreateUser -> dto.CreateUserRequest
  dto/user_mapper.go: request.ToCommand -> inport.CreateUserCommand
  core/port/in/usecase.go: UserService.CreateUser(ctx, command)
  core/service/user_service.go: domain.NewUser -> repo.Insert(ctx, domain user)
  core/port/out/repository.go: UserRepository.Insert contract
  persistence/user_mapper.go: domain user -> write data
  persistence/user_repo.go: Ent create builder -> Save(ctx)
  dao/schema + migrated PostgreSQL constraint: authoritative unique email rule
  dao/ent: generated row -> persistence mapper -> domain user
  dto/user_mapper.go: domain user -> UserResponse
  handler/user.go: Location + status + JSON
```

The code above contains no generic forwarding facade between those boundaries, and a trivial mapper has no interface. The application exposes domain results for this simple case. A richer read use case can return an application-owned projection instead, with an outbound query capability returning that projection, without forcing Ent or HTTP DTOs into core. Do not manufacture a new DTO-shaped copy at every function simply to make the arrow diagram longer.

For a reviewer, concrete rejection examples are:

| Observed change | Specific violation and correction |
| --- | --- |
| `service` imports `adapter/in/http/dto` | Transport leaked inward; define/use an input-port command and map in the HTTP mapper. |
| `domain.User` embeds `ent.User` | Storage schema became business state; separate domain fields/behavior and use the persistence mapper. |
| Handler fields include `*ent.Client` | Handler bypasses application orchestration; inject the inbound port. |
| `router.go` checks email availability | A route declaration now owns business/storage behavior; move it into the use case if needed and still enforce uniqueness in storage. |
| Repository returns HTTP `404` or JSON | Outbound adapter leaked delivery protocol; return core error category/domain value and let the handler map it. |
| `user_mapper.go` appears in `core/service` and imports both DTO and Ent | Two separate adapter boundaries were collapsed; place HTTP mapping in `dto/user_mapper.go` and storage mapping in persistence's `user_mapper.go`. |
| New repository method accepts no context or calls `Background` | Cancellation/deadline is severed; accept and pass the use-case context to the terminal Ent operation. |
| `Total` is `len(users)` | Metadata misrepresents a page as the full result; remove/rename it or implement a real count contract. |
| All Ent constraint errors become duplicate email | Unknown failures are misclassified; inspect the actual named unique violation and retain the cause. |
| `TrID` is passed as evidence of a transaction | Correlation is being confused with atomicity; bind all writes to the actual transaction client. |
| Every layer logs and returns the same error | One failure produces duplicate noisy records; choose access/error/audit ownership deliberately. |
| New `UserManager` forwards every `UserService` method | Extra abstraction has no independent responsibility; wire the controller to the existing inbound port. |

Use [testing and evolution](testing-and-evolution.md) for executable verification, [domain](domain.md) for invariants/identity, [data and transactions](data-and-transactions.md) for atomicity/concurrency, [reliability and events](reliability-and-events.md) for delivery/retries, and [security and operations](security-and-operations.md) for trust, resource limits, logging, and lifecycle. No protected-data, transaction, reliable-event, or idempotency guarantee should be inferred from a CRUD sample or these single-operation fragments.
