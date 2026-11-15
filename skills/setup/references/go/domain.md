# Domain modeling in Go

Domain models live in `internal/core/domain`. Read [architecture](architecture.md) for application package/dependency rules, [layers](layers.md) for mapping boundaries, [coding conventions](coding-conventions.md) for signatures, and [data and transactions](data-and-transactions.md) for persistence enforcement when those concerns arise. Preserve existing project rules; record decisions through [adoption](../adoption.md).

## Adoption levels

- **Required:** name domain owners for actual invariants, pure/composed decisions, derived values, and collection/read-model calculations; validate construction/mutation and separate HTTP/Ent/SQL mapping.
- **When stateful:** one owner controls legal transitions.
- **When several writes protect one fact:** define atomicity and concurrent persistence enforcement; an in-memory aggregate cannot protect other processes.
- **Optional:** rich aggregates, domain services, specifications, events, and bounded contexts only for a named need.
- **Project decisions:** vocabulary, identity scope, transitions, normalization, money/time semantics, consistency, deletion/retention, and historical compatibility.

Preserve the default small `User` (`ID int`, `Name`, `Email`, `CreatedAt`, validating/normalizing `NewUser`) unless requirements justify change. It implies no universal email, tenant, or DDD policy.

## 1. Discover rules before choosing objects

A useful rule names a fact that must remain true, its owner, the operations that can change it, and the instant at which it must be true.

| Fact | Likely owner | Enforcement |
| --- | --- | --- |
| A quantity in a reservation is positive | Reservation | Constructor and hydration validation; database check constraint |
| A released reservation cannot be released again | Reservation | Transition method plus conditional persistence/version check |
| Available stock cannot become negative | Inventory consistency boundary | Conditional database update or locking; not a pre-read alone |
| An email identity is unique within its agreed scope | Account context | Canonical-key policy plus database unique constraint |
| A caller can operate on this tenant | Application/security boundary | Authentication, authorization, and tenant-scoped repository predicates |

These are hypothetical policies: overselling or repeated idempotent release may be valid. Do not invent age, name-length, or balance restrictions. Confirm vocabulary and walk success, rejected transition, concurrent conflict, historical data, and cross-tenant access with the domain owner.

## 2. Entities, value objects, and aggregates

### Entities: identity survives changes

Identity survives attribute changes. Add typed IDs where mixing identities is a real risk, not mechanically for every string. Application- versus database-assigned identity changes create/retry behavior, not HTTP DTO design.

**Required:** entities cross boundaries as pointers; use named plural collections such as `type Reservations []*Reservation`. Small values, IDs, immutable snapshots, and pure projections may use values/value collections. Pointers express identity/mutation ownership, not automatic speed or concurrency safety.

### Value objects: equality is their value

A value object has no independent lifecycle: an amount/currency or date range with defined endpoints. Prefer small immutable values; struct copies containing slices, maps, or pointers remain shallow.

### Aggregates: one mutation owner and consistency boundary

The root controls invariant-bearing mutation. Reference other aggregates by identity rather than deep loaded graphs; choose boundaries from consistency/lifecycle, not tables or Ent loading capabilities. An aggregate may span tables; a valid transaction may span aggregates. Persistence still needs the concurrency predicates and application boundary in [data and transactions](data-and-transactions.md).

### Concrete example: reservation lifecycle

**Example policy, not a universal model:** `internal/core/domain/reservation.go` uses nonempty opaque IDs, positive tenant IDs, case-sensitive unpadded SKUs, active creation, and one release no earlier than creation. Recording the reservation does not prove availability: the application atomically reserves stock and inserts it.

