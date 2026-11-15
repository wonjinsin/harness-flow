---
name: setup
description: Use when a project needs detailed architecture and coding guidelines installed or refreshed from the shared Go blueprint, including adaptation to another language or an existing layout.
---

# Setup

Install a detailed, project-owned architecture handbook and, for Go adoption,
plan project-local golangci-lint tooling. This explicitly invoked skill is not a
prerequisite for ordinary coding and does not authorize application migrations.
Handbook-only requests stay documentation-only; tooling/config/CI changes need
approved scope. Do not commit or push.

Read [the reference index](references/index.md) and
[the adoption procedure](references/adoption.md) before authoring. The index
selects technical chapters; adoption owns delivery, output, refresh and evidence
requirements. Follow the workflow below without copying their rules into a
second authority.

## 1. Discover the target

Follow [adoption §1](references/adoption.md#1-discovery-record): inspect supplied
canonical instructions, accepted guidance, actual source slices, manifests,
framework APIs and available verification commands. Establish public contracts,
domain/tenant policy, transaction boundaries, local exceptions and human edits.
Do not read secrets or user-scope files, or infer behavior from folder names.

## 2. Resolve delivery before writing

Use [delivery selection](references/adoption.md#choose-delivery-before-authoring)
to settle **Claude Code native rules** versus **shared handbook plus selected
readers**. An explicit handbook-only choice is valid; missing reader information
is not that choice. Reuse explicit approvals, but do not infer them from existing
files or the active session. Discovery and candidate plans may precede selection;
writing waits for unresolved choices.

Show concrete paths, loading conditions and shared-entrypoint side effects under
the project's approval policy. Keep delivery separate from application design.

## 3. Map the reference to the project

Read [architecture](references/go/architecture.md),
[layers](references/go/layers.md),
[coding conventions](references/go/coding-conventions.md), and
[behavior ownership](references/go/behavior-ownership.md). These chapters own the
exact placement, peer-call, command/import, typing, parameter-count, naming,
spacing and tooling contracts; apply them to examples, not just the folder map.

At application/outbound I/O boundaries, count `ctx` but not the receiver:
four total parameters may remain scalar; five or more require a named input.
Keep `ctx` first and outside that input.

Use [adoption §2](references/adoption.md#2-reference-to-project-profile) to map
each responsibility to its actual target path, owning type/API, language/framework
mechanism, applicable rule and verification. Go is the canonical teaching stack,
not a requirement to replace another language. Preserve the default Go layout
unless adopted constraints say otherwise. Surface meaningful conflicts; preserve
current contracts pending a decision. Do not invent business policies from the
sample User feature or ask for facts available in files.

Select every relevant chapter through the index. Multi-repository writes require
[data and transactions](references/go/data-and-transactions.md), external effects
require [reliability](references/go/reliability-and-events.md), and protected
resources require [security](references/go/security-and-operations.md). Initial
adoption assesses all chapters, but materializes only adopted rules and useful
examples. Use [applicability](references/adoption.md#3-decide-applicability-before-materializing-patterns)
to distinguish required baseline, conditional, optional and undecided rules;
PoC status does not waive a required guarantee.

## 4. Write the handbook

Apply [the output contract](references/adoption.md#4-output-contract), including
its required section depth and complete representative vertical slice. Keep the
entry index short, not the substantive guidance. Use actual paths, correct
target-language examples, plausible violations, failure paths and behavioral
checks. Trace a real compound decision, collection calculation and representation
conversion to their owners with before/after calls and direct checks; state when
a behavior is absent rather than inventing it.

Adapt cancellation, error causes, ORM scope, async lifetime and mapping semantics,
not only syntax. Verify unfamiliar APIs against the installed framework or
official documentation. Missing information blocks that example, not independent
pages; no guessed APIs or placeholders in accepted guidance.

For Go, follow [the tooling scope](references/adoption.md#go-tooling-output-and-execution-scope)
and coding chapter without overwriting existing quality configuration or treating
handbook approval as installation permission. The
[runnable example](examples/go/README.md) illustrates SQLite/standard-library
HTTP, not the canonical Chi/Ent/PostgreSQL runtime.

## 5. Adopt and verify

Follow [reader wiring and authority](references/adoption.md#5-reader-wiring-and-canonical-authority)
and [refresh behavior](references/adoption.md#6-first-adoption-and-refresh-behavior).
Show a reviewable diff, preserve human edits and accepted exceptions, and use the
project's instruction-update policy. Add only approved reader pointers; do not
modify other workflow skills or automatically overwrite locally maintained docs.

Execute [target validation](references/adoption.md#7-validation-and-truthful-completion):
a representative slice and negative path, direct extracted behavior checks,
links/imports, authorized tooling and each selected reader's actual loading.
Read orchestration top to bottom to check that its story is clear without
reconstructing helper internals. A mock, passing lint or generic Go example does
not prove an unexercised adapter, language or runtime.

Report the handbook entrypoint, adopted profile/exceptions, exercised checks,
remaining decisions and reading-contract status. Distinguish planned, installed
and verified tooling. Name unavailable runtimes and their unverified guarantees;
do not claim full activation before the required approvals and loading evidence.
