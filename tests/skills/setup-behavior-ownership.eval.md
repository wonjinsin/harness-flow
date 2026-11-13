# Setup behavior-ownership evaluations

Use fresh consumers with the selected checkout's `skills/setup/SKILL.md`.
Consumers retrieve relevant references on demand, not a pasted answer. Run the
same prompts before and after guidance changes. Inspect their actual handbook
passages and code fragments; a self-rating is not evidence. Do not replace these
behavior checks with assertions about particular words in the skill.

## Shared consumer instruction

This is a simulated, already-approved handbook refresh for an existing Go
project. Shared-handbook delivery for Claude Code, Codex, and OMP is approved;
existing locations and reader wiring stay unchanged. Read the setup skill and
applicable references. Produce the replacement handbook passage, concrete Go
fragments, and verification cases, not a review. Do not edit application files,
install guidance, commit, push, or claim unexecuted checks passed.

The project uses `internal/core/{domain,service,port/in,port/out}`, adapter-local
HTTP DTO and persistence mappers, and generated Ent records in
`adapter/out/persistence/dao/ent`. All policies in a case are supplied project
requirements, not policies to infer. Do not run builds, tests, linters, or
formatters while producing the passage.

## A. Review projection

### Consumer prompt

A repository-to-service refactor has just completed. Refresh the handbook for
this review workflow and show its resulting service and supporting APIs.
Preserve behavior and import direction.

`service.Review` loads a snapshot through an outbound port, checks import lifetime
against one captured UTC instant, adapts uploading to processing in this read
response only, then executes:

```go
for _, row := range snapshot.Included {
    result.Summary.Included++
    if row.CategoryID == "" && !row.UnclassifiedAccepted {
        result.Summary.NeedsClassification++
    }
    if domain.ValidateCandidate(row.Candidate) != nil || row.CategoryID != "" && (domain.CheckActiveCategory(owner, row.Category, row.Parent) != nil || row.Parent.ParentID != "") {
        result.Summary.Invalid++
    }
}
for i := range result.Drafts {
    key := domain.MerchantKey(result.Drafts[i].Merchant)
    for _, match := range snapshot.Duplicates[i] {
        if domain.MerchantKey(match.Merchant) == key {
            result.Drafts[i].DuplicateIDs = append(result.Drafts[i].DuplicateIDs, match.ID)
        }
    }
}
```

The outbound port currently declares `IncludedReview` with `Candidate
domain.Candidate`, `CategoryID string`, `UnclassifiedAccepted bool`, and
`Category, Parent domain.Category`; `DuplicateMatch` with `ID, Merchant string`;
and `ReviewSnapshot` with `Review domain.Review`, `Included []IncludedReview`,
`Duplicates [][]DuplicateMatch`. Domain supplies `ReviewSummary` with the three
integer counters, `Review` with Import/Drafts/Summary and pagination fields,
and `Draft` with embedded Candidate and DuplicateIDs.

Duplicate candidate groups correspond positionally, one per visible draft.
Included rows cover the entire import, not just the visible page. Invalidity
counts once per row and is independent of missing classification. Reuse existing
candidate validity, active owner/category/parent validity, the extra parent-depth
condition, and MerchantKey equality without case-folding or fuzzy matching.
Duplicate IDs are warnings, not automatic exclusions; append them, preserving
prior IDs, order and repetitions. Confirmation is separate and validates fresh
state in one locked transaction before commit.

### Acceptance

- Pure domain APIs own composed eligibility, summary accumulation, and matching.
  A service-private helper or a DTO/DAO dumping ground does not qualify.
- Supporting pure values move inward as needed, with all callers/mappers migrated
  and no domain-to-port import or obsolete alias.
- The service reads as load, lifetime/authorization orchestration, named
  assessment, return, without row-level policy or matching loops.
- Preserve independent counters, one invalid count, all-import scope, existing
  counters, depth policy, canonical equality, duplicate append/order/multiplicity,
  and response-only status adaptation. Do not assume undocumented zero counters.
- No hidden I/O/clock/transaction, whole-snapshot copies, or policy framework.
  Read assessment does not replace locked confirmation validation.
- Exercise the pure owner directly for acceptance/rejection and collection
  boundaries. Service and real-adapter evidence cover their own I/O/atomicity
  claims, not helper-call counts.

## B. Representation ownership and application query behavior

### Consumer prompt

Refresh the handbook and show concrete handler/service/representation snippets
for a partial update and read. The handler manually interprets optional JSON
`label`: omitted means unchanged, empty string is supplied, null is rejected by
the existing API. Trusted owner comes from middleware. The service loads a record
and category under its transaction, checks permitted operation and category
change using existing business policy, saves, and commits before replying.

Repositories reconstruct `sql.NullTime` in each read and sometimes fetch lazy
associations while building responses. Domain uses `*time.Time`; missing stored
timestamps stay missing. HTTP responses use an explicit allowlist and empty
collections encode as `[]`. Generated Ent files cannot be edited by hand.

A list query already carries Offset and Limit. Accepted policy is default limit
50, maximum 100, maximum offset 100000, one-row lookahead for has_more, and stable
(created_at,id) ordering. Retain compatibility, context, authorization and the
same transaction boundary. Show how the instructions guide this workflow and
where to verify it, without unnecessary forwarding layers.

