export const meta = {
  name: 'audit-macro',
  description: 'Read-only macro architecture audit: topology scout -> per-domain architectural review -> consolidated report + restructuring spec. Applies nothing.',
  whenToUse: 'Structural/architecture audit of a repo (or a scoped slice). Read-only: produces findings + a restructuring spec for the human gate. Run BEFORE audit-micro; micro must run on a settled tree.',
  phases: [
    { title: 'Scout', detail: 'detect topology (single-app vs monorepo), emit domain list' },
    { title: 'Audit', detail: 'one agent per domain, architectural review' },
    { title: 'Synthesize', detail: 'consolidate findings + draft restructuring spec' },
  ],
}

// ---------------------------------------------------------------------------
// audit-macro  (Flow A of AUDIT_FLOW_DESIGN.md)  -- READ-ONLY v1
//
// v1 scope decisions:
//   - No A3 auto-carve. The git mv / rm / import-fixups stay main-agent-driven
//     behind the human gate (design sec 6.7). This flow only READS and REPORTS.
//   - Models: sonnet for reasoning agents (cost-aware fan-out; opus inheritance
//     would be expensive). Set explicitly rather than inheriting the session model.
// ---------------------------------------------------------------------------

const REPO = '/Users/mac/Desktop/strideshift2026/Componets/strideshift-leads-sleuth'

// scope arg: optional path slice (e.g. "services/api"); default = whole repo
const scope = (typeof args === 'string' && args.trim()) ? args.trim() : null
const scopeLine = scope
  ? `Audit ONLY this slice of the repo: ${scope}`
  : 'Audit the whole repository.'

const ORG_PREAMBLE =
  `Repo root: ${REPO}\n` +
  `Before reasoning, READ these .org files for project intent (do NOT edit them):\n` +
  `  - README.org (navigation hub), ARCHITECTURE.org (system design)\n` +
  `  - PRODUCT_CONTEXT.org (intentional design decisions -- do not flag intent as a bug)\n` +
  `  - DEFERRED.org (intentionally dormant + scheduled-for-removal -- do not flag dormancy)\n`

// ----- schemas -------------------------------------------------------------

const TOPO_SCHEMA = {
  type: 'object',
  properties: {
    shape: { type: 'string', enum: ['single-app', 'monorepo'] },
    domains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          kind: { type: 'string', description: 'app | service | shared | root | other' },
          note: { type: 'string' },
        },
        required: ['name', 'path'],
      },
    },
  },
  required: ['shape', 'domains'],
}

const MACRO_SCHEMA = {
  type: 'object',
  properties: {
    domain: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string' },
          type: {
            type: 'string',
            enum: ['Placement', 'Dormancy', 'Coupling', 'Naming', 'Outlived Doc', 'God-Module', 'Layering'],
          },
          lifecycle: {
            type: 'string',
            enum: ['Active', 'Intentionally Dormant', 'Scheduled for Removal', 'Stale'],
          },
          tier: { type: 'string', enum: ['T1', 'T2', 'T3'], description: 'T1 contained, T2 bounded ripple, T3 holistic/structural' },
          affectedPaths: { type: 'array', items: { type: 'string' } },
          crossRefs: { type: 'string', description: 'result of rg/grep: what imports or links to this' },
          suggestedAction: { type: 'string', description: 'Move | Rename | Delete | Archive | Decouple | Restructure | No-op' },
        },
        required: ['finding', 'type', 'lifecycle', 'tier', 'suggestedAction'],
      },
    },
    productContextAlignment: {
      type: 'array', items: { type: 'string' },
      description: 'dormant/deferred items lacking rationale in PRODUCT_CONTEXT.org / DEFERRED.org',
    },
  },
  required: ['domain', 'findings'],
}

// ----- A0: topology scout --------------------------------------------------

phase('Scout')
const topo = await agent(
  `${ORG_PREAMBLE}\n` +
  `You are the TOPOLOGY SCOUT for a macro architecture audit.\n` +
  `${scopeLine}\n\n` +
  `Detect the repo shape (single-app vs monorepo of apps+services) and emit the ` +
  `list of DOMAINS to audit -- the natural top-level units (apps, services, shared ` +
  `libs, the root itself). Honor the scope above: if a slice is given, only emit ` +
  `domains inside it. Use ls/Glob/Read on the root and the .org files; never hardcode.\n\n` +
  `Return the topology and a domain list.`,
  { schema: TOPO_SCHEMA, model: 'sonnet', label: 'scout' }
)
log(`topology: ${topo.shape} -- ${topo.domains.length} domain(s)`)

