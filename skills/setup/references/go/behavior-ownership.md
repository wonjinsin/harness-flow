# Behavior ownership and top-to-bottom readability

**Required baseline:** orchestration reads top to bottom at one level of abstraction, without making readers reconstruct predicates, collection algorithms, or conversion details. This is ownership, not a length limit.

Place each decision beside the values whose meaning it defines, including read models/collections. Rich aggregates, private fields, and a class per rule are optional; behavior ownership is not. Before placing behavior use [architecture](architecture.md); for boundary implementations/types use [layers](layers.md) and [coding conventions](coding-conventions.md).

## Choose the owner by meaning

| Behavior | Owner | Must not own |
| --- | --- | --- |
| Eligibility, composed validation, transitions, business totals, canonical matching | Domain entity, value, collection/read model, or cohesive pure domain function | HTTP/ORM types, repository calls, clocks, transactions |
| Command/query normalization, use-case input bounds, result pagination | Application command/query/result or cohesive application function | HTTP parsing, business policy copied from domain |
| Wire syntax, omitted/null/value semantics, field allowlists, response formatting | Transport DTO or adapter-local mapper/decoder | Business eligibility, repository access, use-case execution |
| Stored-null conversion, hydration, write-field mapping, already-loaded query shapes | Handwritten persistence record/helper or adapter-local mapper | Business decisions, hidden lazy queries, generated-code edits |
| Load/authorize/call/save, transaction scope, deadlines, external effects | Application service; handlers and repositories retain their protocol/I/O control flow | Reimplementing the above policies and transformations inline |

Use a receiver method or a named pure function spanning supplied values. DTO/DAO representation behavior is valid, business policy there is not. Do not create DTOs/wrappers merely for receivers or edit generated models; use owned mappers/generation inputs.

## Write the story, then place the details

Trace a real service, handler, and repository:
actual code → meaning → owning type/package/API → orchestration call → direct behavioral check.
Distinguish current gaps from targets.

Show the resulting orchestration as target-language code, not only prose or an
owner table. Calls name inputs, outcome and mutation; guard failures beside each
step. Keep one abstraction level. Trivial forwarding/vague `process` helpers add
navigation rather than meaning.

Calling `ValidateCandidate` and `CheckActiveCategory` still leaves ownership wrong if service composes their predicate, counts invalid rows, or matches merchants. Those decisions/algorithms belong in domain, not private service helpers, repositories, DTOs, or `utils`.

Keep applicable load, authorization, domain-check and save calls with their
error/transaction ordering. Under a word limit, trim explanation, not protected
steps. A scoped fragment identifies already-completed checks without inventing
policy. Adapters may branch while decoding/querying; no `if`/`for` ban, line-count
quota or Manager/Facade/interface for simple CRUD/direct mapping.

## Worked fragment: assess a review

Scoped `internal/core/domain/review.go` fragment, extending existing `Candidate`, `Category{ParentID}`, `ReviewSummary` (three counters), `Review{Import,Drafts,Summary}`, and unchanged pure `ValidateCandidate`, `CheckActiveCategory`, `MerchantKey` policies. No imports are needed here.

`Candidate`, `IncludedReview`, `DuplicateMatch` are values/projections. `Category`/`Draft` are entities: use category pointers, pointer-taking `CheckActiveCategory`, and `Review.Drafts` as defined `type Drafts []*Draft`, with nonnil elements.

Snapshot success guarantees all import-wide included rows (not just the page) and one correctly aligned duplicate group per visible draft. Invalidity counts once per row, independently of classification. Matching appends warnings to prior IDs in candidate order with repeats, not fuzzy matching/exclusion.

A nonempty `CategoryID` requires loaded nonnil Category and Parent, including a root parent with empty `ParentID`; a nonempty grandparent ID is invalid. Missing references are invalid. Empty `CategoryID` neither requires nor consults references; candidate validation/classification still apply.

```go
package domain

type IncludedReview struct {
    Candidate            Candidate
    CategoryID           string
    UnclassifiedAccepted bool
    Category             *Category
    Parent               *Category
}

func (row IncludedReview) NeedsClassification() bool {
    return row.CategoryID == "" && !row.UnclassifiedAccepted
}

func (row IncludedReview) Invalid(owner string) bool {
    if ValidateCandidate(row.Candidate) != nil {
        return true
    }
    if row.CategoryID == "" {
        return false
    }
    if row.Category == nil || row.Parent == nil {
        return true
    }
    return CheckActiveCategory(owner, row.Category, row.Parent) != nil || row.Parent.ParentID != ""
}

type IncludedReviews []IncludedReview

func (rows IncludedReviews) AccumulateSummary(owner string, summary ReviewSummary) ReviewSummary {
    for _, row := range rows {
        summary.Included++
        if row.NeedsClassification() {
            summary.NeedsClassification++
        }
        if row.Invalid(owner) {
            summary.Invalid++
        }
    }
    return summary
}

type DuplicateMatch struct{ ID, Merchant string }
type DuplicateMatches []DuplicateMatch

func (matches DuplicateMatches) AppendMatchingIDs(ids []string, merchant string) []string {
    key := MerchantKey(merchant)
    for _, match := range matches {
        if MerchantKey(match.Merchant) == key {
            ids = append(ids, match.ID)
        }
    }
    return ids
}

func (review *Review) ApplyAssessment(owner string, included IncludedReviews, duplicates []DuplicateMatches) {
    if review.Import.Status == "uploading" {
        review.Import.Status = "processing"
    }
    review.Summary = included.AccumulateSummary(owner, review.Summary)
    for i := range review.Drafts {
        draft := review.Drafts[i]
        draft.DuplicateIDs = duplicates[i].AppendMatchingIDs(draft.DuplicateIDs, draft.Merchant)
    }
}
```

Assessment mutates a caller-owned fresh response and may reuse backing slices: apply once, never share concurrently or claim idempotency/immutable copies. It reads no clock/I/O and changes uploading → processing only in the response, not stored lifecycle. Reuse an equivalent existing policy. Resolve missing/misaligned duplicate groups at the outbound contract; never truncate/pad them or copy whole snapshots to extract calculations.

The service keeps its snapshot load and lifetime/error handling, then reads:

```go
result := snapshot.Review
if err := domain.CheckImportLifetime(result.Import, now); err != nil {
    return result, err
}
result.ApplyAssessment(owner, snapshot.Included, snapshot.Duplicates)
return result, nil
```

Move pure input types from `core/port/out` to domain and migrate ports, mappings, service, and tests without aliases. The snapshot container may stay in the port referring to domain; domain never imports the port.

Read assessment is not confirmation authority: writes reload scoped state and reuse domain policies inside the service-owned concurrency-protected transaction. Extraction must not move reads outside locks or weaken constraints.

## Verify at the owner and at the boundary

- Direct domain cases: valid/invalid candidates; missing/accepted classification; active/archived/foreign categories; missing required references/deep parents. Multiple failures add Invalid once, independently of NeedsClassification.
- Summary/matching cases: empty input, prior counters/IDs, off-page included rows, canonical equality/nonmatches, empty groups, order/repeats. No server/database is needed.
- Transport cases: omitted/null/value and field allowlists. Persistence mapper cases: stored null/hydration. Pure checks prove neither wire compatibility nor atomicity.
- Service/real-adapter cases: denied/failed/scoped reads, cancellation, transaction/durable effects, rollback/constraints/concurrency—not helper-call counts.

Generated handbooks include a real before/after fragment and ownership trace. Read the final flow top to bottom without opening helpers; reuse accepted normalization/acceptance/tenancy/lifecycle rules rather than inventing policy to finish an example.