### Acceptance

- DTO/decoder/mapper owns presence semantics and transport conversion, not
  business eligibility or use-case execution.
- Handwritten persistence mapping owns null reconstruction and already-loaded
  shapes; no lazy I/O, generated edits, or business transition in DAO.
- Application query/result owns cohesive normalization, bounds and page shaping.
  The service invokes them instead of repeating their implementation inline.
- Domain remains the business owner. Handler/service/repository code tells the
  operation's story without banning legitimate protocol/I/O/error branches.
- Preserve trusted scope, cancellation, same transaction and commit-before-return,
  wire semantics, exact bounds/defaults, ordering and nullability.
- Direct owner checks cover meaningful boundaries; HTTP and real-adapter checks
  cover actual wire/database claims. No Manager/interface per helper.

## C. Fresh confirmation variation: book-like flow with legitimate I/O

Run only after the candidate has passed A/B and been simplified. Do not tune the
wording on this case and still call it unseen; a failed case becomes development
evidence and requires another fresh confirmation.

### Consumer prompt

An existing order-preview use case must read naturally from top to bottom, like
a book. It loads trusted owner-scoped orders and shipping rates, derives each
order's eligibility and a subtotal over those supplied values, and returns a
transport allowlist. Preserve the existing business formulas, signed-money and
currency policy; do not invent missing rules. The repository iterates database
rows, closes them, and reports scan/cancellation failures. Generated records are
unchanged. No write, retry, queue, or new transaction is needed for this read.
Produce the replacement handbook passage with representative orchestration and
supporting APIs. Show where the loops and conditions belong and how the intended
reader can understand the flow without opening every helper.

### Acceptance

- Readable business steps at one abstraction level, with meaningful names and
  explicit inputs, results, mutations and failure guards, not navigation through
  trivial forwarders or generic process/handle helpers.
- Pure eligibility/subtotal behavior owns supplied values in domain; HTTP mapping
  and stored-shape mapping remain adapter-local.
- Repository row iteration, close/error handling, context and scoped loading stay
  with the adapter; orchestration is not removed merely to eliminate `if`/`for`.
- No invented formula, normalization, money conversion, infrastructure mechanism,
  generated-code patch or outward domain dependency.
- Direct pure behavior checks and separate adapter/transport verification; no
  unobserved execution or reader-loading claims.

## Observed evidence — 2026-11-12

Baseline source was the pre-edit setup skill and references. Each A/B stage used
one independent fresh consumer per case with the same scenario inputs and a
rubric fixed before candidate edits. These samples establish observed behavior,
not a reliability percentage or native automatic skill-loading proof.

- **Baseline A:** correctly assigned summary and matching to pure domain
  functions. It also replaced prior summary counters and explicitly required a
  nonzero-counter reset, although the supplied loop accumulated them and did
  not establish zero-only inputs. Domain placement was already a passing
  baseline behavior; preservation was not.
- **Baseline B:** correctly handled DTO presence and stored-null mapping, but
  explicitly assigned numerical bounds/defaults to the service and left page
  trimming there. This reproduced the old layers example and failed the
  application-input/result ownership criterion.
- **Revised A/B:** concrete passages gave composed row rules, summary accumulation
  and matching domain owners; query normalization and page shaping had application
  owners. They preserved prior counters/IDs and the relevant wire, hydration,
  transaction and import boundaries.
- **Simplification:** removed a redundant wrong-example paragraph from the new
  ownership chapter. Its restrictions remained in the ownership table and story
  section. Fresh final A/B artifacts still satisfied the same criteria.
- **Fresh C:** a separate order-preview consumer produced load-orders,
  load-rates, derive-preview, return orchestration. It kept row iteration,
  scanning, closure and cancellation in persistence; pure eligibility/subtotals
  in domain; and field conversion in HTTP. It did not invent unspecified money
  formulas or add writes, retries, queues or transactions. Final A/B/C each
  satisfied its declared artifact criteria.

Executable evidence was separate from consumer-artifact judgment. The exact new
review fragment and changed canonical query/page/service fragments were extracted
into a throwaway Go module. The review fragment used the inspected project's real
domain types, candidate/category checks and canonical merchant-key function.
`go run -mod=mod .` preserved the original calculation across 256 eligibility
combinations and exercised independent counters, prior counters, full-import
inputs versus visible drafts, canonical Unicode/whitespace equality, case/suffix
nonmatches, append/order/repeated/prior IDs, empty groups, display status, query
bounds/defaults, and empty/exact/lookahead pages. The canonical service compiled.
Observed summary was `{Included:5 NeedsClassification:2 Invalid:2}`, with IDs
`[existing width whitespace width]` and response status `processing`. The
temporary module was removed afterward.

Repository verification: `node --test` passed all 216 tests with no failures or
skips; 88 relative Markdown links resolved; setup metadata and entry size were
valid. The simplified reference retained the exact executed Go fragment.
No target application migration, PostgreSQL concurrency/rollback check, plugin
installation, or Claude Code/Codex/OMP reader activation was performed or claimed.
