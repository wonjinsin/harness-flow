# Reliability, idempotency, and events

Use this reference to put a precise guarantee around a side effect, not to turn every CRUD application into a distributed system. Start with [architecture](architecture.md), [layers](layers.md), and [data and transactions](data-and-transactions.md). Adopt only mechanisms justified by the actual failure model; record unresolved product decisions using [adoption](../adoption.md).

Application transactions, reliable event delivery, idempotency storage, and provider reconciliation require explicit implementation when applicable; do not infer them from the layer layout. Do not discard service context or replace it with repository `context.Background()`. `TrID` correlates requests; it cannot make any operation atomic.

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

A database constraint and a request deadline are often the entire solution for local CRUD. Do not introduce a broker to replace a function call or retry every error to hide a weak boundary.

### Placement

- `internal/core/domain`: invariants and domain facts; no HTTP client, broker, Ent, or retry loop.
- `internal/core/port/in` (`inport`): context-aware use cases and application results.
- `internal/core/service`: use-case order, transaction scope, and decisions about recoverable business states.
- `internal/core/port/out` (`outport`): context-aware repositories, transaction-scoped capabilities, provider operations, and durable event recording as required.
- `internal/adapter/in/http`: parse the key, authenticate, validate input, invoke the input port, and map typed outcomes to HTTP. Do not implement a second business workflow in middleware.
- `internal/adapter/out/persistence`: database transactions, idempotency/inbox/outbox storage, serialization, and constraint translation. Bind every participating repository to the same transaction.
- Outbound provider adapters: HTTP protocol, credentials, provider error translation, and provider-documented retry rules. Add an adapter directory only if the integration exists.
- `cmd/api/main.go`: own reusable clients, database pools, workers, startup, and shutdown. A separate publisher executable is optional, not a requirement.

## 2. Deadlines and cancellation are resource ownership

**Required baseline.** Accept `context.Context` as the first argument of I/O-bearing ports and pass it through every layer. Do not store a request context on a reusable service, replace it with `context.Background()`, or use values in it as a substitute for explicit business arguments. A child timeout can shorten but cannot extend its parent's lifetime.

Section-scoped Go example for a provider adapter; imports are `context`, `encoding/json`, `errors`, `fmt`, `io`, `net/http`, `net/url`, and `time`. `baseURL` is a validated, trusted HTTPS configuration value, not user input. Construct this adapter once in composition and reuse its owned HTTP client across calls. This read operation has no automatic retry:

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

The status vocabulary above is illustrative integration data, not a domain policy for User. Translate it to project-owned application types at the outbound boundary. Provider bodies may contain secrets; do not include them in returned errors.

`Client.Do` does not turn non-2xx statuses into Go errors. Close the body on every successful `Do`, including error statuses. Reading to EOF and closing enables connection reuse when supported; deliberately stop at the size limit rather than draining an unbounded response just to reuse a connection. Reuse clients/transports. Configure connection/TLS/header budgets and connection pool limits in composition where required by load; `Client.Timeout` includes reading the response body. Streaming endpoints need different budgets rather than globally disabling every timeout.

**Wrong:** `http.Get(url)` in a service with no context, unbounded `io.ReadAll`, and an unclosed body. Failures consume connections and memory after the caller has gone away.

**Verification:** cancel before dispatch and during body reading; assert prompt return and no persisted success. Serve oversized, malformed, slow, redirect, and non-2xx responses using an HTTP test server; assert bodies are closed and provider details do not enter public output. Cancellation does not prove a remote side effect did not happen.

## 3. Retry only an operation whose semantics permit it

**Required when retries are adopted.** Before retrying, establish all of these:

1. The failure is classified as transient by the dependency contract, not merely `err != nil` or every `5xx`.
2. Repeating the operation is safe: it is read-only, naturally idempotent, or uses the same durable operation key against a provider that actually supports it.
3. Attempts plus backoff fit a total deadline, with a finite attempt count, per-attempt timeout, and capacity budget.
4. Only one layer owns the retry policy; account for SDK, proxy, broker, and caller retries to avoid multiplicative load.
5. Each attempt has a fresh request/body and closes its response. Respect bounded `Retry-After` delays where the provider contract requires them.

This helper is a complete, section-scoped policy example for a **read-only** callback. Imports: `context`, `errors`, `math/rand`, and `time`. `transient` is an adapter-specific classifier; it must not classify validation/authentication errors or permanent not-found as transient without a documented consistency contract.

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

Do not apply this helper to payment submission or a database transaction that already made external calls. For a serialization/deadlock retry, restart the **entire local transaction** with fresh transaction-scoped repositories; keep irreversible work outside it. A commit connection failure may leave the commit outcome unknown; do not assume rollback or retry with a new identity. A circuit breaker cannot establish idempotency or recover an unknown outcome.

**Verification:** assert exact maximum attempts, cancellation during backoff, no retry on permanent errors, and stable operation identity across attempts. Fault-inject an accepted request followed by connection loss. A retry that creates a second external effect is not reliable.

## 4. Bound concurrency and name the owner

**Required baseline.** Every goroutine needs an owner that cancels and waits for it, every channel needs one closing owner, and every shared mutable value needs synchronization or exclusive ownership. A request must not launch an untracked goroutine for required work. Request cancellation ends request-owned work; durable work belongs to a persisted job and process-owned worker.

For a finite, independent **read-only** batch, the following section-scoped Go function uses `golang.org/x/sync/errgroup`; imports are `context`, `errors`, and that package. Choose the limit from the downstream budget, not the number of input elements:

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

`Go` may block at the limit; callbacks must honor cancellation so the owner can finish. The group-derived context is canceled when `Wait` returns: do not use it for subsequent work. This bounds active callbacks but does not make an unbounded input slice safe; enforce a batch limit at ingress. Do not concurrently use a transaction unless its driver/ORM explicitly supports that behavior. Parallel writes require a separate consistency design, not this read-batch helper.

**Wrong:** `go sendEmail(context.Background(), user)` followed by HTTP success. A process crash loses the email; shutdown cannot wait for it, and background errors are unobserved.

**Verification:** assert peak active calls never exceeds the limit, all launched calls have ended before return, cancellation unblocks dispatch, and shared output has no races. For optional best-effort work, explicitly document that loss is acceptable instead of claiming durable delivery.

## 5. An idempotent HTTP command is a state machine

**Required when duplicate commands would violate the product contract.** An idempotency key identifies one logical command within a defined scope; it is neither authentication nor a replacement for a business uniqueness constraint. Authenticate and authorize every attempt, including replay. Never return another principal's cached result just because a key matches.

**Needs project decision:** key format and maximum length; whether the API requires it; authenticated principal/tenant scope; operation/API version; fingerprint normalization; replay retention and privacy; replay of terminal business rejection; and response semantics after retention. The fields below are an illustrative extension, not authority to add tenancy or an identity policy.

A defensible scope is `(trusted_scope, operation_version, key)`, where `trusted_scope` comes from verified server-side identity/membership policy. If the API is public, design an explicit safe scope rather than silently substituting a caller-supplied user ID. Fingerprint normalized semantic command fields with a stable versioned encoding and SHA-256; include every field/header that changes the operation. Do not hash a Go map with unspecified custom serialization. A fingerprint is not encryption; avoid retaining unnecessary personal input.

### Local-only command: atomic reservation, effect, and result

The following is **real PostgreSQL schema** for the local transaction algorithm. `result` is an application result serialized by the persistence mapper; it is not an Ent object or an arbitrary HTTP response. Size limits and retention are project configuration.

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

The following is **transaction pseudocode**, not standalone Go or one SQL statement. All SQL uses bound parameters. It assumes PostgreSQL `READ COMMITTED`; a conflict followed by a **new statement** can observe the concurrent winner. Do not combine the insert and fallback read into one snapshot-dependent CTE and assume it always returns a row.

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

