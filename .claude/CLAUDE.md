# Project Instructions

## Documentation System

This project uses a three-tier `.org` documentation system. All agents (main and sub) MUST consult these files before making changes.

### Tier 1A — Project-Wide Strategic (root level)
- `README.org` — navigation hub, project structure, quick start. **READ THIS FIRST.**
- `ARCHITECTURE.org` — system design, tech stack, cross-cutting decisions.
- `DOCUMENTATION.org` — documentation standard + procedure: principles, tier hierarchy, QR format template, sync workflows, agent procedures.
- `PRODUCT_CONTEXT.org` — present-state product, users, roles, intentional design decisions, scope. Read before audits and before flagging code as "issue".
- `DEFERRED.org` — intentionally dormant + deferred features and their reactivation paths. Read before flagging dormancy.
- `SETUP.org` — doc-system bootstrap + portability: which files are the carry-over engine vs per-project instance, and the new-project sequence. The Model Selection block below is part of the carry-over engine.

### Tier 1B — Service/App Strategic (inside service/app subdirectories)
- `README.org` or `ALL_CAPS.org` inside service/app subdirectories.
- Scoped to one service or app: architecture, API contracts, deployment.
- `PRODUCT_CONTEXT.org` (monorepos only) — per-app variant of the Tier 1A file.

### Tier 2 — Quick References (per-module detail)
- `*/quick_reference.org` — non-obvious patterns, constraints, component maps.
- One per module. Sub-agents MUST read the relevant QR before modifying code in that module.

### Agent Instructions
- Main agent: read `README.org` first for project orientation.
- Before dispatching sub-agents: include in their prompt which `.org` files to read and a reminder to check the relevant `quick_reference.org` before editing code.
- Sub-agents: do NOT update `.org` files unless explicitly instructed.
- Documentation sync follows the workflow in `DOCUMENTATION.org` → Part II (Procedure).
- For audit workflows: sub-agents must also read `PRODUCT_CONTEXT.org` to avoid flagging intentional design constraints, and must tag every finding with the lifecycle axis (Active / Intentionally Dormant / Scheduled for Removal / Stale). Macro pass runs before micro — see `AGENT_AUDIT_WORKFLOW.org`.
- When the user shares product context — scope decisions, business constraints, intentional design decisions, definition-of-done updates — update `PRODUCT_CONTEXT.org`; when it concerns dormancy, deferral reasons, or scheduled removals, update `DEFERRED.org` instead. Either way future agents inherit the rationale. This is the project-scoped equivalent of auto-memory: shared with the team via git, not stored privately.

## Sub-Agent Coordination

Full coordination guide: `SUBAGENT_PLAYBOOK.org` in the project root. **Reference it before multi-agent work.**

### Model Selection

Canonical home for sub-agent model selection — `SUBAGENT_PLAYBOOK.org`, `DOCUMENTATION.org`, and `AGENT_AUDIT_WORKFLOW.org` link here, they do not duplicate it.

Valid `subagent_type` values: `"general-purpose"` (read+write), `"Explore"` (read-only search), `"Plan"` (planning only).
`"sonnet"` and `"opus"` are NOT valid subagent_type values — they will error.

- **Haiku** (`subagent_type: "general-purpose"`, `model: "haiku"`): File lookups, grep summaries, single-file edits, doc sync, mechanical tasks.
- **Sonnet** (`subagent_type: "general-purpose"`, omit `model`): Research, exploration, medium-complexity edits. Sonnet is the default — no model param needed.
- **Opus** (`subagent_type: "general-purpose"`, `model: "opus"`): Complex refactors, architectural decisions, deep reasoning.
- **Read-only search** (`subagent_type: "Explore"`): Pure codebase exploration with no file edits needed.

`model` is always a separate override from `subagent_type`. Haiku and Opus are model overrides, not agent types.

### Rules
- When the user specifies a model, follow that instruction exactly. No silent upgrades.
- Default: foreground parallel (multiple `Agent()` calls in ONE message). Never `run_in_background` when waiting on results.
- Always pass sufficient context in sub-agent prompts — sub-agents have NO access to the parent conversation. Include absolute file paths, relevant `.org` files to read, and the expected return format.
- Delegate aggressively: main agent coordinates, sub-agents execute (code edits, builds, tests, file reads).

Project-specific structure, tech stack, and architecture live in `ARCHITECTURE.org` — not in this file. This file is generic guidance about the documentation and sub-agent system, intended to apply across projects.
