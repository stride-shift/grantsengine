# Workflow Study Guide

A visual reference for understanding how Claude Code workflows are structured, how data flows between agents, and how the three project workflows apply these patterns.

---

## 1. The Core Primitives

Every workflow script is plain JavaScript that drives agents using five building blocks.

```mermaid
mindmap
  root((Workflow Script))
    agent
      Spawns ONE subagent
      Returns string OR typed object
      Retries if schema validation fails
      Options: schema, model, label, phase
    parallel
      Fires N thunks concurrently
      BARRIER: waits for ALL before returning
      Returns array of results
      Nulls on error, use .filter(Boolean)
    pipeline
      Conveyor belt through stages
      NO barrier between stages
      Item A in stage 3 while B is in stage 1
      Wall-clock = slowest single item
    phase
      UI label only
      Groups agent calls in progress display
      No effect on data or execution
    log
      Narrator line shown during run
      Good for status counts
    return
      Final value back to main agent
      Usually a markdown string or object
```

---

## 2. The `agent()` Call — Anatomy

```mermaid
flowchart LR
    A["agent(prompt, opts)"]

    A --> B[prompt\nstring]
    A --> C[opts.schema\nJSON Schema]
    A --> D[opts.model\n'haiku' / 'sonnet' / 'opus']
    A --> E[opts.label\ndisplay name in UI]
    A --> F[opts.phase\nwhich phase group]

    C --> G{schema\nprovided?}
    G -- YES --> H["Returns typed JS object\nvalidated against schema\nauto-retries on mismatch"]
    G -- NO --> I["Returns raw string\n(free-form text)"]
```

**The key insight:** schemas are the bridge between "agent outputs text" and "script works with data." Once you have a typed object back, you use plain JS to reshape it before passing it to the next agent.

---

## 3. `parallel()` vs `pipeline()` — When to Use Each

### `parallel()` — audit-macro domain reviews

Each thunk is one independent agent. All fire at once. Everything stops until the last one finishes (the barrier), because synthesis needs every domain's findings together.

```mermaid
flowchart LR
    START["topo.domains\n[backend, frontend, shared]"]

    START --> T1["thunk: () => agent\nsonnet: macro:backend\nreturns MACRO_SCHEMA"]
    START --> T2["thunk: () => agent\nsonnet: macro:frontend\nreturns MACRO_SCHEMA"]
    START --> T3["thunk: () => agent\nsonnet: macro:shared\nreturns MACRO_SCHEMA"]

    T1 --> B
    T2 --> B
    T3 --> B

    B["⬛ BARRIER\nall three must finish\nbefore anything continues"]

    B --> SYNTH["synthesis agent\nreceives ALL domain findings\nas JSON.stringify(perDomain)\ncannot run until barrier clears"]
```

> One agent per thunk — not one agent shared across all thunks. `parallel([thunkA, thunkB, thunkC])` fires three separate agents. The array size determines how many agents spawn.

---

### `pipeline()` — audit-micro module audit + verify

Items are data (the module targets list from the scout). Stages are functions that receive an item and call `agent()`. The item travels through the functions — the functions spawn the agents. No barrier between stages: module B's audit starts the moment module A's audit returns, without waiting for A's verify to finish.

```mermaid
flowchart TB
    ITEMS["rescout.targets\n[agents/, controllers/, routes/, repos/]"]

    ITEMS --> A1
    ITEMS --> A2
    ITEMS --> A3
    ITEMS --> A4

    subgraph STAGE1["Stage 1 — audit(module) → MICRO_SCHEMA"]
        A1["sonnet: micro:agents\nfinds issues, classifies\neach as mechanical/logical"]
        A2["sonnet: micro:controllers"]
        A3["sonnet: micro:routes"]
        A4["sonnet: micro:repos"]
    end

    subgraph STAGE2["Stage 2 — verify(auditResult, originalItem)"]
        V1["haiku committee\nfor agents/ findings"]
        V2["haiku committee\nfor controllers/ findings"]
        V3["haiku committee\nfor routes/ findings"]
        V4["haiku committee\nfor repos/ findings"]
    end

    A1 -->|"done → immediately"| V1
    A2 -->|"done → immediately"| V2
    A3 -->|"done → immediately"| V3
    A4 -->|"done → immediately"| V4

    NOTE["No barrier between stages.\ncontrollers/ audit starts as soon as agents/ audit finishes.\ncontrollers/ verify runs while routes/ is still being audited.\nWall-clock = the slowest single module chain (audit + verify)."]
```

