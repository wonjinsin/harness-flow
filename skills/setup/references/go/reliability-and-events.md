# Reliability, idempotency, and events

Use this chapter when duplicate commands, durable delivery, or external effects need a precise guarantee. Adopt only mechanisms justified by the failure model; [adoption](../adoption.md) records unresolved policy. Layering and the execution's `transaction_id` supply neither database transactions nor reliable delivery.

## 1. Choose the smallest honest guarantee

| Classification | Adopt when | Guarantee and boundary |
| --- | --- | --- |
| **Required baseline** | Every application | Propagate cancellation, bound work, close resources, preserve errors, enforce database constraints, and state when an outcome is unknown. |
| **Required when commands can be retried and duplicate effects are unacceptable** | A create/charge/submit command needs retry safety | Define an idempotency contract and persist deduplication together with the local effect. A header alone does nothing. |
| **Required when an external notification must survive a committed local change** | Losing an event after commit violates a requirement | Persist an outbox row in the business transaction; publish asynchronously with duplicate handling. |
| **Required when a consumer must apply a local effect once per event** | Broker redelivery is possible | Persist consumer inbox identity and local writes in one database transaction; acknowledge afterward. |
| **Required when external effects cannot share the local transaction** | Payment, email, shipment, or another service | Model operation identity, ambiguous outcomes, recovery, and any compensation explicitly. |
| **Optional** | Measured failure/latency isolation need | A circuit breaker, bulkhead, cache, broker, or workflow engine. Each adds state and operational costs. |
| **Needs project decision** | Before adopting the corresponding mechanism | Retry budget, replay window, key scope, terminal failures, ordering scope, schema compatibility, compensation policy, and recovery ownership. |

For local CRUD, constraints and a deadline may suffice; a broker does not improve a function call.

### Placement

- Domain owns invariants/facts; input ports own context-aware use cases/results. Services own operation order, recoverable states, and transaction scope. Follow [architecture](architecture.md) when choosing usecase/shared/orchestration; no peer-service or orchestration-to-usecase calls.
- Output ports expose required persistence, transaction, vendor, and durable-event capabilities. HTTP authenticates, parses/validates, delegates, and maps outcomes—not a second workflow.
- Under `internal/adapter/out/persistence/postgres`, `provider` reads, `repository` writes idempotency/inbox/outbox and business state, `db` owns lifecycle/private context-handle resolution, and `dao` separates generated `ent` from handwritten mappers. Existing adapters receive callback `txCtx` for the same transaction; `db` never imports providers/repositories. Read [data and transactions](data-and-transactions.md) when implementing this boundary.
- Follow [architecture](architecture.md) for vendor adapter placement. These adapters own protocol, credentials, error translation, and documented retry rules; persistence “provider” means database reads. Add integrations only when used.
- `cmd/api/main.go` owns reusable clients/pools/workers and lifecycle. A separate publisher executable is optional.

## 2. Deadlines and cancellation are resource ownership

**Required baseline.** Put `context.Context` first on I/O ports and propagate it. Never store request contexts on reusable services, replace them with `context.Background()`, or hide business arguments in them. A child deadline cannot extend its parent.

Complete adapter-scoped read example; imports: `context`, `encoding/json`, `errors`, `fmt`, `io`, `net/http`, `net/url`, `time`. Composition constructs/reuses this client with a validated trusted HTTPS `baseURL`, never user input. No automatic retry:

```go
type Receipt struct {
    ID     string `json:"id"`
    Status string `json:"status"`
}

type ReceiptClient struct {
    client  *http.Client
    baseURL string
}

func NewReceiptClient(baseURL string) *ReceiptClient {
    return &ReceiptClient{
        baseURL: baseURL,
        client: &http.Client{
            Timeout: 3 * time.Second,
            CheckRedirect: func(*http.Request, []*http.Request) error {
                return http.ErrUseLastResponse
            },
        },
    }
}

func (c *ReceiptClient) Lookup(ctx context.Context, id string) (Receipt, error) {
    ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel()

    endpoint := c.baseURL + "/receipts/" + url.PathEscape(id)
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
    if err != nil {
        return Receipt{}, fmt.Errorf("build receipt request: %w", err)
    }
    resp, err := c.client.Do(req)
    if err != nil {
        return Receipt{}, fmt.Errorf("lookup receipt: %w", err)
    }
    defer resp.Body.Close()

    const maxBody = 64 << 10
    body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
    if err != nil {
        return Receipt{}, fmt.Errorf("read receipt: %w", err)
    }
    if len(body) > maxBody {
        return Receipt{}, errors.New("receipt response exceeds limit")
    }
    if resp.StatusCode != http.StatusOK {
        return Receipt{}, fmt.Errorf("receipt provider status %d", resp.StatusCode)
    }
    var receipt Receipt
    if err := json.Unmarshal(body, &receipt); err != nil {
        return Receipt{}, fmt.Errorf("decode receipt: %w", err)
    }
    if receipt.ID != id || (receipt.Status != "pending" && receipt.Status != "settled") {
        return Receipt{}, errors.New("invalid receipt response")
    }
    return receipt, nil
}
```

Status values are illustrative integration data, not User policy; translate at the outbound boundary. Never include provider bodies in errors. `Do` does not treat non-2xx as errors; close every returned body. EOF plus close enables reuse, but do not drain unbounded data just for reuse. Composition owns reusable transports and load-appropriate connection/TLS/header/pool budgets; `Client.Timeout` includes body reading. Streams need separate budgets.

**Verify:** cancellation before dispatch/during body reading; oversized, malformed, slow, redirect and non-2xx responses via a test server; prompt return, closed bodies, no persisted success or public provider details. Cancellation cannot prove a remote effect did not happen.

## 3. Retry only an operation whose semantics permit it

**Required when retries are adopted.** Require:

1. Dependency-documented transient classification, not every error/`5xx`.
2. Read-only/naturally idempotent semantics or a stable durable key the provider supports.
3. Finite attempts, per-attempt timeouts, backoff and capacity within a total deadline.
4. One retry owner accounting for SDK/proxy/broker/caller retries.
5. Fresh request/body and closed responses per attempt; bounded `Retry-After` where required.

Complete **read-only** policy example; imports: `context`, `errors`, `math/rand`, `time`. Durations/counts illustrate configuration, not approved project policy. `transient` is adapter-specific; validation/authentication/permanent not-found are not transient absent a documented consistency contract.

```go
func retryRead(
    ctx context.Context,
    transient func(error) bool,
    read func(context.Context) error,
) error {
    ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
    defer cancel()

    for attempt := 0; attempt < 3; attempt++ {
        if err := ctx.Err(); err != nil {
            return err
        }
        attemptCtx, stop := context.WithTimeout(ctx, 400*time.Millisecond)
        err := read(attemptCtx)
        stop()
        if err == nil {
            return nil
        }
        if ctx.Err() != nil {
            return ctx.Err()
        }
        if errors.Is(err, context.Canceled) || !transient(err) || attempt == 2 {
            return err
        }
        capDelay := 50 * time.Millisecond * time.Duration(1<<attempt)
        delay := time.Duration(rand.Int63n(int64(capDelay) + 1))
        timer := time.NewTimer(delay)
        select {
        case <-ctx.Done():
            timer.Stop()
            return ctx.Err()
        case <-timer.C:
        }
    }
    panic("unreachable")
}
```

Never apply this helper to payment submission or transactions that already called external services. Serialization/deadlock recovery restarts the **entire local transaction**, reloads state with fresh `txCtx` through existing adapters, and excludes irreversible work. A failed commit connection may mean unknown outcome: neither rollback nor retry with a new identity is safe to assume. Circuit breakers do not fix this.

**Verify:** exact maximum attempts, canceled backoff, permanent errors, stable operation identity, and accepted-then-disconnected requests without a second effect.

## 4. Bound concurrency and name the owner

**Required baseline.** Every goroutine has a cancel/wait owner; every channel one closing owner; mutable shared state synchronization or exclusive ownership. Required work must not use detached request goroutines. Persist durable jobs for process-owned workers.

Complete finite independent **read-only** batch example using `golang.org/x/sync/errgroup`; imports: `context`, `errors`, that package. Choose the limit from downstream capacity:

```go
func ReadBatch(ctx context.Context, ids []string, limit int,
    read func(context.Context, string) error,
) error {
    if limit < 1 {
        return errors.New("concurrency limit must be positive")
    }
    group, groupCtx := errgroup.WithContext(ctx)
    group.SetLimit(limit)
    for _, id := range ids {
        if err := groupCtx.Err(); err != nil {
            break
        }
        id := id
        group.Go(func() error {
            if err := groupCtx.Err(); err != nil {
                return err
            }
            return read(groupCtx, id)
        })
    }
    if err := group.Wait(); err != nil {
        return err
    }
    return ctx.Err()
}
```

`Go` can block at the limit; callbacks must honor cancellation. The group context ends with `Wait`, so do not reuse it afterward. Bound ingress batch size too. Concurrent transaction use requires driver/ORM support; parallel writes need a separate consistency design.

**Verify:** bounded peak calls, all launched calls ended before return, cancellation unblocks dispatch, race-free output. Explicitly permit loss for best-effort work; detached `go sendEmail(context.Background(), user)` cannot claim durability or orderly shutdown.

## 5. An idempotent HTTP command is a state machine

**Required when duplicate commands violate the product contract.** A key identifies one logical command, not authentication or permanent business uniqueness. Authenticate and authorize every attempt/replay; never expose another principal's cached result.

**Needs project decision:** required/optional key, format/length, trusted principal/tenant scope, operation/API version, normalization, retention/privacy, terminal-rejection replay, and post-retention behavior. Do not invent tenancy.

Scope can be `(trusted_scope, operation_version, key)` with verified server-side identity/membership. Public APIs need an explicit safe scope, not caller-supplied user IDs. SHA-256 the operation-changing fields/headers using stable versioned semantic encoding, not nondeterministically serialized maps. Hashes are not encryption; retain minimal personal input.

### Local-only command: atomic reservation, effect, and result

**Real PostgreSQL schema.** `result` is a bounded, versioned application result mapped by persistence, never an Ent object/arbitrary HTTP response. The 1–128-byte key constraint is this example's policy; result limits/retention require configuration.

```sql
CREATE TABLE command_dedup (
    scope text NOT NULL,
    operation text NOT NULL,
    key text NOT NULL CHECK (octet_length(key) BETWEEN 1 AND 128),
    fingerprint bytea NOT NULL CHECK (octet_length(fingerprint) = 32),
    state text NOT NULL CHECK (state IN ('processing', 'completed')),
    outcome text,
    result_version integer,
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (scope, operation, key),
    CHECK (
        (state = 'processing' AND outcome IS NULL
            AND result_version IS NULL AND result IS NULL)
        OR
        (state = 'completed' AND outcome IS NOT NULL
            AND result_version IS NOT NULL AND result IS NOT NULL)
    )
);
```

**Transaction pseudocode**, with bound SQL parameters at PostgreSQL `READ COMMITTED`. The conflict read must be a **new statement** to see a concurrent winner; an insert/fallback CTE may share a snapshot and return nothing.

```text
Authenticate; resolve trusted scope; authorize action; validate and normalize input.
Compute versioned command fingerprint. Begin transaction with a bounded deadline.

INSERT INTO command_dedup(scope, operation, key, fingerprint, state, expires_at)
VALUES ($scope, $operation, $key, $fingerprint, 'processing', $expiry)
ON CONFLICT (scope, operation, key) DO NOTHING
RETURNING key;

If a row was inserted:
    Run the local use case through repositories bound to THIS transaction.
    Enforce database uniqueness/concurrency constraints, not just prechecks.
    Produce a typed success or an explicitly replayable terminal rejection.
    Persist any required outbox records in THIS transaction.
    Serialize the bounded application result using the recorded result version.
    UPDATE command_dedup
       SET state='completed', outcome=$outcome,
           result_version=$version, result=$result
     WHERE scope=$scope AND operation=$operation AND key=$key
       AND state='processing';
    Require exactly one updated row. COMMIT before returning the result.
Else:
    SELECT fingerprint, state, outcome, result_version, result
      FROM command_dedup
     WHERE scope=$scope AND operation=$operation AND key=$key
     FOR UPDATE;
    If no row: ROLLBACK and return a bounded retryable contention outcome.
    If fingerprints differ: ROLLBACK; return key-reuse mismatch, no business write.
    If completed: authorize access to the result under current policy;
                 finish read transaction; return the stored application outcome.
    If processing: ROLLBACK; report in-progress; never run a second command.

On cancellation, infrastructure error, or failed business write: ROLLBACK.
On uncertain COMMIT outcome: report outcome unknown; resolve using the SAME key.
```