Here `processing` is transaction-local and **never intentionally committed**. State transitions are `absent -> processing (uncommitted) -> completed (commit)` or `processing -> absent (rollback)`. Concurrent insertions wait on the unique conflict; use a bounded lock wait/deadline. Map that wait's expiration to the documented in-progress/retry response, not to proof of rollback by the other request. The `processing` fallback detects incompatible/corrupt older workflows; do not implement timestamp-based takeover in this algorithm.

A known business rejection can be recorded without a business effect. If a SQL constraint error aborts the transaction, use a correctly scoped savepoint and rollback to it before recording a terminal outcome, or roll back the entire attempt and do not cache it. Do not issue `UPDATE` in an already aborted transaction. Decide which rejections are replayable; transient infrastructure failures are not automatically terminal results.

At the HTTP boundary define a stable mapping, for example semantic success replay uses the original resource ID and values with the same documented status; mismatch uses a distinct `409` code; an in-progress request uses a documented conflict/retry response. These are API choices, not universal status mandates. This algorithm promises **semantic application-result replay**, not byte-for-byte preservation of old headers or JSON. If exact HTTP replay is required, define a versioned, bounded public response snapshot and its transactional persistence explicitly; do not serialize transport types into the domain.

Retention is part of the guarantee: after a row is deleted, the same key may run again. Keep rows at least through the documented client retry window, handle in-flight cleanup with database locking, and use independent business uniqueness for permanent uniqueness. Do not expire a key merely because processing is slow. Limit per-principal key creation and retained bytes.

**Wrong:** check an in-memory map, insert the business row, then save the key. Two replicas race, or a crash occurs between the business insert and key storage. Likewise, committing a reservation first and calling it atomic leaves a stuck reservation unless a complete durable recovery protocol exists.

**Verification:** race identical keys; exactly one local effect and equal replayed results must remain. Change one semantic field with the same key; assert mismatch and no new write. Crash before commit, after commit, and before the HTTP response. Check replay after response loss, current authorization on replay, cross-scope isolation, lock timeout, terminal rejection, and retention behavior. A provider call inside this transaction is **not** made atomic by the key table.

## 6. Domain facts are not integration contracts

A domain event expresses a fact meaningful inside the model, such as `UserRegistered`; a plain method result is sufficient if no event abstraction is needed. Domain code may return facts without importing JSON, topics, timestamps from the broker, or publication APIs. A domain fact raised before commit is not evidence of a committed change.

An integration event is an explicitly versioned external contract produced from committed application intent. Map it in the application/outbound boundary, selecting only information consumers are allowed to see. Do not publish the entire domain object or an Ent entity.

Section-scoped Go envelope example; imports are `encoding/json` and `time`. Its IDs and sequence are supplied by the application's transaction, not generated again for each publish attempt:

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

The aggregate/version fields are appropriate only when the project has that ordering model. A simple User CRUD project need not invent aggregates or publish user email. IDs must be unique in the documented producer namespace; correlation IDs are not deduplication IDs. Do not put secrets or access tokens in payloads or trace baggage.

## 7. Transactional outbox: durable intent, not atomic delivery

**Required when a committed local change must eventually produce an external event.** In one database transaction, update business state and insert the immutable event envelope into an outbox. Publishing before commit can expose rolled-back state; publishing after commit without an outbox can lose the event on a crash. The outbox solves this local dual-write gap. It does not make broker delivery exactly once or guarantee eventual success without functioning workers and recovery.

**Real PostgreSQL SQL**, adapted by a persistence adapter; IDs and lease tokens are generated by the application using a suitable unique ID source:

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