> **`parallel()` use case — audit-macro domain reviews**
> You have 4 domains to audit. You fire all 4 agents at once and wait for all of them to finish before the synthesis agent runs — because the synthesis agent needs *every* domain's findings in one shot to write the consolidated report. That's the barrier: synthesis can't start until the last domain finishes.

> **`pipeline()` use case — audit-micro audit + verify**
> You have 10 modules to audit. Each module has two stages: audit (find issues) then verify (committee vote). With `pipeline()`, module 2 starts its audit the moment module 1 finishes its audit — it doesn't wait for module 1's verify to finish. Module 1's verify and module 2's audit overlap in time. Wall-clock is the slowest single module chain, not the sum of all modules.

> **Is `pipeline()` just parallel under the hood?** Partly — yes. Items in a pipeline do run concurrently across stages. The difference is that `parallel()` is a hard sync point (everything stops until all thunks are done), while `pipeline()` has no such barrier between stages. Think of `parallel()` as a roundup ("everyone meet back here") and `pipeline()` as an assembly line ("each car moves to the next station as soon as it's ready, no waiting for the others").

> **¹ What is a thunk?** A thunk is just a zero-argument function used to *delay* a computation: `() => agent(...)`. Without it, `agent(...)` would fire the moment JavaScript evaluates the line — before `parallel()` even sees it. Wrapping it in `() =>` means the call only runs when `parallel()` explicitly invokes the function. This is how `parallel()` controls *when* and *how many* agents start at once (the concurrency cap is ~10 running at a time). See Section 4 for the full sequence diagram.

**Rule of thumb:** use `parallel()` only when the next step genuinely needs ALL prior results at once (e.g., deduplication across the full set). Otherwise `pipeline()` is faster and wastes less wall-clock time.

---

## 4. Thunks — Why `() => agent(...)` Not `agent(...)`

```mermaid
sequenceDiagram
    participant Script
    participant parallel
    participant Agent

    Note over Script,Agent: ❌ WRONG — agent fires immediately
    Script->>Agent: agent("prompt") starts NOW
    Script->>Agent: agent("prompt") starts NOW
    Script->>parallel: parallel([promise, promise])
    Note over parallel: parallel has no control over start time

    Note over Script,Agent: ✅ RIGHT — agent fires when parallel is ready
    Script->>parallel: parallel([() => agent(...), () => agent(...)])
    parallel->>Agent: fires thunk A when slot is ready
    parallel->>Agent: fires thunk B when slot is ready
    Note over parallel: parallel controls concurrency cap (max ~10 running)
```

A thunk `() => agent(...)` is just a zero-arg function that delays execution. `parallel()` calls each thunk when a concurrency slot opens. Without thunks, all agents fire at once before `parallel()` can manage them.

---

## 5. How Data Flows — The Universal Pattern

```mermaid
flowchart TD
    ARGS["args\n(input from main agent)"]
    ARGS --> NORM["Normalise to JS variables\nconst report = a.report"]
    NORM --> SCHEMA["Define schemas\nconst MY_SCHEMA = { type: 'object', ... }"]
    SCHEMA --> SCOUT["SCOUT agent\nawait agent(prompt, { schema: SCOUT_SCHEMA })"]
    SCOUT -->|"typed JS object"| JSWORK["Plain JS transforms\nfilter, map, flatMap, reduce"]
    JSWORK --> FANOUT["Fan-out agents\nparallel or pipeline\neach gets data injected into prompt string"]
    FANOUT -->|"array of typed objects"| JSWORK2["Plain JS transforms\nflatMap summaries, collect escalations"]
    JSWORK2 --> SYNTH["SYNTHESIS agent\nreceives JSON.stringify of all summaries"]
    SYNTH -->|"markdown string or typed object"| RETURN["return\nhands back to main agent"]
```

**The script is the memory.** Agents share no state. Data travels as:
1. Structured output from agent → JS variable
2. JS transforms the variable
3. Next agent receives it via `JSON.stringify(data)` injected into the prompt string

