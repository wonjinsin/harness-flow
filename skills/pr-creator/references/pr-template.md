# Fallback PR Body Template

Use this structure verbatim when the repository has no PULL_REQUEST_TEMPLATE of its own.

```markdown
## Summary

<!-- What changed and why, in 1-3 sentences. Link the motivating issue/ticket if one exists. -->

## Changes

<!-- Bullet list of concrete changes in this diff, grouped by area. Name files/modules, not commits. -->

## Testing

<!-- How this was verified: exact commands run and their observed results. Only claim verification you actually performed in this session. If untested, say "Not tested" and why. -->
```

Every `<!-- -->` placeholder is replaced with real content before the PR is created — the final body contains no HTML comments.
