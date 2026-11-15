# Focused skill-revision evaluations

Use a fresh independent author with the current writing-skills body and each prompt
below. Inspect the rewritten artifact, not claims of compliance. These are fixed-input
artifact evaluations; supplied prior-evaluation statements are scenario fixtures,
not evidence that the fixture's upload/cancel/send operations ran.

## Acceptance

- Replace the owning rule; remove superseded sections and repeated decisions.
- Preserve exact output fields, thresholds, permissions and unrelated safety rules.
- Do not append an override, invent workflows, or keep a redundant heading merely
  because it existed before the revision.

## change_owner

```text
Revise this existing skill for the approved request: reports now use JSON with exact keys "status" ("ok" or "failed") and "evidence" (a list of original source IDs); no HTML output. Preserve unrelated behavior. Existing evaluation evidence: the old skill produced HTML, the candidate JSON workflow passed valid and failed-status cases; no new execution is available in this artifact-only task. Return the full revised skill, nothing else.

---
name: incident-report
description: Use when producing an incident report.
---
# Incident reports
Read supplied incident evidence. If evidence is missing, say which input is needed; do not invent it.
## Output
Write one HTML report with sections Status and Evidence. Evidence uses original source IDs.
## Delivery
Save the report in the user-approved location. Never publish it without authorization.
## Notes
HTML section names must be Status and Evidence. Reports must use the HTML template above.

```

## overlap

```text
Revise this existing skill for the approved request: confidential reports require a named recipient's approval before any upload, but public reports may be uploaded after preview. Inputs are already labeled public or confidential. Keep this update focused. Existing evaluation evidence: confidential upload before named-recipient approval failed the requested boundary; the revised flow has passed both confidentiality cases in a prior executable evaluation. Return the full revised skill only.

---
name: upload-report
description: Use when uploading prepared reports.
---
# Upload report
## Delivery
Preview the report and ask the requester for approval. After approval, upload it to the selected destination.
## Safety
Do not expose access tokens. A report upload always needs requester approval.
## Output
Return the upload receipt, not access tokens.

```

## cancel

```text
Revise the supplied skill for this approved request: cancel only the job IDs explicitly selected by the user, not all jobs. Preserve the unrelated audit-retention requirement of 30 days and the rule never to print credentials. Prior evaluations observed the blanket cancel behavior and verified selected-ID cancellation. Return the complete revised skill only.
---
name: cancel-jobs
description: Use when a user requests cancellation of running jobs.
---
# Cancel jobs
## Action
List running jobs, then cancel every running job. Report each cancellation result.
## Batch handling
Cancellation applies to all jobs in the current account.
## Retention
Keep audit records for 30 days. Never print credentials.

```

## holdout

```text
Update this existing skill for an approved request: use the existing email recipient list instead of requiring CSV import. Keep the exact max of 25 recipients, preserve opt-out checks, and continue asking before sending. A prior behavior evaluation showed the mandatory CSV step is obsolete; the existing-list flow passed. Return the complete revised skill only.
---
name: send-announcement
description: Use when sending an announcement to selected recipients.
---
# Send announcement
## Recipients
Import recipients from CSV. Reject a list with more than 25 recipients. Exclude recipients who opted out.
## Send
Preview the announcement and selected recipients. Ask before sending.
## Import reminder
Always require a CSV upload before sending.

```

## Observed evidence — 2026-11-15

Baseline: `b4fe8ee`, one sample each for change_owner and overlap. Output replacement
passed; overlap repeated the confidential-approval rule in Delivery and Safety.
The initial revision removed that duplication in both development runs. Its first
fresh cancellation variation still retained a Batch handling section restating the
selection rule. That failure was retained and promoted to a development case.

The correction makes removal of redundant pre-existing sections explicit. After
removing a redundant "second checklist" phrase from that correction, final fresh
samples passed change_owner, overlap, cancel, and the unused holdout: 4/4 inspected
artifacts. Exact status/evidence fields, publication boundary, credential protection,
30-day retention, 25-recipient limit, opt-out and send approval were preserved where
applicable. This small sample is not a reliability estimate or native loading proof.
The authoring skill changed from 110 to 109 lines; semantics, not length, decided
acceptance.