---

## 5.5 Fan-Out and Fan-In — The Shape, Not a Primitive

Fan-out/fan-in is not a separate mechanism from `parallel`/`pipeline`. It's the *shape* that emerges when you combine a structured scout output with those primitives.

```mermaid
flowchart TB
    SCOUT["SCOUT\nreturns one structured object\n{ apps: [...] }"]

    SCOUT -->|"FAN-OUT\none object → N agents"| F1["qr:agents (haiku)"]
    SCOUT --> F2["qr:controllers (haiku)"]
    SCOUT --> F3["qr:routes (haiku)"]
    SCOUT --> F4["qr:ui (haiku)"]
    SCOUT --> F5["qr:hooks (haiku)"]

    F1 --> G1
    F2 --> G1
    F3 --> G1
    F4 --> G2
    F5 --> G2

    G1["GROUPED FAN-IN\nbackend L1B (sonnet)\nreceives all backend QR summaries"]
    G2["GROUPED FAN-IN\nfrontend L1B (sonnet)\nreceives all frontend QR summaries"]

    G1 -->|"FAN-IN\nN summaries → 1 agent"| L1A["L1A (opus)\nreceives all L1B summaries"]
    G2 --> L1A
```

> **Fan-out** — one thing becomes many. The scout returns a work list; the script spawns one agent per item. One structured object → N concurrent agents.

> **Fan-in** — many things become one. All results return; the script collects them with `flatMap`/`filter` and feeds the combined array into one downstream agent. N results → one structured input.

> **Grouped fan-in** — the routing you described. Because each QR summary carries an `app` field through its schema, the fan-in isn't one big global merge — backend summaries flow to the backend L1B, frontend summaries to the frontend L1B. No routing logic needed: the schema field + the `parallel(apps)` structure preserve the grouping automatically in plain JS (`perApp.flatMap(x => x.qrSummaries)`).

**The takeaway:** the scout produces the list (always the fan-out trigger), agents consume one item each (fan-out), schemas carry grouping metadata, JS collects and routes (fan-in), the next layer receives the grouped result.

---

## 5.6 Six More Core Principles

Beyond parallel/pipeline, schemas, and fan-out/fan-in, these are the design principles every workflow in this repo leans on.

```mermaid
mindmap
  root((Core Principles))
    Scout Pattern
      Workflow can't hardcode paths
      Scout discovers the work list
      Its structured output drives fan-out
      Without it the workflow is static
    Prompt Injection
      Only inter-agent channel
      JSON.stringify into the prompt string
      Agents share zero state
      Forces explicitness about what each knows
    Escalation Channel
      Lower layer can't edit upper files
      Schema notes field carries findings up
      architecturalNotes, l1aNotes
      Script harvests via flatMap, injects upward
    Leaf Workers vs Orchestrator
      Agents are leaves, never spawn agents
      All ordering logic lives in the script
      Read script top-to-bottom = full picture
      Nesting would lose that visibility
    Human Gate
      Read-only workflow ends with report
      Structural changes need human decision
      audit-macro stops, audit-micro runs after
      Know when a gate belongs in the design
    Return as Handoff
      Workflow is a step, not the end
      return lands in main agent context
      Main applies conversation-only context
      Main agent commits, workflow never does
```

**1. The Scout Pattern.** Almost every workflow starts with a scout. It reads the repo, figures out what's in scope, and returns the structured list the rest of the workflow iterates over. The script can't hardcode paths — the scout makes the workflow adapt to whatever the repo looks like at run time.

**2. Prompt Injection.** Agents share zero state. The only way data moves between them is `JSON.stringify(data)` injected into a prompt string. Limiting on the surface, but it forces you to be explicit about what each agent knows — and that's exactly why schemas matter.

**3. The Escalation Channel.** When a lower-layer agent finds something belonging to a higher layer, it can't edit that file (it's scoped to its own). Instead its schema has a notes field (`architecturalNotes`, `l1aNotes`) for "things the next layer up should know." The script harvests those with `flatMap` and injects them upward.

**4. Leaf Workers vs Orchestrator.** Agents are leaves; the script is the orchestrator. No agent spawns other agents. All "what runs next, with what data" logic lives in the script, so you can read it top to bottom and know exactly what happens.

