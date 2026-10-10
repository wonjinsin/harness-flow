# OMP task dispatch

Use one `task` call with a `tasks` array so OMP starts both review axes in
parallel. Do not invoke OMP `/review`; this skill's Standards and Spec contracts
are the review authority.

```json
{
  "context": "Pinned fixed point, diff command, commit list, shared read-only/report-only constraint, and the source paths collected in steps 2-3.",
  "tasks": [
    {
      "name": "StandardsAxis",
      "task": "Apply the complete Standards prompt from step 4, including the full smell baseline.",
      "solutionSpace": "Inspect only the pinned diff and cited standards. Do not edit. Return the requested report under 400 words.",
      "isolated": false
    },
    {
      "name": "SpecAxis",
      "task": "Apply the complete Spec prompt from step 4, including the authoritative spec and supporting files.",
      "solutionSpace": "Inspect only the pinned diff and cited requirements. Do not edit. Return the requested report under 400 words.",
      "isolated": false
    }
  ]
}
```

Keep detailed axis material in each `task` field when it differs; use `context`
only for genuinely shared evidence and constraints. Wait for the batch result,
then aggregate the two named outputs separately. When the Spec axis is skipped,
submit a one-item `tasks` array containing only `StandardsAxis`.