```go
package domain

import (
    "errors"
    "strings"
    "time"
)

type ReservationID string
type TenantID int64
type SKU string

type ReservationState string

const (
    ReservationActive   ReservationState = "active"
    ReservationReleased ReservationState = "released"
)

var (
    ErrInvalidReservation = errors.New("invalid reservation")
    ErrAlreadyReleased    = errors.New("reservation already released")
)

type Reservation struct {
    id         ReservationID
    tenantID   TenantID
    sku        SKU
    quantity   int64
    state      ReservationState
    createdAt  time.Time
    releasedAt time.Time
}

type Reservations []*Reservation

// ReservationSnapshot is a persistence mapping value, not an HTTP request type.
type ReservationSnapshot struct {
    ID         ReservationID
    TenantID   TenantID
    SKU        SKU
    Quantity   int64
    State      ReservationState
    CreatedAt  time.Time
    ReleasedAt time.Time
}

func NewReservation(id ReservationID, tenant TenantID, sku SKU,
    quantity int64, now time.Time) (*Reservation, error) {
    return RestoreReservation(ReservationSnapshot{
        ID: id, TenantID: tenant, SKU: sku, Quantity: quantity,
        State: ReservationActive, CreatedAt: now,
    })
}

func RestoreReservation(s ReservationSnapshot) (*Reservation, error) {
    if s.ID == "" || s.TenantID <= 0 || s.Quantity <= 0 ||
        s.SKU == "" || strings.TrimSpace(string(s.SKU)) != string(s.SKU) ||
        s.CreatedAt.IsZero() {
        return nil, ErrInvalidReservation
    }
    switch s.State {
    case ReservationActive:
        if !s.ReleasedAt.IsZero() {
            return nil, ErrInvalidReservation
        }
    case ReservationReleased:
        if s.ReleasedAt.IsZero() || s.ReleasedAt.Before(s.CreatedAt) {
            return nil, ErrInvalidReservation
        }
    default:
        return nil, ErrInvalidReservation
    }
    return &Reservation{
        id: s.ID, tenantID: s.TenantID, sku: s.SKU,
        quantity: s.Quantity, state: s.State,
        createdAt: s.CreatedAt.UTC(), releasedAt: s.ReleasedAt.UTC(),
    }, nil
}

func (r *Reservation) Release(now time.Time) error {
    if r == nil || r.state == "" || now.IsZero() || now.Before(r.createdAt) {
        return ErrInvalidReservation
    }
    if r.state == ReservationReleased {
        return ErrAlreadyReleased
    }
    if r.state != ReservationActive {
        return ErrInvalidReservation
    }
    r.state = ReservationReleased
    r.releasedAt = now.UTC()
    return nil
}

func (r *Reservation) Snapshot() ReservationSnapshot {
    return ReservationSnapshot{
        ID: r.id, TenantID: r.tenantID, SKU: r.sku,
        Quantity: r.quantity, State: r.state,
        CreatedAt: r.createdAt, ReleasedAt: r.releasedAt,
    }
}
```

The snapshot is an adapter mapping value, not a JSON DTO or mutable entity alias. Constructors and behavior reject invalid zero values; no generic `SetState` may bypass transitions. Each use case owns its loaded instance; persistence arbitrates competing instances, not shared mutable request pointers.

**Verify:** nonpositive quantity; blank/padded SKU; active-with-release-time; unknown state; valid released history; release before creation/twice; snapshot mutation leaves entity unchanged. Integration must prove two loaded active copies cannot both persist release.

### Mutation ownership beyond scalar fields

**When collections carry invariants:** copy mutable ownership boundaries, not every access; use small immutable projections when graph copying would be wasteful.

This complete value fragment assumes membership is fixed after construction and copies on ingress and mutable egress:

```go
package domain

import (
    "errors"
    "slices"
)

type MemberID string

type TeamMembers struct {
    ids []MemberID
}

func NewTeamMembers(ids []MemberID) (TeamMembers, error) {
    seen := make(map[MemberID]struct{}, len(ids))
    for _, id := range ids {
        if id == "" {
            return TeamMembers{}, errors.New("empty member identity")
        }
        if _, exists := seen[id]; exists {
            return TeamMembers{}, errors.New("duplicate member identity")
        }
        seen[id] = struct{}{}
    }
    return TeamMembers{ids: slices.Clone(ids)}, nil
}

func (m TeamMembers) Contains(id MemberID) bool {
    return slices.Contains(m.ids, id)
}

func (m TeamMembers) IDs() []MemberID {
    return slices.Clone(m.ids)
}
```