**5. The Human Gate.** audit-macro ends with a report and an explicit "nothing was applied." Structural changes need a human decision before execution; audit-micro runs only after that gate. Read-only-workflow-ends-with-a-report vs write-workflow-executes is a deliberate design choice.

**6. `return` as the Handoff.** Whatever a workflow returns lands back in the main agent's context. The workflow is a step, not the end — the main agent reads the return, applies anything needing conversation context (like PRODUCT_CONTEXT notes), then commits. Workflows hand off; they don't close the loop.

---

## 6. Model Selection — Which Tier Does What

```mermaid
quadrantChart
    title Model Selection by Task Complexity vs Cost
    x-axis Low Cost --> High Cost
    y-axis Simple Task --> Complex Task
    quadrant-1 Opus Territory
    quadrant-2 Sonnet Territory
    quadrant-3 Haiku Territory
    quadrant-4 Sonnet Territory
    Bounded file edits: [0.15, 0.2]
    Single QR sync: [0.1, 0.3]
    Doc grep/lookup: [0.2, 0.15]
    Module audit: [0.45, 0.55]
    Scope resolution: [0.5, 0.5]
    Cross-module judgment: [0.55, 0.6]
    L1B strategic update: [0.5, 0.65]
    Architecture audit: [0.65, 0.75]
    Whole-project reconcile: [0.8, 0.85]
    Synthesis/restructuring: [0.7, 0.8]
```

| Model | When to use | Example in doc-sync |
|-------|------------|---------------------|
| **Haiku** | Bounded, mechanical, single-file | QR worker edits one `quick_reference.org` |
| **Sonnet** | Reasoning, medium scope, cross-module | Scout, L1B updates, context reconciler |
| **Opus** | Whole-project, architectural, deep synthesis | L1A root files reconcile |

Set `model:` explicitly on every agent so fan-out workers don't inherit an expensive session model by accident.

---

## 7. doc-sync — Full Execution Map

```mermaid
flowchart TD
    ARGS["args\n{ report, mode, since }"]
    ARGS --> NORM["Normalise: report, mode, sinceBlock"]

    NORM --> P0

    subgraph P0["Phase 0 — Scout (sonnet)"]
        SCOUT["scout agent\nreturns SCOUT_SCHEMA object:\n{ mode, apps[], rootL1A[] }\neach app has qrs[] with focusHint"]
    end

    P0 -->|"scout.apps"| JSFILTER["JS: filter empty apps\ncount total QRs\nlog scope summary"]

    JSFILTER --> P1_P2

    subgraph P1_P2["Phase 1+2 — parallel(apps)"]
        direction TB
        subgraph APP_A["app: backend"]
            QR_A1["haiku: qr:controllers"] --> SUM_A1[QR_SUMMARY]
            QR_A2["haiku: qr:agents"] --> SUM_A2[QR_SUMMARY]
            QR_A3["haiku: qr:routes"] --> SUM_A3[QR_SUMMARY]
            SUM_A1 & SUM_A2 & SUM_A3 --> L1B_A["sonnet: l1b:backend\nreads qrSummaries\nreturns L1B_SUMMARY"]
        end
        subgraph APP_B["app: frontend"]
            QR_B1["haiku: qr:components"] --> SUM_B1[QR_SUMMARY]
            QR_B2["haiku: qr:hooks"] --> SUM_B2[QR_SUMMARY]
            SUM_B1 & SUM_B2 --> L1B_B["sonnet: l1b:frontend\nreads qrSummaries\nreturns L1B_SUMMARY"]
        end
        NOTE_NOBR["⚡ No global barrier:\nbackend L1B can run while\nfrontend QRs still run"]
    end

    P1_P2 -->|"perApp array"| JSFLAT["JS: flatMap summaries\ncollect architecturalNotes\ncollect qrSplitFlags\nlog changed counts"]

    JSFLAT --> P3

    subgraph P3["Phase 3 — Project Docs (opus)"]
        L1A["opus: l1a agent\nreceives: JSON.stringify(escalations)\nJSON.stringify(splitFlags)\nreturns L1A_SUMMARY"]
    end

    P3 -->|"l1a object"| P4

    subgraph P4["Phase 4 — Context Notes (sonnet, read-only)"]
        CTX["sonnet: context-notes agent\nreceives: ALL summaries as JSON\nedits NOTHING\nreturns CONTEXT_NOTES\n{ anyFound, observations[] }"]
    end

    P4 -->|"ctx object"| RETURN["JS: format markdown\nreturn final string to main agent"]
```

