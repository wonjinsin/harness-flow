# Behavior ownership and top-to-bottom readability

**Required baseline:** code should read like a book, naturally from top to bottom.
An orchestration method tells the operation's story at one level of abstraction;
its reader should not have to reconstruct a predicate, collection algorithm, or
representation conversion to understand the next step. This is a responsibility
rule, not a function-length limit. Use this chapter with [layers](layers.md), [architecture](architecture.md), and [coding conventions](coding-conventions.md).

Give each decision or transformation one owner beside the values whose meaning
it defines. This applies to read models and collections, not only constructors
and complex state transitions. Rich aggregates, private fields, and a class per
rule remain optional. Meaningful behavior ownership does not.

## Choose the owner by meaning

| Behavior | Owner | Must not own |
| --- | --- | --- |
| Eligibility, composed validation, transitions, business totals, canonical matching | Domain entity, value, collection/read model, or cohesive pure domain function | HTTP/ORM types, repository calls, clocks, transactions |
| Command/query normalization, use-case input bounds, result pagination | Application command/query/result or cohesive application function | HTTP parsing, business policy copied from domain |
| Wire syntax, omitted/null/value semantics, field allowlists, response formatting | Transport DTO or adapter-local mapper/decoder | Business eligibility, repository access, use-case execution |
| Stored-null conversion, hydration, write-field mapping, already-loaded query shapes | Handwritten persistence record/helper or adapter-local mapper | Business decisions, hidden lazy queries, generated-code edits |
| Load/authorize/call/save, transaction scope, deadlines, external effects | Application service; handlers and repositories retain their protocol/I/O control flow | Reimplementing the above policies and transformations inline |

Choose a method when behavior is naturally about its receiver; a named pure
function is equally valid for a decision spanning supplied values. A DTO or DAO
may have representation behavior, but is not a dumping ground for business
rules. Do not introduce a DTO for every internal struct or a DAO wrapper just to
obtain a method receiver. Extend generated models through owned mappers or
supported generation inputs, never by editing generated output.

## Write the story, then place the details

Trace a real service, handler, and repository before writing their target rules.
For each compound condition, derived field, nested loop, or mapping block, record:
actual code → meaning → owning type/package/API → orchestration call → direct
behavioral check. Distinguish an existing gap from the adopted target.

Name calls with the operation's vocabulary and make their inputs, result, and
mutation clear. Reading those calls in order must explain the successful flow;
guard clauses keep failures beside the step that fails. Keep a consistent level
of detail within each method, including the extracted behavior. Its name should
let the reader continue without opening its implementation. Splitting a coherent
calculation into trivial forwarding methods or vague `process`/`handle` helpers
only replaces a long block with navigation work.

A service calling `ValidateCandidate` and `CheckActiveCategory` is not enough if
it still combines their results, counts invalid rows, and filters merchant
matches itself. Composed decisions and collection algorithms need named owners
too. A private service helper shortens a method but does not correct ownership.
Moving that block into a repository, DTO, or catch-all `utils` is not a correction.

Keep error propagation, authorization orchestration, transaction callbacks, and
I/O iteration where the operation is coordinated. Decoding and query construction
may still branch in their adapters. Do not ban `if`/`for`, target a line count, or
force a forwarding Manager/Facade/interface per helper. Simple CRUD and direct
field mapping need no additional abstraction when they already tell the story.

## Worked fragment: assess a review

This Go fragment belongs in `internal/core/domain/review.go`. It extends a
project whose domain already supplies `Candidate`, `Category` (including
`ParentID`), `ReviewSummary` (three integer counters), `Review` (Import, Drafts,
Summary), and the pure `ValidateCandidate`, `CheckActiveCategory`, `MerchantKey`
policies. `Candidate` is a validation input value here, not an entity; `IncludedReview`
and `DuplicateMatch` are pure read projections and retain value semantics.
`Category` and `Draft` are entities: category references use `*Category`, and
`Review.Drafts` uses the defined plural `Drafts` (`type Drafts []*Draft`), with
nonnil drafts guaranteed by the loaded-snapshot contract. `CheckActiveCategory`
accepts category pointers. Adapt to the real project's vocabulary; these are
declared example policies, not universal requirements.

The snapshot supplies all included rows across the import, not only a visible
page. Duplicate candidate groups correspond positionally, one group per visible
draft, as guaranteed by the outbound contract. Existing candidate validity and
active owned category validation apply; a nonempty grandparent ID is also invalid.
Classification and invalidity counters are independent, with invalidity counted
once per row. IDs are warnings appended in candidate order, preserving repeats
and prior IDs. Canonical equality is not fuzzy matching or automatic exclusion.

When `CategoryID` is nonempty, the snapshot must supply nonnil Category and
Parent references, including a loaded root parent with an empty `ParentID`.
Omitted required references are invalid rather than dereferenced. When
`CategoryID` is empty, those references are not required and are not consulted;
candidate validity and the independent classification counter still apply.

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

`ApplyAssessment` mutates a caller-owned, freshly loaded response and may reuse
its slice backing storage; it does not promise immutable copies or idempotency.
Do not share it concurrently or apply it twice. It performs no I/O and reads no
clock. The status adaptation changes the response only, not the stored lifecycle.
Reuse an existing equivalent projection policy rather than duplicating it.
Do not silently truncate mismatched candidate groups; if alignment is not
established by the real adapter, resolve that contract before adopting this
fragment. Do not copy whole snapshots to extract these small calculations.

The service keeps its snapshot load and lifetime/error handling, then reads:

```go
result := snapshot.Review
if err := domain.CheckImportLifetime(result.Import, now); err != nil {
    return result, err
}
result.ApplyAssessment(owner, snapshot.Included, snapshot.Duplicates)
return result, nil
```

If supporting values currently live in `core/port/out`, move the pure input types
into domain and migrate the port, provider/repository mappings, service, and tests together.
The port's snapshot container may remain there, referring to domain inputs.
Domain must not import that port to borrow its types; do not leave obsolete aliases.

A read assessment is not confirmation authorization. A write still loads fresh,
scoped state and invokes the same domain policies inside the service-owned,
concurrency-protected unit of work. Moving a pure calculation must not move its
state reads outside locks or weaken database constraints.

## Verify at the owner and at the boundary

- Exercise eligibility directly with valid/invalid candidates, missing or
  explicitly accepted classification, active/archived/foreign categories, and
  excessive parent depth. Multiple failures increment Invalid once; a row may
  also increment NeedsClassification.
- Exercise summaries with empty inputs, prior counters, and included rows outside
  the visible page. Exercise matching with canonical equality, nonmatches, empty
  groups, prior IDs, order, and repeated IDs. Check values without booting a
  service, server, or database.
- Exercise DTO omitted/null/value behavior and allowed fields at the transport
  boundary; stored-null and hydration at the handwritten mapper. Pure conversion
  checks cannot establish wire compatibility or database atomicity.
- Keep service checks for denied/failed operations, scoped reads, cancellation,
  transaction outcome, and durable effects. Use the real adapter for rollback,
  constraint and concurrency claims, not helper-call counts.

Include a real before/after fragment and ownership trace in the generated
handbook, not just "thin services" or a folder diagram. Check the final flow by
reading it top to bottom: can a reader explain the operation without opening
helpers to discover what they do? Reuse accepted rules; do not invent
normalization, acceptance, tenancy, or lifecycle policy to complete an example.