`slices` requires Go 1.21+; honor the target Go version. For large lists choose another access model instead of repeated cloning; retain a lookup map only when workload justifies it.

**Verify:** changing constructor input or `IDs()` output cannot change membership; duplicate IDs reject. Returning `m.ids` or shallow-copying the containing struct violates ownership. Copying pointers does not protect mutable elements; deliberate shared ownership still needs synchronization/race checks.

## 3. Construction is not hydration

New admission and rebuilding a stored fact are distinct:

- `NewReservation` sets initial state from injected ID/time, without database/network/Ent effects.
- `RestoreReservation` validates stored shape and preserves lifecycle/identity/time without creation effects or replaying today's admission policy.
- Handwritten `postgres/dao/*_mapper.go` (or an adapter-owner mapper) converts Ent fields through hydration; generated code stays in `postgres/dao/ent`, never mapping in `postgres/db`. Handle nullability and enum/version differences.
- Older valid records may coexist with stricter admission. Explicitly migrate, support a versioned representation, or surface corruption; never silently repair identity, money, tenant, or timestamps.

Restore a released reservation as released even if its SKU is no longer sellable. Calling `NewReservation` then overwriting state, or filling missing history with `time.Now()`, manufactures facts.

**Verify:** every supported state and nullable schema field; old-valid/newly-inadmissible rows; classified corruption with operational visibility; no read-time event, write, or timestamp change.

## 4. Identity, clocks, money, and normalization

### Identity and uniqueness

**Required:** define identity allocator and uniqueness scope. Preserve `User.ID int`; UUID conversion is a migration. Opaque identity differs from mutable email; tenant-qualified keys need not be globally unique.

Application IDs can precede a transaction and survive an explicitly safe retry. Database sequences may gap after rollback and imply neither gaplessness nor chronological order. Never allocate across replicas with `MAX(id)+1` or a process mutex.