---

## 8. Escalation — How Lower Layers Talk to Upper Layers

```mermaid
flowchart BT
    CODE["Source Code\n(ground truth)"]

    CODE --> QR["QR Workers\nhaiku per module\nEdits: quick_reference.org only\nOutputs: architecturalNotes[]"]

    QR -->|"architecturalNotes\nin QR_SUMMARY"| JS_ESC1["JS script\ncollects escalations\nflatMap(s => s.architecturalNotes)"]

    QR --> L1B["L1B Workers\nsonnet per app\nEdits: app-level .org files\nOutputs: l1aNotes[]"]

    L1B -->|"l1aNotes\nin L1B_SUMMARY"| JS_ESC2["JS script\ncollects l1aNotes\nflatMap(s => s.l1aNotes)"]

    JS_ESC1 & JS_ESC2 --> MERGED["escalations[]\ncombined array"]

    MERGED -->|"JSON.stringify injected\ninto prompt"| L1A["L1A Worker\nopus\nEdits: root .org files\nonly for escalated signals"]

    L1A -->|"l1a summary"| CTX["Context Reconciler\nsonnet, read-only\nCompares all summaries vs\nPRODUCT_CONTEXT.org + DEFERRED.org"]

    CTX -->|"observations"| MAIN["Main Agent\nApplies context notes\nCommits everything"]

    style CODE fill:#1a1a2e,color:#e0e0e0
    style MAIN fill:#0f3460,color:#e0e0e0
```

**Key design decision:** workers can only escalate via their schema's notes fields. They cannot edit files outside their scope. The script harvests those notes and injects them into the next layer's prompt. This prevents runaway nesting (agents spawning agents).

---

## 9. audit-macro — Architecture Review Flow

```mermaid
flowchart TD
    ARGS["args\n'services/api' or null (whole repo)"]

    ARGS --> A0

    subgraph A0["Phase — Scout (sonnet)"]
        TOPO["topology scout\nreturns TOPO_SCHEMA:\n{ shape, domains[] }\nshape = single-app or monorepo"]
    end

    A0 -->|"topo.domains"| A1

    subgraph A1["Phase — Audit (parallel sonnet per domain)"]
        D1["sonnet: macro:backend\nShape critique only:\nlayering, god-modules,\ncoupling, placement\nreturns MACRO_SCHEMA\n{ domain, findings[], productContextAlignment }"]
        D2["sonnet: macro:frontend"]
        D3["sonnet: macro:shared"]
        NOTE["Each finding tagged:\nType: Placement/Coupling/etc\nLifecycle: Active/Dormant/Stale\nTier: T1/T2/T3"]
    end

    A1 -->|"perDomain array"| JSCOUNT["JS: count total findings\nlog summary"]

    JSCOUNT --> A2

    subgraph A2["Phase — Synthesize (sonnet)"]
        SYNTH["sonnet: synthesize\nreceives JSON.stringify(perDomain)\nNo schema: returns free markdown\nIncludes: T3 restructuring spec\nhuman gate reminder"]
    end

    A2 --> RETURN["return markdown report\nto main agent"]

    RETURN --> GATE["🚧 HUMAN GATE\nReview findings\nApprove restructuring spec\nApply changes manually\nRun tests\nRe-baseline\nTHEN run audit-micro"]

    style GATE fill:#2d1b00,color:#ffaa00
```

---

## 10. audit-micro — The Adversarial Verify Pattern