`processing` is **never intentionally committed**: `absent -> processing (uncommitted) -> completed (commit)` or `processing -> absent (rollback)`. Bound unique-conflict waits; timeout means documented contention, not proof the other attempt rolled back. Visible `processing` detects incompatible/corrupt workflows, not permission for age-based takeover.

Cache only approved terminal rejections. A SQL constraint error aborts the transaction: roll back a correctly scoped savepoint before recording an outcome, or roll back the attempt without caching. Never update an aborted transaction or treat infrastructure failure as automatically terminal.

Define HTTP mappings in the API contract: e.g. same resource/status on semantic replay, distinct `409` mismatch, documented contention/retry outcome. These are choices, not universal mandates. This algorithm replays **semantic application results**, not old headers/JSON bytes; exact HTTP replay needs a bounded versioned public snapshot persisted transactionally outside domain types.

Deletion permits re-execution: retain through the client retry window, lock against in-flight cleanup, never expire merely slow work, and enforce permanent uniqueness separately. Bound per-principal keys/bytes. An in-memory check or saving the key after business writes races/crashes; a separately committed reservation instead needs a full recovery protocol.

**Verify:** concurrent equal keys yield one effect/equal results; changed semantics mismatch without writes; crashes before/after commit and response loss; current replay authorization, scope isolation, lock timeout, terminal rejection, retention. A key table cannot make a provider call atomic.

## 6. Domain facts are not integration contracts

Domain facts such as `UserRegistered` express model meaning without JSON/topics/broker clocks/publication APIs; ordinary method results may suffice. Facts raised before commit do not prove persistence.

Integration events are versioned external contracts mapped from committed application intent, exposing only permitted fields—not whole domain/Ent objects.

Scoped envelope example; imports: `encoding/json`, `time`. The transaction supplies stable IDs/sequence, never regenerated on publish:

```go
type IntegrationEvent struct {
    ID               string          `json:"id"`
    Type             string          `json:"type"`
    SchemaVersion    int             `json:"schema_version"`
    AggregateID      string          `json:"aggregate_id"`
    AggregateVersion int64           `json:"aggregate_version"`
    OccurredAt       time.Time       `json:"occurred_at"`
    CorrelationID    string          `json:"correlation_id,omitempty"`
    Payload          json.RawMessage `json:"payload"`
}
```

Aggregate/version fields require an actual ordering model; simple CRUD need not invent aggregates or expose email. IDs are unique in a documented producer namespace; correlation IDs are not deduplication IDs. No secrets/tokens in payloads/baggage.

## 7. Transactional outbox: durable intent, not atomic delivery

**Required when committed local changes must produce external events.** Business writes and immutable outbox intent share one transaction. Publishing before commit exposes rolled-back state; publishing afterward without durable intent loses events on crash. Outbox closes that dual-write gap, not exactly-once delivery or eventual success without workers/recovery.

**Real PostgreSQL SQL** for a persistence adapter; the application supplies unique event IDs and fresh lease tokens:

```sql
CREATE TABLE event_outbox (
    id uuid PRIMARY KEY,
    envelope jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    attempts integer NOT NULL DEFAULT 0,
    lease_token uuid,
    lease_until timestamptz,
    published_at timestamptz,
    last_error_code text,
    CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE INDEX event_outbox_pending
    ON event_outbox (available_at, created_at, id)
    WHERE published_at IS NULL;

-- Execute in the same transaction as the business write.
INSERT INTO event_outbox (id, envelope) VALUES ($1, $2);

-- Claim a bounded batch in a short transaction; $1 is a fresh claim token,
-- $2 a positive bounded batch size, $3 a bounded lease interval.
WITH candidates AS (
    SELECT id FROM event_outbox
     WHERE published_at IS NULL
       AND available_at <= clock_timestamp()
       AND (lease_until IS NULL OR lease_until < clock_timestamp())
     ORDER BY created_at, id
     FOR UPDATE SKIP LOCKED
     LIMIT $2
)
UPDATE event_outbox AS o
   SET lease_token = $1,
       lease_until = clock_timestamp() + $3::interval,
       attempts = attempts + 1
  FROM candidates AS c
 WHERE o.id = c.id
RETURNING o.id, o.envelope, o.attempts;

-- Only after the configured broker durability/routing confirmation:
UPDATE event_outbox
   SET published_at = clock_timestamp(), lease_token = NULL, lease_until = NULL,
       last_error_code = NULL
 WHERE id = $1 AND lease_token = $2 AND published_at IS NULL;

-- On a known failed attempt, schedule bounded backoff; use a safe code,
-- not raw provider payloads. The old owner cannot clear a newer lease.
UPDATE event_outbox
   SET available_at = $3, last_error_code = $4,
       lease_token = NULL, lease_until = NULL
 WHERE id = $1 AND lease_token = $2 AND published_at IS NULL;
```

**Publisher algorithm:** claim/commit, publish the immutable envelope with its original ID, await documented broker durability/routing confirmation, then mark published with the claim token and require one updated row. Stale tokens cannot overwrite newer ownership. Network timeout must be shorter than the lease; claim only work that can start in time and renew conditionally when needed. Expired leases recover crashes. Under the approved recovery policy, quarantine exhausted/poison work durably instead of retrying forever.

Leases fence **database bookkeeping**, not a paused worker's send. Lost confirmation or death before `published_at` causes duplicate publication even with one worker. Choose broker durability/routing/retention and consumer deduplication accordingly; a RabbitMQ confirm does not mean consumer completion.

`SKIP LOCKED` can skip an earlier locked event: this table promises **no strict order**. If required, claim only the next stream sequence, serialize publishing, select the broker partition key, and enforce consumer sequence handling. Do not impose ordering on unrelated users.

## 8. Consumer inbox: commit first, acknowledge second

**Required when repeated delivery must not repeat a local effect.** Identity is `(consumer_name, event_id)` within a documented producer namespace. Use a stable logical handler/projection version, not replica ID; retain enough content identity to detect reuse.

**Real PostgreSQL schema:**

```sql
CREATE TABLE consumer_inbox (
    consumer_name text NOT NULL,
    event_id text NOT NULL,
    payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
    processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (consumer_name, event_id)
);
```

**Consumer transaction/acknowledgment pseudocode:**

```text
Receive with manual acknowledgment and bounded prefetch/concurrency.
Validate producer, envelope, schema, size, and routing/tenant authorization.
Compute stable semantic envelope hash (exclude delivery attempt metadata).
BEGIN;
INSERT INTO consumer_inbox(consumer_name, event_id, payload_hash)
VALUES ($consumer, $id, $hash)
ON CONFLICT (consumer_name, event_id) DO NOTHING
RETURNING event_id;

If inserted:
    Enforce expected stream sequence if the consumer requires ordering.
    Apply local business/projection writes using THIS transaction.
    Insert a local outbox row for any required downstream work.
Else:
    Read stored hash in a new statement.
    If absent or hash differs: rollback; quarantine/alert, do not silently accept.
    If equal: no repeated business write.
COMMIT;
Only after a known successful commit: acknowledge this delivery.
On known rollback/transient failure: no success acknowledgment; bounded redelivery.
On unknown commit outcome: do not acknowledge as success; redelivery resolves via inbox.
```

Crash before commit rolls back; crash after commit/before ack or ack loss redelivers, suppressing only the repeated **local database** effect. Ack-first loses work; separate inbox commits can suppress work that never happened. Neither inbox nor outbox deduplicates external provider calls.

