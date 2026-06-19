export const meta = {
  name: 'audit-micro',
  description: 'Read-only micro code-health audit: re-scout the settled tree -> one Sonnet auditor per module (classifies + lifecycle-tags findings) -> focused plan. No verify committee; the intent/adversarial check is a post-hoc pass against PRODUCT_CONTEXT. Applies nothing (dry-run).',
  phases: [
    { title: 'Re-scout', detail: 'flat (app,module) target list on the settled tree' },
    { title: 'Audit', detail: 'one Sonnet agent per module, classify + lifecycle-tag findings' },
    { title: 'Synthesize', detail: 'focused plan: human-global / flagged edges / auto-fixable mechanical' },
  ],
}

// ---------------------------------------------------------------------------
// audit-micro  (Flow B of AUDIT_FLOW_DESIGN.md)  -- READ-ONLY / DRY-RUN
//
// Scope decisions:
//   - No auto-fix. Findings are CLASSIFIED and tagged with an auto-fix
//     disposition, but nothing is written. Writes stay behind the human gate
//     (apply approved items via AGENT_AUDIT_WORKFLOW.org Phase 7).
//   - No verify committee. The earlier all-haiku adversarial committee was
//     removed: it spawned ~one screen + up-to-three lens agents PER finding
//     (dozens of haiku agents on a real module), and haiku is weak at the
//     adversarial/intent reasoning the committee was meant to provide -- a poor
//     cost/quality trade, especially on non-Max plans. The per-module Sonnet
//     auditors already lifecycle-tag every finding against PRODUCT_CONTEXT.org /
//     DEFERRED.org; the intent + false-positive screen is now a POST-HOC pass
//     the human + main agent do while reviewing the report (cheaper, and better
//     reasoning). If a verify layer ever returns, it should be a small number of
//     Sonnet agents reasoning over findings GROUPED by domain/file -- not one
//     cheap agent per finding.
//   - parallel(): all module audits fan out at once; synthesis runs after.
// ---------------------------------------------------------------------------

const REPO = '/Users/mac/Desktop/strideshift2026/Componets/strideshift-leads-sleuth'

const scope = (typeof args === 'string' && args.trim()) ? args.trim() : null
const scopeLine = scope
  ? `Audit ONLY this slice of the repo: ${scope}`
  : 'Audit the whole repository.'

const ORG_PREAMBLE =
  `Repo root: ${REPO}\n` +
  `READ for intent (do NOT edit any .org file): PRODUCT_CONTEXT.org (intentional ` +
  `decisions), DEFERRED.org (dormant + scheduled-for-removal). The module's own ` +
  `quick_reference.org is the local truth for that module.\n`

// ----- schemas -------------------------------------------------------------

const RESCOUT_SCHEMA = {
  type: 'object',
  properties: {
    targets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          app: { type: 'string' },
          module: { type: 'string' },
          path: { type: 'string' },
          qrPath: { type: 'string', description: 'quick_reference.org path if present, else empty' },
          critical: { type: 'string', description: 'what "critical" means for THIS module' },
        },
        required: ['module', 'path'],
      },
    },
  },
  required: ['targets'],
}

const MICRO_SCHEMA = {
  type: 'object',
  properties: {
    module: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'file:line' },
          issue: { type: 'string' },
          mechanical: { type: 'boolean', description: 'true=mechanical (no runtime behavior change); false=logical' },
          critical: { type: 'boolean', description: 'true=on the critical path; false=peripheral' },
          lifecycle: { type: 'string', enum: ['Active', 'Intentionally Dormant', 'Scheduled for Removal', 'Stale'] },
          blastRadius: { type: 'string' },
          coupling: { type: 'string' },
          stateful: { type: 'string' },
          testCoverage: { type: 'string' },
          disposition: {
            type: 'string',
            enum: ['flow-auto', 'flagged', 'human-global'],
            description: 'flow-auto = mechanical/local (auto-fixable, NOT applied); flagged = edge-of-logical, low blast + well tested; human-global = critical+logical / high blast / stateful',
          },
          suggestedFix: { type: 'string' },
        },
        required: ['location', 'issue', 'mechanical', 'critical', 'lifecycle', 'disposition', 'suggestedFix'],
      },
    },
    qrAccuracy: { type: 'array', items: { type: 'string' }, description: 'quick_reference.org claims that are inaccurate vs code' },
    productContextAlignment: { type: 'array', items: { type: 'string' } },
  },
  required: ['module', 'findings'],
}

// ----- B0: re-scout the settled tree ---------------------------------------

phase('Re-scout')
const rescout = await agent(
  `${ORG_PREAMBLE}\n` +
  `You are the RE-SCOUT for a micro code-health audit. The macro/structural pass ` +
  `has already settled, so audit the tree AS IT IS NOW.\n` +
  `${scopeLine}\n\n` +
  `Emit a FLAT list of audit targets -- one entry per module/unit worth a ` +
  `code-level review. For a monorepo, flatten to (app, module) pairs; do not nest. ` +
  `For each target note its path, its quick_reference.org path if one exists, and a ` +
  `one-line definition of what "critical" means for that module (its primary data ` +
  `flow / core path). Use ls/Glob/Read; honor the scope above.`,
  { schema: RESCOUT_SCHEMA, model: 'sonnet', label: 'rescout' }
)
log(`re-scout: ${rescout.targets.length} module target(s)`)

// ----- B1: per-module audit (parallel Sonnet fan-out) ----------------------