```mermaid
flowchart TD
    RESCOUT["Re-scout (sonnet)\nFlat list of modules\nreturns RESCOUT_SCHEMA\n{ targets[] }"]

    RESCOUT -->|"rescout.targets"| PIPE

    subgraph PIPE["pipeline(targets, stage1, stage2)"]
        direction LR
        subgraph S1["Stage 1: Audit (sonnet per module)"]
            AUD["Code-health audit\nreturns MICRO_SCHEMA\nfindings each tagged:\nmechanical? critical?\nlifecycle, disposition"]
        end
        subgraph S2["Stage 2: Verify (per finding)"]
            V_CHECK{mechanical?}
            V_CHECK -- YES --> SKIP["carried through\nno verify needed"]
            V_CHECK -- NO --> SCREEN["haiku SCREEN\n'Is this real or false positive?'\nreturns VERDICT\n{ refuted, uncertain }"]
            SCREEN --> ESC{uncertain OR\ncritical?}
            ESC -- NO --> DONE["survived = !refuted\nescalated = false"]
            ESC -- YES --> PANEL["3x haiku PANEL\n3 lenses in parallel:\n1. CORRECTNESS\n2. INTENT\n3. BLAST/TEST\neach tries to REFUTE"]
            PANEL --> VOTE["survived = votes where\n!refuted >= 2\nescalated = true"]
        end
        NOTE_PIPE["No barrier between stages.\nModule B starts auditing while\nModule A is still being verified."]
    end

    PIPE -->|"perModule array"| FLAT["JS: flatMap all verified findings\ncount survivors, committee fires"]

    FLAT --> SYNTH["Synthesize (sonnet)\nDROPS refuted findings\nProduces focused report:\n- human-global (needs judgment)\n- flagged (edge-of-logical)\n- flow-auto (mechanical, dry-run list)\nWrites report to audits/ dir"]

    SYNTH --> RETURN["return markdown\n(same as written file)"]
```

---

## 11. The Adversarial Verify Pattern — Zoomed In

This is the most reusable pattern in the codebase. Use it whenever you need to kill false positives.

```mermaid
flowchart LR
    FINDING["finding object\n{ issue, location,\nmechanical, critical }"]

    FINDING --> MECH{mechanical?}
    MECH -- YES --> PASS["Pass through\nverified: 'skipped-mechanical'\nsurvived: true\nTests are the gate, not votes"]

    MECH -- NO --> SCREEN_AGENT["haiku: screen\nPrompt: 'Try to REFUTE.\nDefault refuted=true if unsure.'"]

    SCREEN_AGENT --> UNCERTAIN{uncertain\nOR critical?}

    UNCERTAIN -- "NO + peripheral" --> QUICK_EXIT["survived = !screen.refuted\nescalated: false\n(cheap path)"]

    UNCERTAIN -- YES --> LENS1["haiku: CORRECTNESS lens\n'Does code actually misbehave?'"]
    UNCERTAIN -- YES --> LENS2["haiku: INTENT lens\n'Is this intentional per .org?'"]
    UNCERTAIN -- YES --> LENS3["haiku: BLAST/TEST lens\n'What breaks? Is it covered?'"]

    LENS1 & LENS2 & LENS3 --> COUNT["count votes where !refuted"]
    COUNT --> MAJORITY{>= 2 votes\nnot refuted?}
    MAJORITY -- YES --> SURVIVED["survived: true\nescalated: true"]
    MAJORITY -- NO --> KILLED["survived: false\n(false positive)"]

    style KILLED fill:#3d0000,color:#ffaaaa
    style SURVIVED fill:#003d00,color:#aaffaa
    style PASS fill:#003030,color:#aaffff
```

**The adversarial default:** every verifier is prompted to *refute* and defaults to `refuted: true` when uncertain. This biases toward dropping findings rather than surfacing false positives.

---

## 12. The Three Workflows — How They Relate

```mermaid
flowchart TD
    CODE_CHANGE["Code changes made"]

    CODE_CHANGE --> DS["doc-sync\nBring .org docs in sync\nwith current code state"]

    CODE_CHANGE --> AM["audit-macro\nStructural review:\nlayering, placement,\ngod-modules, coupling\nREAD-ONLY"]

    AM --> GATE["🚧 Human Gate\nReview + approve\nApply + test\nRe-baseline"]

    GATE --> AMI["audit-micro\nCode-health review:\nfunction length, complexity,\ndead code, error handling\nAdversarial verify\nREAD-ONLY + dry-run report"]

    DS --> COMMIT["git commit\nAll .org edits + context notes"]
    AMI --> PLAN["Focused plan handed to\nmain agent for execution"]

    subgraph SCOPE["Scope"]
        DS_S["doc-sync:\nDocs only, never touches code"]
        AM_S["audit-macro:\nShape/structure, T1-T3 tiers"]
        AMI_S["audit-micro:\nLine-level code health"]
    end

    style GATE fill:#2d1b00,color:#ffaa00
```

