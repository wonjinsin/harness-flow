# Go coding conventions and quality tooling

This chapter is required when adopting or refreshing the Go profile. Use it with
[architecture](architecture.md), [layers](layers.md), and
[behavior ownership](behavior-ownership.md). These are the profile's defaults,
not permission to overwrite an existing project's accepted exceptions or migrate
its application while installing a handbook.

## 1. Names communicate the operation and dependency role

Use [Google's Go naming guidance](https://google.github.io/styleguide/go/decisions.html#naming)
as the language-style baseline: MixedCaps, established initialisms such as ID,
URL, HTTP and SQL, short consistent receiver names, and concise lowercase package
names. Avoid vague common/util/helper packages and methods named only Process or
Handle when the operation can be named. Retain an accepted local convention when
refreshing; report a conflict rather than silently renaming public contracts.

Add these explicit profile conventions; they are not claims about a universal
Google architecture standard:

- Input interfaces name their domain capability, such as UserUseCase or
  ReservationUseCase, not one application-wide UseCase or Service.
- Persistence reads use UserProvider; mutations use UserRepository. External
  clients can use AIProvider or PaymentProvider, but their implementations stay
  under their own outbound adapter, not persistence.
- Dependency fields, parameters and composition variables retain the role:
  userProvider, userRepo, transactor, aiProvider. Do not name every outbound
  dependency repo, and do not append Repository to every operation name.
- Use the common WithinTransaction contract; Transactor names its role, not a
  mandatory new layer or UoW suffix. Keep compatible existing names. Apply the
  [transaction contract reuse and split criteria](data-and-transactions.md#2-application-owned-atomicity-without-a-root-client-escape)
  instead of deriving one runner per operation name.
- Use meaningful verbs for operations: CreateCategory, ArchiveCategory,
  ConfirmImport; FindByID and List for persistence reads; Insert, Update and Delete
  for writes. Plain field accessors need no Get prefix. An established GetUser
  application operation is not the same as a field getter and need not be renamed
  during a guidance refresh.
- Use CreateCategoryCommand for mutation input, ListCategoriesQuery for selection,
  and a descriptive result name. Sentinel errors start Err; error types end Error.
  Preserve the existing error taxonomy and safe transport mapper, not a second
  example-specific error system.

Composition can import the user use-case package as user and call user.NewUseCase.
Do not add a UserManager/Facade or alias solely to repeat these names.

## 2. Five total boundary parameters require an input struct

**Required baseline:** handwritten application and outbound I/O boundaries with
five or more parameters use a named input struct. Count context.Context as one
parameter, count each named parameter even when declarations share a type, and
exclude the method receiver and result parameters. Four total parameters can
remain scalar when their meaning is clear. Fewer parameters may still deserve a
struct when same-typed positional arguments are ambiguous.

For example, ReserveStock(ctx, actorID, sku, quantity, requestID) has five
parameters. Its input lives in `internal/core/port/in/command/reservation.go`,
with the domain import supplied by that file:

```go
package command

type ReserveStockCommand struct {
    ActorID   string
    SKU       string
    Quantity  domain.Quantity
    RequestID string
}
```

The interface stays in `internal/core/port/in/reservation.go`, importing context,
domain, and the child command package:

```go
package in

type ReservationUseCase interface {
    ReserveStock(context.Context, command.ReserveStockCommand) (*domain.Reservation, error)
}
```

**Command package ownership:** inbound mutation inputs live in
`internal/core/port/in/command`, grouped by capability, and retain descriptive
`*Command` names. Keep inbound interfaces, Query and result types in
`core/port/in`; this separation does not introduce a query/result package or CQRS
infrastructure. Do not use a generic `parameter` package or treat commands as
HTTP DTOs. The parent port, handlers/mappers, and services import `command`;
`command` may import domain and standard-library types, never its parent `in`,
service implementations, transport, or persistence packages.

Outbound-specific selection/write data stays with its `core/port/out` contract
or an appropriate domain value. The parameter-count rule applies to both
handler-to-use-case and service-to-port calls. Context remains the first explicit
function argument, never a command field, reusable service field or implicit
dependency registry. Commands/queries contain no HTTP DTO, JSON tags, SQL/ORM
objects or untrusted replacement for a verified actor.

GetUser(ctx, id) needs no wrapper. A required third-party/framework callback
signature is not ours to redesign; document any narrowly scoped lint exception.
This rule is not a requirement to wrap every pure domain constructor or helper.
Preserve omitted/null/false semantics, concurrency versions and every original
input when migrating a boundary; do not hide missing fields in context.
Move all command callers, implementations, mappers, and tests together; do not
leave aliases or re-exports in the parent port package.

## 3. Entity pointers and named plural collections

**Required baseline:** entity inputs, outputs and entity-valued fields use
pointers consistently across domain constructors, application/port contracts,
handwritten adapter mappers and implementations. Collection types are defined
plural slice types containing entity pointers:

```go
type Category struct {
    ID   string
    Name string
}

type Categories []*Category
```

Use domain.Categories at those boundaries rather than raw []domain.Category or
[]*domain.Category. This is a defined type, not an alias with =. Do not use
*domain.Categories or pointer-to-interface types. When an existing generic page
owns a raw slice, adapt its application result shape to retain the named
collection instead of hiding a second raw entity slice behind generics. Migrate
all affected fields, constructors, mappers, ports, callers and tests together in
an authorized code change; do not leave obsolete aliases or forwarding shims.

Entity collections contain no nil elements. A required single-entity lookup
returns a non-nil entity on success or the existing inspectable not-found error,
never (nil, nil). Truly optional relationships must state their nil semantics;
do not make every mapper fabricate empty entities. Empty collections are valid;
HTTP's nil-versus-empty JSON representation remains transport-owned and must
preserve its existing wire contract.

This pointer rule applies to entities, not every struct in a domain package.
Small immutable values such as Money, Quantity, Source and Usage, application
commands/queries, summaries and pure projections can remain values. Their
collections can remain defined slices of values when appropriate. Pointer
receivers are required for entity mutation, not for every value calculation.
Classify the type by identity/lifecycle, not only its directory or name.

Pointers are not automatically faster or immutable. A caller owns its loaded
entity instance; do not share mutable pointers across concurrent requests or
leak mutable aggregate state. Copy only at genuine ownership boundaries, preserve
invariants, and avoid extra allocations/copies merely to satisfy a slogan.

## 4. Separate function declarations visibly

**Required baseline:** leave one blank line between handwritten function/method
declarations, including one-line accessors. Keep an attached documentation comment
or compiler directive next to its declaration; the separating line goes before
that comment, not between the comment and function. Anonymous callbacks inside
an expression are not top-level declarations to separate this way.

```go
func (c *Category) IDValue() string { return c.ID }

func (c *Category) Rename(name string) { c.Name = name }
```

Use standard gofmt-compatible formatting. Do not install, enable or invoke
gofumpt in this profile. Golangci-lint is the only added Go quality runner;
gofmt is part of the Go toolchain and can run through its built-in formatter.
Neither gofmt nor the runner's built-in whitespace/return checks guarantee this
rule between every function declaration. Preserve it in the authoring/review
checklist and examples; do not advertise complete automatic enforcement or add a
custom analyzer/second formatter without a separate explicit request.

## 5. Adopt golangci-lint as project tooling

Go setup includes an explicit golangci-lint tooling plan alongside the handbook:
project-local installation, an owned .golangci.yml, local check commands and the
existing CI verification job. It is not a requirement to install Go tooling into
non-Go projects. Treat an explicit handbook-only, no-install or no-CI-edit request
as a scope constraint: provide the concrete plan and deferred step instead of
performing it. Before writing config/build/CI files or installing a binary, show
those paths in the approved setup output scope. Guidance approval alone does not
authorize application refactoring, a global install, or repository-wide fixes.

Follow the [official installation guidance](https://golangci-lint.run/docs/welcome/install/local/):
choose a fixed release compatible with the module's Go language version and the
Go version used to build that release. Verify the actual binary version; do not
copy a floating latest version or treat one release number as architecture.
Prefer an official release binary in an ignored project-local bin directory,
with the release archive checked against its published checksum before use.
Use the same release and config in local commands and CI. Download and inspect
an installer separately if used; never execute an unreviewed remote script via
a pipe to a shell. Do not silently update global tooling, replace an existing
version manager, add golangci-lint to the application's go.mod/tool dependencies,
or change application dependencies to satisfy the linter.

This minimal v2 configuration is a starting point for an owned Go project config,
not permission to replace a human-maintained existing one. These rule names and
settings follow the [official configuration](https://golangci-lint.run/docs/linters/configuration/#revive):

```yaml
version: "2"
linters:
  default: none
  enable:
    - errcheck
    - govet
    - ineffassign
    - staticcheck
    - unused
    - revive
  settings:
    revive:
      enable-default-rules: false
      rules:
        - name: argument-limit
          arguments: [4]
        - name: var-naming
        - name: receiver-naming
        - name: error-naming
formatters:
  enable:
    - gofmt
```

The argument-limit maximum is 4: a declared function with ctx plus four business
parameters exceeds it. This general linter check can also flag domain helpers or
framework signatures outside the boundary rule's scope; use a justified narrow
exception rather than changing required third-party APIs or boxing every value.
Conversely, do not assume interface method declarations, function-valued fields,
semantic role names, entity/collection types or peer calls are all covered just
because a function-count fixture is reported. Review those contracts explicitly.

Do not turn on every linter, adopt blanket suppressions, or claim this config
implements all Google conventions. Enable dependency checks such as depguard only
with the actual module/path graph and an exercised forbidden-edge fixture. Import
checks cannot detect every forbidden peer operation routed through an interface
or called from the same package. Do not install standalone Staticcheck, revive or
a second formatter when their checks are already provided by golangci-lint.

From the actual Go module root, after installing the approved binary/config,
provide these commands through the project's existing Makefile/task runner:

```sh
./bin/golangci-lint version
./bin/golangci-lint config verify --config .golangci.yml
./bin/golangci-lint run --config .golangci.yml ./...
```

CI runs the same pinned runner without --fix and fails on violations. Local
auto-fixing can be offered explicitly; never run --fix or repository-wide
formatting during a handbook refresh without authorization. Use explicit config
paths to avoid accidentally inheriting an unrelated home-directory config.
Generated-code exclusions follow the project's real generated markers/paths and
must not exclude handwritten mappers or weaken core dependency rules.

## 6. Verification that matches each claim

Validate the config against the selected binary and exercise a temporary
four-total/five-total-parameter example: accept the first, report the second,
then accept the Command-based correction. Check a real changed application
boundary and its negative path separately; a count warning is not behavior proof.
Confirm local and CI version/config paths agree, and keep installation status
separate from handbook adoption and reader loading.
