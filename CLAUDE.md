# CLAUDE.md — Project Context for Claude Code

d-lab Grant Engine — AI-assisted grant-pipeline management for d-lab NPC (a South African youth AI-skills NPO). React 18 + Vite frontend, Express 5 + Supabase backend, separate Playwright service.

## Read these first

This project documents itself with an `.org` documentation system. **Start at [`README.org`](./README.org)** (the navigation hub), then read the doc that matches your task:

| Need | Read |
|------|------|
| Project orientation, tree, quick start | [`README.org`](./README.org) |
| System design, tech stack, data flow, key decisions | [`ARCHITECTURE.org`](./ARCHITECTURE.org) |
| Domain, users, financial model, **intentional design decisions** (read before flagging anything as a bug) | [`PRODUCT_CONTEXT.org`](./PRODUCT_CONTEXT.org) |
| Known gaps, parked/coupled work, deferred backlog (read before flagging dormancy) | [`DEFERRED.org`](./DEFERRED.org) |
| Frontend / backend / service detail | `src/ARCHITECTURE.org`, `server/README.org`, `playwright-service/README.org` |
| Per-module patterns & gotchas | the `quick_reference.org` in that module's directory |

Before editing code in a module, read its `quick_reference.org`. Before audits, read `PRODUCT_CONTEXT.org` and `DEFERRED.org`.

## Documentation & sub-agent system

- The documentation standard and procedure: [`DOCUMENTATION.org`](./DOCUMENTATION.org).
- Doc-system portability (engine vs. instance, new-project bootstrap): [`SETUP.org`](./SETUP.org).
- Sub-agent coordination and model selection: [`SUBAGENT_PLAYBOOK.org`](./SUBAGENT_PLAYBOOK.org), with generic agent rules in [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).
- Audit workflows: [`AGENT_AUDIT_WORKFLOW.org`](./AGENT_AUDIT_WORKFLOW.org).

When the user shares product context (scope, business constraints, intentional decisions), update `PRODUCT_CONTEXT.org`; when it concerns dormancy/deferral/scheduled removal, update `DEFERRED.org`. Future agents inherit the rationale via git.
