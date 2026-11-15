# Go coding conventions and quality tooling

Read this chapter when adopting/refreshing the Go profile or designing boundary
types/tooling. It complements [architecture](architecture.md), [layers](layers.md),
and [behavior ownership](behavior-ownership.md); accepted local/API exceptions
survive handbook installation.

## 1. Names communicate the operation and dependency role

Follow [Google Go naming](https://google.github.io/styleguide/go/decisions.html#naming):
MixedCaps, ID/URL/HTTP/SQL initialisms, short consistent receivers, concise lowercase
packages, and meaningful operations instead of vague common/util/helper or
Process/Handle names. Preserve accepted local/public names; report conflicts.

These additional conventions belong to this profile, not a universal Google architecture:

- Domain-named inbound contracts: UserUseCase/ReservationUseCase, not universal
  UseCase/Service. Read persistence through UserProvider; mutate through
  UserRepository. AIProvider/PaymentProvider stay in their own external adapters.
- Retain dependency roles in fields/parameters/composition: userProvider, userRepo,
  transactor, aiProvider—not repo for everything or Repository on every operation.
- WithinTransaction receives txCtx and uses existing injected adapters, not
  repository bundles or operation/owner-lock-specific runners. Transactor names
  a role, not mandatory UoW; before implementing it read [transaction binding](data-and-transactions.md#2-application-owned-atomicity-without-a-root-client-escape).
- Name verbs: CreateCategory, ArchiveCategory, ConfirmImport; persistence
  FindByID/List and Insert/Update/Delete. Field accessors need no Get, but an
  established GetUser application operation is not a field getter to rename.
- Mutation input: CreateCategoryCommand; selection: ListCategoriesQuery;
  descriptive results; Err-prefixed sentinels, Error-suffixed types. Retain the
  accepted cause-retaining taxonomy/safe mapper, not a second error system.

Composition may import user and call user.NewUseCase; no naming-only Manager/Facade/alias.

## 2. Five total boundary parameters require an input struct

**Required baseline:** at handwritten application/outbound I/O boundaries, five
or more parameters require a named input struct. Count each parameter (including
shared-type declarations and context.Context), excluding receiver/results.
Four total may remain scalar when clear; ambiguous same-typed arguments can
justify an input earlier.

ReserveStock(ctx, actorID, sku, quantity, requestID) has five. Put its input in
`internal/core/port/in/command/reservation.go`; this fragment uses the file's domain import:

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

For command placement/imports/cutover, read [architecture](architecture.md#3-dependency-direction-is-about-imports-not-execution-order).
Inbound mutations retain `*Command` in child `command`; queries/results/interfaces
stay parent `in`. No generic parameter package, CQRS requirement, HTTP DTO/JSON,
ORM objects, or unchecked actor substitute. Migrate all inputs/callers/mappers/tests
without aliases/re-exports; preserve omitted/null/false, versions, and every input.

Outbound-specific selection/write data belongs with its `core/port/out` contract
or a domain value. Apply the threshold to handler→usecase and service→port.
Context is first and explicit, never inside inputs, reusable service fields, or
an implicit dependency registry. `GetUser(ctx, id)` needs no wrapper. Pure domain
constructors/helpers are outside this requirement; required framework callback
signatures get documented narrow lint exceptions, not redesign.

## 3. Entity pointers and named plural collections

**Required baseline:** entity inputs, outputs, and entity-valued fields use
pointers across domain constructors, ports/application, and handwritten adapters.
Define plural pointer-slice collections:

```go
type Category struct {
    ID   string
    Name string
}

type Categories []*Category
```

Use domain.Categories, not raw []domain.Category/[]*domain.Category,
*domain.Categories, pointer-to-interface, or an alias with =. Adapt generic page
results to retain the named collection, not a hidden second raw slice. An
authorized cutover migrates every affected field/constructor/mapper/port/caller/test
without obsolete aliases/shims.

No nil elements. Required lookups return nonnil entity or inspectable not-found,
never (nil, nil). Optional relationships declare nil semantics; never fabricate
empty entities. Empty collections are valid; preserve transport-owned nil/empty JSON.

Identity/lifecycle—not package/name—determines entity status. Small immutable
Money/Quantity/Source/Usage, commands/queries, summaries, and projections may
remain values with defined value-slice collections. Entity mutation requires
pointer receivers, not every value calculation.

Pointers guarantee neither speed nor immutability. Callers own loaded instances;
do not share mutable graphs across concurrent requests or leak aggregate state.
Copy at real ownership boundaries, not for slogans or unnecessary allocations.

## 4. Separate function declarations visibly

**Required baseline:** one blank line between handwritten function/method
declarations, including one-line accessors. Put it before any attached doc comment
or compiler directive, never between that attachment and its function.
Anonymous expression callbacks are not declarations needing this separation.

```go
func (c *Category) IDValue() string { return c.ID }

func (c *Category) Rename(name string) { c.Name = name }
```

Use gofmt-compatible formatting; never install/enable/invoke gofumpt.
Golangci-lint is the only added quality runner; it can run toolchain gofmt through
its built-in formatter. Neither gofmt nor built-in whitespace/return checks
guarantee every declaration gap: retain manual authoring/review coverage, never
claim completeness. Custom analyzers/second formatters require a separate request.

## 5. Adopt golangci-lint as project tooling

Go adoption includes a tooling plan: project-local golangci-lint, owned
.golangci.yml, local commands, and the existing CI job—not Go tooling for non-Go
projects. Show these paths in approved output scope before writing/installing;
handbook-only/no-install/no-CI requests defer the concrete step. Guidance approval
does not authorize application refactors, global installation, or repository fixes.

Follow [official installation](https://golangci-lint.run/docs/welcome/install/local/):
pin a release compatible with both module Go and the Go version building the
runner; verify the actual binary version. Prefer an official archive checked
against its published checksum in ignored project-local bin. Local/CI use the
same release/config. Inspect any downloaded installer separately—no unreviewed
remote-script pipe. No floating latest, global updates, replacement version manager,
application go.mod/tool entries, or dependency changes to satisfy lint.

Minimal v2 starting config; merge rather than replace human-maintained ownership.
Rule names/settings follow [official configuration](https://golangci-lint.run/docs/linters/configuration/#revive):

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

Argument-limit 4 flags ctx plus four business parameters. It may also flag pure
helpers/framework APIs outside the boundary rule: use justified narrow exceptions,
not forced wrappers/API redesign. A function fixture does not establish coverage
of interface methods, function fields, semantic names, entities/collections, or
peer calls; review them explicitly.

No enable-everything, blanket suppressions, or claim of complete Google coverage.
Depguard needs the actual module graph and exercised forbidden-edge fixture;
imports cannot catch same-package/interface-routed peer calls. Do not duplicate
golangci-lint's Staticcheck/revive checks or formatter with standalone installs.

After approved binary/config installation, expose these commands from the actual
Go module root through the existing Makefile/task runner:

```sh
./bin/golangci-lint version
./bin/golangci-lint config verify --config .golangci.yml
./bin/golangci-lint run --config .golangci.yml ./...
```

CI uses that pinned runner without --fix and fails violations. Local autofix is
explicit opt-in; no --fix/repository-wide formatting during handbook refresh.
Explicit config paths avoid home-config inheritance. Generated exclusions follow
actual markers/paths, never handwritten mappers or weakened core dependencies.

## 6. Verification that matches each claim

Validate config with the selected binary; temporary fixtures accept four total
parameters, reject five, then accept Command correction. Separately exercise a
real changed boundary/negative path: count warnings are not behavior proof.
Confirm local/CI version/config agreement; report installation independently of
handbook adoption/reader loading.