**Publisher algorithm pseudocode:** claim and commit; publish each claimed immutable envelope with the same event ID; wait for the broker's documented durable/routing confirmation; then mark published with the claim token and require one row updated. A stale token means ownership changed: do not overwrite the new owner's state. Use a network timeout shorter than the lease, claim only work that can start in time, and renew a lease conditionally if necessary. On crash, expired leases are reclaimable. Monitor exhausted attempts and route to a durable failed/quarantined state under a defined recovery policy instead of retrying poison data forever.

A lease fences **database bookkeeping**, not a paused worker's broker send. If the broker accepted a message but its confirmation was lost, or the process died before `published_at`, a later worker publishes it again. Even a single publisher can produce duplicates. Use broker durability, routing failure detection, retention, and consumer deduplication appropriate to the selected broker. A RabbitMQ publisher confirm does not mean any consumer completed its work.

`SKIP LOCKED` is useful for work queues but does **not** provide per-aggregate order: another worker can skip a locked earlier event. The simple table above promises no strict ordering. If strict per-stream order is required, claim only the next sequence per stream, serialize that stream's publishing, choose an appropriate broker partition key, and enforce sequence handling at the consumer. Do not add strict ordering for unrelated users without a requirement.

## 8. Consumer inbox: commit first, acknowledge second

**Required when repeated delivery must not repeat a local effect.** Identity is `(consumer_name, event_id)` in a documented producer namespace. `consumer_name` denotes a stable logical handler/projection version, not a process/replica ID. Store sufficient information to detect an event ID reused with different semantic content.

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

Crash before commit: transaction rolls back and redelivery can apply the effect. Crash after commit but before ack: delivery repeats and the inbox suppresses the repeated **local database** effect. Ack failure has the same duplicate window. Acknowledging first loses work if the transaction later fails. An inbox row written in a separate transaction can suppress work that never happened. Neither inbox nor outbox deduplicates a provider call outside the database.

For a partitioned log such as Kafka, do not commit an offset past an earlier unprocessed record in the same partition. Kafka transaction guarantees do not automatically extend to an unrelated PostgreSQL transaction; use the same local inbox reasoning. Keep inbox records through the broker replay/redelivery horizon; deletion or resetting `consumer_name` can reapply old effects. Broker message IDs/delivery tags are not necessarily stable event identities.

### Ordering, schema evolution, and poison messages

**Needs project decision:** whether a consumer needs every event in order, only the latest state, or commutative updates. With a sequence model, atomically store the last applied version with the effect: apply `n` only when the current version is `n-1`. Treat `n <= current` according to verified duplicate/stale semantics; treat a gap as a parked/deferred record, not a successfully applied inbox entry. Reorder buffering, snapshot rebuilding, and gap repair need explicit bounds and ownership. An inbox unique key alone does not solve ordering.

- Preserve immutable event IDs and event meaning across retries and replay. Do not regenerate the event ID per attempt.
- Prefer additive compatible fields with documented defaults; readers should tolerate unknown fields where the contract allows. Do not change the meaning or type of an existing field silently. Use a new schema/event version for incompatible changes and support mixed producers/consumers during rollout.
- Validate schema/version before applying effects. An unsupported version or irreparably malformed payload is a poison message, not a reason for an endless tight requeue loop.
- Quarantine durably with event identity, safe reason, attempt history, and access controls. Acknowledge/remove the original only after the selected broker's durable dead-letter/parking mechanism or a durable local quarantine record is confirmed. A custom “publish to DLQ, then ack” has its own dual-write window; duplicates must be acceptable and deduplicable, and loss on an unconfirmed DLQ send is not acceptable.
- Redrive needs an operator procedure, authorization, rate limits, and idempotency. A fixed event may require a new event identity under a defined correction contract; do not mutate historical content under an already processed ID.

**Verification:** inject process death between every database/broker boundary; duplicate and reorder deliveries; expire a publisher lease while the old worker is paused; lose confirms/acks; reuse an ID with changed content; send unknown schema and poison data; restore an old database backup and replay the broker. Assert the documented local effects and recovery states, not an unqualified “exactly once.”

