# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project loosely tracks [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] — 2026-04-30

### Changed

- Skill handoff convention reworked: planning artifacts now flow through files (new `.planning/{session_id}/brainstorming.md` for brainstorming output, plus existing `PRD.md` / `TRD.md` / `TASKS.md`), and execution status flows through conversation markdown sections (`## Status`, `## Path`, `## Reason`, `## Session`). All `SKILL.md` files (English + Korean) and `harness-contracts/` documents updated accordingly. Top-level `README.md` / `README.ko.md` rewritten to describe the file-based handoff and the markdown-section status protocol. JSON output convention removed.