**Verify:** concurrent creates, soft-deletion key reuse, identical keys across tenants, and stable operation identity on retries. Availability prechecks cannot replace database uniqueness; use [data constraints](data-and-transactions.md#6-uniqueness-races-and-database-constraints).

### Time is an input with a meaning

**When time affects behavior:** pass an instant or inject a consumer-local application clock wired by composition. Capture one `now` for coupled decisions; the reservation accepts `now` from e.g. `s.clock.Now()`. UTC instants suit its timestamps, not every time concept:

- A birthday is a calendar date, not “midnight UTC.”
- A recurring 09:00 appointment needs a named time zone and daylight-saving policy.
- An expiration boundary must specify whether equality is expired; write `!now.Before(expiresAt)` for an inclusive expiration boundary only if that is the agreed policy.
- A timestamp is not a concurrency version. Clock skew, precision loss, and equal timestamps make it unsuitable as a universal lost-update guard.

Go's monotonic reading helps measure durations within a process; serialization strips it. Use `Time.Equal` for instant equality and know the persistence precision rather than depending on `==` over `time.Time`.

**Verify:** expiration equality/before/after, timezone/DST scheduling, database precision round-trip, and fixed-clock determinism. Do not invent an unchosen timezone or use localized strings as database sort keys.

### Money needs representation and arithmetic policy

**For money:** decide currency, scale, rounding, sign, and overflow. Minor units fit only compatible settlement precision; rates/tax intermediates may require decimal/arbitrary precision with explicit rounding boundaries. Never convert decimal amounts through `float64`.

This independent fragment supports only example USD/EUR two-decimal minor units, not every currency. Supported-currency catalogue/lifecycle is project-owned. Signed amounts are allowed here; an operation decides whether its price/payment may be negative.

```go
package domain

import (
    "errors"
    "math"
)

type Currency string

const (
    USD Currency = "USD"
    EUR Currency = "EUR"
)

var (
    ErrCurrency = errors.New("unsupported or mismatched currency")
    ErrOverflow = errors.New("money overflow")
)

type Money struct {
    minor    int64
    currency Currency
}

func NewMoney(minor int64, currency Currency) (Money, error) {
    if currency != USD && currency != EUR {
        return Money{}, ErrCurrency
    }
    return Money{minor: minor, currency: currency}, nil
}

func (m Money) Minor() int64       { return m.minor }

func (m Money) Currency() Currency { return m.currency }

func (m Money) Add(other Money) (Money, error) {
    if (m.currency != USD && m.currency != EUR) || m.currency != other.currency {
        return Money{}, ErrCurrency
    }
    if (other.minor > 0 && m.minor > math.MaxInt64-other.minor) ||
        (other.minor < 0 && m.minor < math.MinInt64-other.minor) {
        return Money{}, ErrOverflow
    }
    return Money{minor: m.minor + other.minor, currency: m.currency}, nil
}
```

Multiplication, division, tax, discounts, and FX need separate checked algorithms: safe addition does not make `amount * quantity` safe. Use maintained ISO 4217 data and the settlement provider's accepted precision.

**Verify:** zero/signed amounts, currency mismatch/unsupported currency, both overflow directions, exact decimal parsing, rounding ties, and finance-approved tax/discount order. Neither `int64(floatAmount*100)` nor independently rounded lines implement an invoice-total rounding policy.

### Normalize only under an explicit equivalence relation

**Required:** separate display value, canonical comparison key, and validation. Normalize under one declared equivalence policy, persist its key with the matching unique constraint, and retain original spelling where needed.

Trimming a display name may be accepted; deleting internal spaces changes it. Do not strip email `+` suffixes/dots by provider folklore. SMTP domain case-insensitivity does not erase local-part case semantics; case-insensitive account identity is a product choice. `net/mail.ParseAddress` proves syntax, not deliverability, ownership, or identity suitability.

Choose one policy across create, lookup, change, import, and migration, accounting for Unicode normalization/folding, internationalized domains, and database collation. A domain/policy function owns the canonical key; adapters persist it. DTO validation is not the only invariant check.

**Verify:** whitespace/case, supported composed/decomposed Unicode and internationalized domains, aliases that must remain distinct, and historical collisions before changing constraints. Handler/importer/index disagreement creates conflicting identities.

## 5. Domain service versus application service

**Required:** the application owns workflow; the domain owns pure business decisions, including compositions of validators, eligibility, canonical matching, and collection counters even without a state machine. When placing these APIs, follow [behavior ownership](behavior-ownership.md).

| Concern | Placement |
| --- | --- |
| Decode JSON, parse path ID, map response | `internal/adapter/in/http/{handler,dto}` |
| Authenticate and establish trusted caller/tenant | Inbound security middleware/application authorization boundary |
| Load inventory, construct reservation, choose transaction, save both | `internal/core/service/orchestration/reservation` (one real stock/reservation workflow) |
| Check a legal reservation transition | `internal/core/domain` entity method |
| Calculate an agreed allocation across already supplied domain values | Domain service/function, if needed |
| Query Ent, map nullable fields, translate constraint errors | `internal/adapter/out/persistence/postgres/{provider,repository,dao}`: providers read; repositories write; handwritten mappers hydrate |
| Call a payment provider | Outbound port and adapter, orchestrated by application policy |

A stateless domain function often suffices; pass typed inputs, not an application container or HTTP context values. A necessary external quote/rule lookup needs a narrow explicit port with visible deadlines/workflow ownership, not a supposedly pure calculator.

Use cases own one domain; `service/shared/<capability>` owns application capabilities, not business calculations. Peer operations/services never call one another, even through interfaces. Cross-domain orchestration calls ports/domain/shared capabilities directly, never use cases.

The application obtains trusted tenant, validates command, generates ID/one `now`, constructs reservation, then conditionally decrements stock and inserts reservation in one transaction. Return after commit; the constructor knows no repository. Handlers must not own this workflow.

**Verify:** pure domain tests require no database/network; use-case tests observe the transaction/operations; adapters exercise real constraints; another inbound adapter invokes the same use case without HTTP.

## 6. Bounded contexts and anti-corruption mapping

**When subsystems assign different meanings to similar data:** name contexts and translate at their boundary; no microservice or separate database is implied. Billing's invoice/tax customer need not be support's conversation customer or one universal `Customer`.

An outbound anti-corruption adapter maps provider `PICKED_UP`/`IN_TRANSIT` to receiving `InTransit`. New statuses return classified unsupported/integration errors unless an explicit `Unknown` is modeled; never map `RETURNED` to `Delivered`. Keep provider DTOs/translation outside domain; the port expresses application needs, not an SDK copy. Shared Ent/HTTP/provider models let external changes redefine local invariants.

For local/remote writes read [reliability and events](reliability-and-events.md); a domain method cannot make them atomic.

**Verify:** unknown status, nullable field, timestamp precision, foreign identity, and redelivery; unmapped input cannot mean successful completion.

## 7. Policies and specifications: extract demonstrated variation only

**Optional:** extract a policy for demonstrated independent variation/reuse/auditable version, or a specification for composed business predicates—not for every `if`. Start with `reservation.Release(now)`, not a universal expression engine. Different accepted retail/enterprise expiration rules may justify a narrow policy.

Keep typed inputs and an owner-approved decision table. Record policy versions needed for audit/replay; never reprice history using today's rules. In-memory predicates neither enforce SQL authorization nor protect stale stock reads; repository filters cannot omit mandatory tenant predicates.

**Verify:** decision boundaries, reproducibility/unsupported versions, AND/OR composition, and independent database races.

## 8. Commands, queries, and simple CRUD

**Required:** commands change state; queries observe it. Mutation inputs belong in `core/port/in/command`; interfaces/queries/results in `core/port/in`. Use read-provider/write-repository ports, not Ent builders or HTTP DTOs. For application/I/O APIs, five parameters counting `ctx` but not receiver require a named Command/Query; `ctx` stays first and outside it. Pure domain constructors such as `NewReservation` are exempt.

- Commands contain caller-controlled intent, not mass-assigned tenant authority, generated ID, creation time, role, or internal state. Resolve tenant/actor authority through trusted application inputs.
- Queries may return projections without aggregate hydration, but still need authorization, bounded pagination, and resource limits.
- Hydration/queries emit no business event or write; operational access logs are separate.

**Optional:** separate implementations/CQRS storage only when shape/scale/lifecycle warrants it. Small `User` CRUD with validation and ports is sufficient. Exported inert request/read fields are fine; hide fields that protect behavioral invariants. Do not add event streams, specifications, or aggregates without need; avoid `Save(any)` or persistence-object inputs that hide allowed changes.

**Verify:** protected fields cannot be mass-assigned; queries perform no business writes/N+1 hydration; HTTP/jobs share the use case; CRUD remains small while enforcing actual invariants.

## Decision record to produce during setup

Discover answers in code/schema/docs first. Record adopted/deferred/not-applicable/open in [adoption](../adoption.md), asking only unresolved business questions:

- Real facts/transitions and their confirming owner; entity/value/projection and mutation ownership.
- ID allocation/uniqueness scope; canonicalization and historical collisions.
- Time, money, sign/scale/rounding; atomic versus convergent changes.
- Supported historical hydration/corruption handling; demonstrated need for policies/context boundaries versus CRUD.

For test placement and compatibility work read [testing and evolution](testing-and-evolution.md).