## 9. Irreversible provider work and reconciliation

**Required when the use case includes an external effect.** There is no ordinary atomic transaction spanning a local database, an arbitrary broker, and a payment/email/shipping API. Do not keep a database transaction open during a slow provider call and claim that rollback undoes it.

A durable external-operation workflow can be:

1. In a local transaction, validate authorization/invariants, reserve the business operation, record a stable provider operation key and normalized intent, and enqueue required work. Commit.
2. A bounded worker claims the operation. It calls the provider **outside** the database transaction, using the same provider idempotency key on every attempt only when that provider's contract supports it.
3. On definite provider success, persist the provider reference and local success transition atomically with any outgoing event. On definite terminal rejection, persist the corresponding business state.
4. On timeout, connection loss, or crash after submission, persist/retain an `unknown` or `pending_reconciliation` state. Query the provider by stable operation key/reference or process a verified webhook; a negative lookup may itself be eventually consistent. Reconcile under a bounded policy before resubmitting.
5. If the provider has neither usable idempotency nor authoritative lookup, automatic retries cannot guarantee no duplicate effect. Escalate ambiguous operations for a project-approved manual resolution path rather than returning fabricated success or failure.

Provider idempotency has scope, parameter-mismatch rules, retention, and concurrent-request behavior. Local key retention cannot extend a provider's shorter guarantee. Do not retry after the provider's deduplication window with a new key and call it safe. Rate limits and authentication failures also need explicit handling. Verified webhooks can arrive before the synchronous response or repeat; deduplicate and apply guarded state transitions, and reject contradictory transitions for investigation.

A saga is **required only when** a business workflow spans independently committed steps and needs coordinated recovery. Persist each step's state, attempt identity, outcome, and next action; make transitions conditional so duplicate workers cannot advance a step twice locally. Compensation is a new business action, not rollback: a refund may fail or differ from cancellation, and email cannot be unsent. Decide which steps are compensable, the ordering, authorization, deadlines, and who resolves stuck workflows. Use a workflow engine only when it earns its complexity; a local transaction is preferable for one database.

**Wrong:** `charge(); saveOrder();` followed by `return err` if the save fails. The charge remains even though the caller sees failure. Also wrong: `saveOrder(); charge(); markPaid();` with no durable pending state or reconciliation; a crash can strand the order or cause a second charge.

**Verification:** provider accepts then drops the response; worker dies before local success; webhook races with synchronous completion; provider returns a late success after local timeout; compensation fails; provider deduplication expires; reconciliation lookup is temporarily stale. Assert one stable logical operation, truthful pending/unknown state, auditable transitions, and a reachable repair procedure. Use the actual provider's idempotency contract rather than assuming a universal provider guarantee.

## 10. Adoption and operational evidence

Before declaring a mechanism operational, document its scope and failure windows in the project-owned handbook. Link to [security and operations](security-and-operations.md) for credentials, metrics, shutdown, and recovery, and [testing and evolution](testing-and-evolution.md) for the test strategy. The [runnable Go example](../../examples/go) demonstrates a local layered boundary; it does not supply production-complete authentication, broker delivery, or provider reconciliation.

Minimum evidence is conditional on the adopted feature:

- **All projects:** cancellation propagation, finite resource budgets, constraint conflict mapping, no leaked body/rows/goroutines, and safe public failures.
- **Idempotent commands:** concurrent duplicates, mismatch, response loss, commit uncertainty, retention, and replay authorization.
- **Events:** atomic business/outbox writes; duplicate publishing; inbox effect atomicity; commit-before-ack; poison handling; ordering and schema compatibility where promised.
- **External effects:** ambiguity, stable provider identity, reconciliation, and compensation/manual repair where required.

An alertable backlog, a redrive runbook, and a practiced recovery path are part of a durable-delivery claim. A table named `outbox` is not evidence that those guarantees hold.