phase('Audit')
const perModule = (await parallel(
  rescout.targets.map((t) => () =>
    agent(
      `${ORG_PREAMBLE}\n` +
      `You are auditing ONE module for code health. Read its ` +
      `quick_reference.org first (${t.qrPath || 'none -- note its absence'}) so you ` +
      `know the documented patterns.\n` +
      `Module: ${t.module}   Path: ${t.path}\n` +
      `"Critical" here means: ${t.critical || 'primary data flow / core path'}\n\n` +
      `Find code-health issues. Evaluate against: function length, nesting depth, ` +
      `parameter count, mixed abstraction levels, duplication, dead code, error- ` +
      `handling consistency. Driving question: "could someone unfamiliar understand ` +
      `each function without scrolling?" Don't flag things that are fine in context.\n\n` +
      `Classify EVERY finding:\n` +
      `  - mechanical (no runtime behavior change) vs logical\n` +
      `  - critical (on the path above) vs peripheral\n` +
      `  - lifecycle (Active / Intentionally Dormant / Scheduled for Removal / Stale) ` +
      `-- cross-check DEFERRED.org; dead code in an Intentionally-Dormant area is NOT dead\n` +
      `  - enrichment (blast radius, coupling, stateful?, test coverage) on ` +
      `critical+logical items\n` +
      `  - disposition: flow-auto (mechanical/local) | flagged (edge-of-logical: ` +
      `logical but low blast + well tested) | human-global (critical+logical / high ` +
      `blast / stateful / unknown)\n\n` +
      `Be precise and conservative: only report issues you can defend at file:line. ` +
      `A human will review these directly against PRODUCT_CONTEXT.org -- there is no ` +
      `committee to catch false positives, so do not pad the list.\n\n` +
      `Also report any quick_reference.org claims that are now inaccurate, and any ` +
      `dormant items missing rationale in PRODUCT_CONTEXT.org.\n\n` +
      `READ-ONLY: do not edit any file. Return classified findings.`,
      { schema: MICRO_SCHEMA, model: 'sonnet', phase: 'Audit', label: `micro:${t.module}` }
    )
  )
)).filter(Boolean)

const allFindings = perModule.flatMap(m => (m.findings || []).map(f => ({ ...f, module: m.module })))
const humanGlobal = allFindings.filter(f => f.disposition === 'human-global').length
const flowAuto = allFindings.filter(f => f.disposition === 'flow-auto').length
log(`audit: ${allFindings.length} finding(s) across ${perModule.length} module(s) -- ${humanGlobal} human-global, ${flowAuto} flow-auto`)

// ----- B4: synthesis -> focused plan + report file -------------------------
// The script sandbox has no filesystem access, so the synthesis agent writes the
// report. It is granted a NARROW exception to the read-only rule: it may Write
// exactly ONE file (the report under audits/) and nothing else. Source/.org files
// remain untouched. Path is deterministic from scope (no date in the script -- the
// agent stamps today's date into the filename from its own environment).

const scopeSlug = scope ? scope.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') : 'full-repo'
const reportPath = `${REPO}/audits/audit-micro_${scopeSlug}_<TODAY>.md`

phase('Synthesize')
const report = await agent(
  `You are the SYNTHESIS agent for a micro code-health audit. Below are the ` +
  `classified findings as JSON, grouped by module. There was NO verify committee: ` +
  `the human will screen these for false positives and intent post-hoc, so present ` +
  `them clearly and DO NOT silently drop anything except per the lifecycle rule ` +
  `below.\n\n` +
  `Lifecycle rule: move Intentionally Dormant / Scheduled for Removal items to the ` +
  `appendix (out of the priority tables) but keep them visible so the human can ` +
  `sanity-check the lifecycle call.\n\n` +
  `Findings:\n${JSON.stringify(perModule, null, 2)}\n\n` +
  `Produce ONE FOCUSED markdown report -- this is the only thing that crosses back:\n` +
  `  1. ## Summary -- 2-4 sentences. State clearly this was a DRY RUN: nothing was ` +
  `applied. Note there was no committee and findings need a human intent/false-positive ` +
  `screen.\n` +
  `  2. ## Needs your judgment (human-global) -- table of critical+logical ` +
  `items: Module | Location | Issue | Blast Radius | Coupling | Stateful? | Test Coverage | ` +
  `Suggested Fix. This is the heart of the report.\n` +
  `  3. ## Edge-of-logical (flagged) -- 'flagged' items (logical but low blast + well ` +
  `tested): Module | Location | Issue | Suggested Fix.\n` +
  `  4. ## Auto-fixable mechanical (dry-run, NOT applied) -- compact appendix of ` +
  `'flow-auto' items: Module | Location | Issue | Suggested Fix. These are the safe ` +
  `mechanical fixes to apply first under the human gate.\n` +
  `  5. ## quick_reference.org accuracy -- merged QR drift notes.\n` +
  `  6. ## PRODUCT_CONTEXT alignment -- merged dormancy/intent gaps.\n` +
  `  7. ## Appendix: dropped on lifecycle grounds -- Intentionally Dormant / ` +
  `Scheduled for Removal items, with their lifecycle tag and a one-line note.\n\n` +
  `OUTPUT: Write the finished report to exactly this path, replacing <TODAY> with ` +
  `today's date in YYYY-MM-DD form:\n  ${reportPath}\n` +
  `Prepend a two-line HTML-comment header recording: scope=${scope || 'full-repo'}, ` +
  `the dry-run notice, and the instrumented tallies (re-scout targets, total ` +
  `findings, human-global count, flow-auto count). This ONE file is the only thing ` +
  `you may write -- do NOT edit any source file or any .org file. Then return the ` +
  `same markdown as your final text.`,
  { model: 'sonnet', label: 'synthesize' }
)

log(`report written under audits/audit-micro_${scopeSlug}_<date>.md`)
return report