// ----- A1: per-domain architectural review (parallel) ----------------------

phase('Audit')
const perDomain = (await parallel(
  topo.domains.map(d => () =>
    agent(
      `${ORG_PREAMBLE}\n` +
      `You are auditing ONE domain in a macro architecture review.\n` +
      `Domain: ${d.name}  (kind: ${d.kind || 'unknown'})\n` +
      `Path: ${d.path}\n\n` +
      `Critique the SHAPE of this domain, not line-level code:\n` +
      `  - Layering & boundaries: misplaced responsibilities, leaky layers\n` +
      `  - God-modules: single files/dirs doing far too much\n` +
      `  - Cross-domain coupling: type drift, duplicated business rules, env sprawl\n` +
      `  - Placement: code colocated with the wrong consumer; config in the wrong tier\n` +
      `  - Dormant/stale trees: cross-check DEFERRED.org before flagging\n` +
      `  - Naming/structural consistency vs sibling modules\n` +
      `  - Outlived planning docs / generated artifacts cluttering the root\n\n` +
      `For anything you propose to move/delete, run \`rg -l\` / grep to find ` +
      `cross-references FIRST, and check git recency (git log --since="3 months ago" ` +
      `--name-only) before calling a tree "stale".\n\n` +
      `Tag each finding with lifecycle (Active / Intentionally Dormant / Scheduled for ` +
      `Removal / Stale) and a tier: T1 (contained, blast radius ~0), T2 (bounded ` +
      `ripple, dependents are a known set), T3 (holistic -- correct shape needs ` +
      `whole-domain reasoning). Default to Stale only when intent is genuinely ` +
      `undeterminable from the .org files.\n\n` +
      `READ-ONLY: do not edit any file. Return findings + any PRODUCT_CONTEXT ` +
      `alignment notes.`,
      { schema: MACRO_SCHEMA, model: 'sonnet', label: `macro:${d.name}` }
    )
  )
)).filter(Boolean)

const totalFindings = perDomain.reduce((n, d) => n + (d.findings?.length || 0), 0)
log(`macro audit: ${totalFindings} finding(s) across ${perDomain.length} domain(s)`)

// ----- A2: synthesis -> consolidated report + restructuring spec -----------

phase('Synthesize')
const report = await agent(
  `${ORG_PREAMBLE}\n` +
  `You are the SYNTHESIS agent for a macro architecture audit. Below are the ` +
  `per-domain findings as JSON. Produce ONE consolidated markdown report for a ` +
  `human reviewer -- this is the only thing that crosses back, so it must stand ` +
  `alone.\n\n` +
  `Per-domain findings:\n${JSON.stringify(perDomain, null, 2)}\n\n` +
  `Structure the report:\n` +
  `  1. ## Summary -- 2-4 sentences: the headline structural story.\n` +
  `  2. ## Findings -- one table, grouped by domain, columns: ` +
  `Finding | Type | Lifecycle | Tier | Affected Paths | Cross-Refs | Suggested Action.\n` +
  `     Move Intentionally-Dormant / Scheduled-for-Removal rows to a short appendix.\n` +
  `  3. ## Restructuring spec (T3 items only) -- for each holistic/structural ` +
  `finding, sketch the proposed new boundaries: the new units, each one's PUBLIC ` +
  `INTERFACE, and which existing pieces move where. This is the contract a future ` +
  `execute-carve step (or the main agent) would follow. If there are no T3 items, ` +
  `say so.\n` +
  `  4. ## PRODUCT_CONTEXT alignment -- merged notes for DEFERRED.org / ` +
  `PRODUCT_CONTEXT.org gaps.\n` +
  `  5. ## Human gate -- a one-line reminder that NOTHING was applied; the human ` +
  `must approve, apply, get tests green, and re-baseline BEFORE running audit-micro.\n\n` +
  `READ-ONLY: do not edit any file. Return the markdown report as your final text.`,
  { model: 'sonnet', label: 'synthesize' }
)

return report