---

## 13. Schema Design — The Contract Between Layers

```mermaid
flowchart LR
    subgraph SCHEMA_DESIGN["What a good schema achieves"]
        direction TB
        A["Typed return value\nscript can .dot-access fields\nno string parsing"]
        B["Auto-retry on mismatch\nagent tries again if\noutput doesn't validate"]
        C["Escalation channels\narcitecturalNotes, l1aNotes, focusHint\nare schema fields that\nfeed the next layer"]
        D["Structured fan-out input\nscout schema shapes the work list\nevery downstream agent\ngets exactly the fields it needs"]
    end

    subgraph SCHEMA_ANATOMY["Anatomy of the QR_SUMMARY schema"]
        direction TB
        M["module: string\nwhich module this is"]
        CH["changed: boolean\ndid the file get edited"]
        SU["summary: string[]\n2-5 bullets of what changed"]
        AN["architecturalNotes: string[]\nthings L1A/L1B must know\n(escalation channel)"]
        SF["qrSplitFlags: string[]\n'exceeds 350 lines'\n(recommendation upward)"]
    end
```

**The pattern:** every schema has a "pass-through" field (the result) and a "next layer" field (escalations/notes). The script harvests escalation fields via `flatMap` and injects them into the next agent's prompt.

---

## 14. Quick Reference — Design Decisions Baked Into These Workflows

| Decision | Why |
|----------|-----|
| Scout always runs first | The script can't hardcode file paths — the scout discovers them dynamically. "Figuring out" lives in the script/scout, not in nested agent nesting. |
| Workers edit only their own file | No write conflicts → no worktree isolation needed. Each QR worker has a single target. |
| Haiku for QR workers | Bounded task (one file, known scope). Saves cost on the widest fan-out. |
| Opus only for L1A | Whole-project reconciliation is the most expensive judgment call. Used once per run. |
| `model:` always explicit | Prevents workers from inheriting an expensive session model (e.g. Opus from parent). |
| `parallel()` inside `parallel()` | Apps run concurrently; QRs inside each app run concurrently. Two levels of fan-out. |
| No global barrier between QR and L1B | Backend L1B doesn't wait for frontend QRs. Wall-clock = slowest app, not sum of all. |
| Context docs never auto-edited | `PRODUCT_CONTEXT.org` / `DEFERRED.org` reflect product decisions, not code state. Only the main agent (who has the conversation context) can update them. |
| Workflow never commits | Commits go through the main agent so the user reviews what lands. |
| `pipeline()` in audit-micro | A module's findings verify immediately when its audit finishes — no waiting for all modules to finish first. |
| Adversarial default = `refuted: true` | Biases toward dropping findings. Better to miss a marginal issue than surface false positives that erode trust in the tool. |

---

## 15. Building Your Own Workflow — Template

```mermaid
flowchart TD
    T1["1. Define args normalisation\nconst a = args && typeof args === 'object' ? args : {}"]
    T2["2. Define schemas\none per agent type that returns structured data"]
    T3["3. SCOUT phase\nawait agent(prompt, { schema: SCOUT_SCHEMA })\nreturns the work list"]
    T4["4. FAN-OUT phase\nparallel or pipeline over the work list\neach agent edits ONE thing / returns ONE summary"]
    T5["5. JS transforms\nflatMap, filter, collect escalations\nno agents needed here"]
    T6["6. SYNTHESIS phase\none agent gets JSON.stringify of all summaries\nproduces the final report"]
    T7["7. return\nstring or typed object back to main agent"]

    T1 --> T2 --> T3 --> T4 --> T5 --> T6 --> T7

    TIPS["Tips:\n- Schema fields = the only way agents communicate\n- Inject data via JSON.stringify in prompt strings\n- Set model: explicitly on every agent\n- Use phase() for UI grouping, log() for status counts\n- parallel() for barriers, pipeline() for everything else\n- Workers are leaves — no agent spawns sub-agents"]
```