Kafka offsets must not pass earlier unfinished partition records; Kafka transactions do not encompass unrelated PostgreSQL work. Retain inbox identities through broker replay/redelivery horizons; deletion or renamed consumers can reapply effects. Delivery tags/broker IDs are not necessarily stable event identities.

### Ordering, schema evolution, and poison messages

**Needs project decision:** ordered-every-event, latest-state, or commutative semantics. With sequence ordering, store cursor and effect atomically; apply `n` only at `n-1`. Verify duplicate/stale semantics for `n <= current`; park gaps without a processed inbox entry. Bound/own reordering, rebuild and gap repair; uniqueness alone cannot order events.

- Preserve event identity and meaning on replay. Add compatible fields/defaults; incompatible meanings/types need new schema/event versions and mixed-version rollout.
- Validate schema before effects. Unsupported/malformed poison data cannot loop forever.
- Quarantine identity, safe reason and attempt history durably with access controls. Ack/remove only after confirmed durable broker parking or local quarantine. “Publish DLQ, then ack” has another dual-write window: deduplicate duplicates and never accept loss from unconfirmed forwarding.
- Authorize/rate-limit redrive. Corrections may need a new identity under an explicit contract, never mutated history under a processed ID.

**Verify:** process death at database/broker boundaries, duplicates/reordering, paused stale publisher, lost confirms/acks, changed-content IDs, poison/unknown schemas, old backup plus broker replay. Assert scoped effects/recovery, not distributed “exactly once.”

## 9. Irreversible provider work and reconciliation

**Required with external effects.** Ordinary transactions cannot span PostgreSQL, an arbitrary broker and payment/email/shipping APIs. A slow provider call inside a DB transaction cannot be undone by rollback.

Durable operation workflow:

1. In a local transaction, validate authorization/invariants, reserve the business operation, record a stable provider operation key and normalized intent, and enqueue required work. Commit.
2. A bounded worker claims the operation. It calls the provider **outside** the database transaction, using the same provider idempotency key on every attempt only when that provider's contract supports it.
3. On definite provider success, persist the provider reference and local success transition atomically with any outgoing event. On definite terminal rejection, persist the corresponding business state.
4. On timeout, connection loss, or crash after submission, persist/retain an `unknown` or `pending_reconciliation` state. Query the provider by stable operation key/reference or process a verified webhook; a negative lookup may itself be eventually consistent. Reconcile under a bounded policy before resubmitting.
5. If the provider has neither usable idempotency nor authoritative lookup, automatic retries cannot guarantee no duplicate effect. Escalate ambiguous operations for a project-approved manual resolution path rather than returning fabricated success or failure.

Provider key scope, mismatch/concurrency behavior and retention bound retry safety; local retention cannot extend them. Never renew safety by choosing a new key after expiry. Handle quotas/auth failures explicitly. Verified webhooks may precede responses or repeat: deduplicate, guard transitions and investigate contradictions.

Use a saga **only when independently committed business steps require coordinated recovery**. Persist step state, attempt identity, outcome and next action; conditional transitions prevent duplicate local advancement. Compensation is a new action, not rollback: refunds can fail and email cannot be unsent. Approve compensability, order, authority, deadlines and stuck-work owner. Prefer a local transaction for one DB; engines are optional.

`charge(); saveOrder()` can charge despite a failed save; `saveOrder(); charge(); markPaid()` can strand/recharge without durable pending state/reconciliation.

**Verify:** accepted-but-disconnected call, worker death before local success, racing/late webhooks, failed compensation, expired deduplication and stale negative lookup. Require stable logical identity, truthful pending/unknown state and reachable repair under the actual provider contract.

## 10. Adoption and operational evidence

Record each adopted guarantee, failure window, numerical configuration and recovery owner in the project handbook. Proposed budgets are not approved policy. When operating it, read [security and operations](security-and-operations.md) for credentials/telemetry/shutdown/restore; when selecting evidence, read [testing and evolution](testing-and-evolution.md).

The section verification cases are conditional on the adopted feature. Durable-delivery claims additionally need an alertable backlog, authorized redrive and practiced recovery. The [runnable local example](../../examples/go) supplies layered SQLite checks—not production authentication, broker delivery or provider reconciliation.
