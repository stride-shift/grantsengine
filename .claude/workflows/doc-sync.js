export const meta = {
  name: 'doc-sync',
  description: 'Bottom-up .org documentation sync: scout scope -> per-QR fan-out (writes) -> L1B -> L1A -> read-only context-doc reconciliation notes. Edits present-state docs; leaves PRODUCT_CONTEXT/DEFERRED to the main agent.',
  whenToUse: 'After code changes, to bring the three-tier .org docs back in sync. Pass the main agent\'s short report of what changed. mode=focused (only the touched modules) or mode=full (every module). Writes QR/L1B/L1A directly; returns context-doc notes + a commit reminder for the main agent.',
  phases: [
    { title: 'Scout', detail: 'map report -> in-scope QRs/apps (focused) or all (full)' },
    { title: 'QR Sync', detail: 'one haiku per quick_reference.org, edits its own file', model: 'haiku' },
    { title: 'Service Docs', detail: 'one sonnet per app, updates L1B counts/links' },
    { title: 'Project Docs', detail: 'one sonnet, updates L1A root files', model: 'sonnet' },
    { title: 'Context Notes', detail: 'read-only drift notes for PRODUCT_CONTEXT/DEFERRED' },
  ],
}

// ---------------------------------------------------------------------------
// doc-sync  -- the DOCUMENTATION.org Part II procedure as a dynamic workflow.
//
// Design decisions (see DOC_SYNC_FLOW_DESIGN.md for the full rationale):
//
//   - TWO directions of truth. Present-state docs (QR / L1B / L1A) sync
//     BOTTOM-UP from code -- this flow writes them. Contextual docs
//     (PRODUCT_CONTEXT.org, DEFERRED.org) flow TOP-DOWN from the conversation
//     and CANNOT be inferred from code, so the flow never edits them; it only
//     emits read-only reconciliation NOTES for the main agent (P4).
//
//   - git is a HINT, not a fence. The operator does not always commit at the
//     doc-edit cadence, so every QR worker treats git log/diff as a starting
//     signal but validates against the ACTUAL current code as the source of
//     truth (catches uncommitted / off-cadence drift).
//
//   - Writes-on. Each worker edits ONLY its own file -> different files ->
//     no write conflict, no worktree isolation. Docs only: git-reversible,
//     never touches code or the prod DB.
//
//   - Orchestration lives in THIS script, not in agent nesting. Workers are
//     leaves; the "figuring-out" of focused scope is the SCOUT agent (P0).
//     Depth = staging here, not sub-agents spawning sub-agents.
//
//   - Models per the DOCUMENTATION.org map: haiku for bounded QR edits, sonnet
//     for cross-module L1B judgment and the whole-project L1A reconcile.
//     Set explicitly so fan-out never inherits an expensive session model.
//
//   - The flow does NOT commit. Per the "main only commits" decision, the main
//     agent applies the P4 context notes, then commits everything.
//
//   - Inversions != additions. A contract/behaviour FLIP (preview-only -> persists)
//     makes the old wording FALSE wherever it appears, so the flow handles it on
//     three fronts: (1) the SCOUT scopes by REFERENCE -- any doc that mentions the
//     flipped symbol is pulled in, even if its code did not change; (2) every worker
//     gets the inversion list and must RECONCILE (flip/delete stale wording), not
//     just append, reporting retired claims; (3) a zero-extra-agent CONSISTENCY
//     SWEEP -- the return hands the main agent a grep over ALL .org for the stale
//     phrases, catching survivors in files the fan-out never opened.
// ---------------------------------------------------------------------------

const REPO = '/Users/mac/Desktop/strideshift2026/Componets/strideshift-leads-sleuth'

// ----- args: { mode, report, since } (or a bare string = focused report) ----
// args may arrive three ways: a real object, a JSON-encoded string (the Workflow
// tool stringifies object args before the script sees them), or a bare focused-
// report string. Normalise first so {mode:'full'} works however it was passed.
let parsedArgs = args
if (typeof args === 'string') {
  const s = args.trim()
  if (s.startsWith('{') || s.startsWith('[')) {
    try { parsedArgs = JSON.parse(s) } catch { /* not JSON -> treat as bare report */ }
  }
}
const a = (parsedArgs && typeof parsedArgs === 'object') ? parsedArgs : {}
const report = (typeof parsedArgs === 'string' && parsedArgs.trim())
  ? parsedArgs.trim()
  : (a.report || '').trim()
const since = (a.since || '').trim()
// focused if a report scopes the work; full otherwise (or when explicitly asked)
const mode = a.mode === 'full' || (!report && a.mode !== 'focused') ? 'full' : 'focused'

const reportBlock = report
  ? `MAIN-AGENT REPORT (what changed / what we worked on):\n${report}\n`
  : `No report supplied -- treat as a blanket sync.\n`
const sinceBlock = since ? `Operator hint -- changes since: ${since}\n` : ''

const PROCEDURE =
  `Repo root: ${REPO}\n` +
  `READ FIRST (do not edit): DOCUMENTATION.org -- Part II (Procedure) and the QR ` +
  `Format Template define exactly how to edit. The five principles in Part I bind ` +
  `every edit: present-state-only (no "Recent Changes"/"REMOVED"/historical ` +
  `language), tables over prose, document only the non-obvious (no transcribed ` +
  `interfaces, no line numbers), single source of truth (respect canonical homes), ` +
  `lean strategic docs.\n`

// ===========================================================================
// schemas
// ===========================================================================

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['focused', 'full'] },
    apps: {
      type: 'array',
      description: 'one entry per service/app that owns in-scope docs (e.g. backend, frontend)',
      items: {
        type: 'object',
        properties: {
          app: { type: 'string' },
          l1bFiles: {
            type: 'array', items: { type: 'string' },
            description: 'absolute paths to this app\'s Level-1B strategic .org files (ARCHITECTURE.org, API.org, ...)',
          },
          qrs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                module: { type: 'string' },
                path: { type: 'string', description: 'absolute path to the module directory' },
                qrPath: { type: 'string', description: 'absolute path to its quick_reference.org' },
                focusHint: { type: 'string', description: 'the specific, code-grounded change the report/diff implies for THIS module that its QR should reflect (e.g. "new leadsRepo.patchDealContext method"). Empty string if the module is included only for a routine no-op check.' },
              },
              required: ['module', 'qrPath'],
            },
          },
        },
        required: ['app', 'qrs'],
      },
    },
    rootL1A: {
      type: 'array', items: { type: 'string' },
      description: 'absolute paths to Level-1A root files that may need a counts/links update (README.org, ARCHITECTURE.org, ...)',
    },
    contractChanges: {
      type: 'array',
      description: 'behaviour/contract INVERSIONS the report implies (old behaviour -> new) -- e.g. an endpoint that was preview-only now persists. These ripple to EVERY doc that references the symbol, not just the module whose code changed. Empty array if the work is purely additive (new method/column, no behaviour flip).',
      items: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'the endpoint path or symbol whose behaviour changed, e.g. "POST /api/vendors/:id/generate-icp" or "generateIcp"' },
          from: { type: 'string', description: 'the now-FALSE prior behaviour, e.g. "preview-only, persists nothing"' },
          to: { type: 'string', description: 'the new behaviour, e.g. "auto-persists to vendors.icp_profile"' },
          staleTerms: { type: 'array', items: { type: 'string' }, description: 'literal phrases to grep for that signal the OLD behaviour, e.g. ["preview only", "persists nothing", "saved separately via PUT"]' },
        },
        required: ['symbol', 'from', 'to'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['mode', 'apps'],
}

const QR_SUMMARY = {
  type: 'object',
  properties: {
    module: { type: 'string' },
    changed: { type: 'boolean' },
    summary: { type: 'array', items: { type: 'string' }, description: '2-5 bullets of what was found/changed' },
    architecturalNotes: { type: 'array', items: { type: 'string' }, description: 'items that should surface to L1B/L1A, or empty' },
    retiredClaims: { type: 'array', items: { type: 'string' }, description: 'stale statements you DELETED or FLIPPED because the change inverted them (e.g. "removed preview-only/persists-nothing wording for generate-icp -> now auto-persists"). Empty if you only added facts. Feeds the post-sync consistency grep.' },
    qrSplitFlags: { type: 'array', items: { type: 'string' }, description: 'e.g. "exceeds 350 lines -- recommend split", or empty' },
  },
  required: ['module', 'changed'],
}

const L1B_SUMMARY = {
  type: 'object',
  properties: {
    app: { type: 'string' },
    changed: { type: 'boolean' },
    summary: { type: 'array', items: { type: 'string' } },
    l1aNotes: { type: 'array', items: { type: 'string' }, description: 'items to surface to Level 1A, or empty' },
    retiredClaims: { type: 'array', items: { type: 'string' }, description: 'stale statements you DELETED or FLIPPED because the change inverted them. Empty if you only added facts. Feeds the post-sync consistency grep.' },
  },
  required: ['app', 'changed'],
}

const L1A_SUMMARY = {
  type: 'object',
  properties: {
    changed: { type: 'boolean' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    summary: { type: 'array', items: { type: 'string' } },
  },
  required: ['changed'],
}

const CONTEXT_NOTES = {
  type: 'object',
  properties: {
    anyFound: { type: 'boolean' },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', enum: ['PRODUCT_CONTEXT.org', 'DEFERRED.org'] },
          item: { type: 'string', description: 'the existing entry this concerns' },
          observation: { type: 'string', description: 'what the code/QR changes imply about it' },
          suggestedAction: { type: 'string', description: 'e.g. "remove from DEFERRED -- appears implemented", "verify still intentional"' },
        },
        required: ['file', 'observation', 'suggestedAction'],
      },
    },
  },
  required: ['anyFound'],
}

// ===========================================================================
// P0 -- SCOUT: resolve scope (figuring-out lives here, not in nesting)
// ===========================================================================

phase('Scout')
const scout = await agent(
  `${PROCEDURE}\n` +
  `You are the SCOUT for a documentation sync. Decide WHICH docs are in scope, then ` +
  `emit the target list -- you edit nothing.\n\n` +
  `Mode: ${mode}\n${reportBlock}${sinceBlock}\n` +
  `Find every quick_reference.org in the repo (Glob "**/quick_reference.org", skip ` +
  `node_modules) and group them under their owning app/service. For each app also ` +
  `list its Level-1B strategic .org files, and list the Level-1A root files.\n\n` +
  (mode === 'focused'
    ? `FOCUSED: include ONLY the modules/apps the report implies were touched. Use ` +
      `git (log/diff) AND the report to decide. When unsure whether a module is in ` +
      `scope, INCLUDE it -- a no-op QR check is cheap, a missed drift is not.\n`
    : `FULL: include every module, every app, every L1A root file. The report/since ` +
      `hint only prioritises; nothing is excluded.\n`) +
  `\nFor EACH quick_reference in scope, set =focusHint= to the specific, code-grounded ` +
  `change the report/diff implies for THAT module — name the symbol/file (e.g. "new ` +
  `leadsRepo.patchDealContext: read-merge-write into data.dealContext"). This is what ` +
  `the worker would most easily miss on a blind code sweep, so be concrete. Leave it an ` +
  `empty string for modules pulled in only as a routine no-op check. Do NOT omit a ` +
  `module just because the report does not mention it — set focusHint='' and still ` +
  `include it.\n\n` +
  `CONTRACT/BEHAVIOUR INVERSIONS (critical -- this is the failure mode this scout must ` +
  `prevent). A change that INVERTS behaviour (an endpoint that was preview-only now ` +
  `persists; sync->async; a removed thing re-added) is NOT the same as an addition: the ` +
  `old wording is now FALSE everywhere it appears. For each such inversion in the report:\n` +
  `  1. Populate =contractChanges= with { symbol, from, to, staleTerms } -- staleTerms = the ` +
  `literal phrases that signal the OLD behaviour (used later for a consistency grep).\n` +
  `  2. SCOPE BY REFERENCE, not just by touched code: a contract flip ripples to every doc ` +
  `that merely REFERENCES that symbol, even if the module's own code did not change. Grep ` +
  `the .org docs (\`grep -rn\` for the endpoint path / symbol name) and INCLUDE every QR and ` +
  `L1B file that mentions it. Set their =focusHint= to "contract flip: <symbol> <from> -> <to> ` +
  `-- find and flip the stale wording". (This is exactly the kind of file a code-diff scope ` +
  `misses: the API-client QR that documents an endpoint whose behaviour changed but whose ` +
  `wrapper code did not.)\n` +
  `If the work is purely additive, leave =contractChanges= empty.\n\n` +
  `Return the grouped target list.`,
  { schema: SCOUT_SCHEMA, model: 'sonnet', label: 'scout' }
)

const apps = (scout.apps || []).filter(app => app && (app.qrs || []).length)
const totalQRs = apps.reduce((n, app) => n + app.qrs.length, 0)
log(`scope=${mode}: ${apps.length} app(s), ${totalQRs} quick_reference(s)`)

// Contract inversions ripple to every layer: the same now-false wording can sit in a
// QR, an L1B file, and an L1A file. Build ONE block and inject it into every worker
// prompt so each retires the stale phrasing in its own file (and reports it back).
const contractChanges = scout.contractChanges || []
const contractBlock = contractChanges.length
  ? `CONTRACT/BEHAVIOUR INVERSIONS from this change -- the following statements are now ` +
    `FALSE wherever they appear. If THIS file references the symbol, you MUST flip/delete the ` +
    `stale wording; adding the new fact beside a contradicting old one is the bug to avoid. ` +
    `Record each stale claim you retire in =retiredClaims=.\n` +
    contractChanges.map(c =>
      `  - ${c.symbol}: WAS "${c.from}" -> NOW "${c.to}"` +
      ((c.staleTerms || []).length ? ` (stale phrases to hunt: ${c.staleTerms.join(', ')})` : '')
    ).join('\n') + `\n\n`
  : ''
if (contractChanges.length) log(`contract inversions: ${contractChanges.map(c => c.symbol).join(', ')}`)

// ===========================================================================
// P1 -> P2 -- per app: QR fan-out (haiku, writes) then L1B (sonnet, writes)
// Apps run concurrently; within an app the L1B waits only on ITS OWN QRs.
// (No global barrier: backend L1B can run while frontend QRs are still going.)
// ===========================================================================

phase('QR Sync')
const perApp = (await parallel(apps.map(app => async () => {

  // --- P1: one haiku per quick_reference.org, each edits ONLY its own file ---
  const qrSummaries = (await parallel(app.qrs.map(qr => () =>
    agent(
      `${PROCEDURE}\n` +
      `You are syncing ONE module's quick_reference.org and NOTHING else.\n` +
      `Module: ${qr.module}\nModule dir: ${qr.path || '(infer from the QR path)'}\n` +
      `quick_reference.org: ${qr.qrPath}\n\n` +
      (qr.focusHint
        ? `EXPECTED CHANGE (from the sync scout -- what the latest work implies for THIS ` +
          `module): ${qr.focusHint}\n` +
          `Treat this as a lead you MUST run down, not as gospel: confirm it against the ` +
          `actual code and document it if real. This is a STARTING point, not the whole job -- ` +
          `still do the full STEP-3 reconciliation below; the module may carry other drift the ` +
          `scout did not flag.\n\n`
        : '') +
      contractBlock +
      `STEP 1 -- read the current quick_reference.org so you know what is documented.\n` +
      `STEP 2 -- find what changed. git is a HINT, not the boundary: run ` +
      `\`git log --oneline -15\` and \`git diff\` on this module's path for a starting ` +
      `signal, but the ACTUAL current code is the source of truth. Validate the QR ` +
      `against the real files regardless of what git shows -- the operator does not ` +
      `always commit at the doc cadence, so trust the code, not the log.\n` +
      `STEP 3 -- reconcile the QR against code: documented components/files still ` +
      `exist; new files/components not yet documented; removed items still listed; ` +
      `descriptions match current behaviour; new non-obvious patterns worth a row; ` +
      `Constraints & Gotchas still accurate. RECONCILE, DON'T JUST ADD: when the change ` +
      `INVERTS prior behaviour (preview->persist, sync->async, removed->re-added), find and ` +
      `rewrite/delete EVERY now-false statement -- adding the new fact next to a contradicting ` +
      `old one is the failure to avoid. List each stale claim you retire in =retiredClaims=.\n` +
      `  PRESENT-STATE OUTPUT CONTRACT: you THINK in diffs (to find drift) but you WRITE ` +
      `in present state. The doc body describes only what the code does NOW. Never write the ` +
      `transition into the file -- no "the old X was removed", "previously", "X now does Z ` +
      `instead of W", "contract flip", "bug fixed", "replaced by". That change-narrative is ` +
      `what =retiredClaims= is FOR -- it goes in your STRUCTURED RETURN, never in the .org file.\n` +
      `STEP 4 -- if (and only if) it is stale or incomplete, EDIT ${qr.qrPath} in ` +
      `place. Follow the QR Format Template: tables, file names only (NO line ` +
      `numbers), present-state language, descriptions 5-10 words, no transcribed ` +
      `interfaces. Bump "/Last Updated/:" to today ONLY if you actually changed content in ` +
      `this file, and keep it a BARE DATE (e.g. "/Last Updated/: 2026-06-03") -- never append ` +
      `a change summary or note to that line; a changelog there is a present-state violation. ` +
      `If nothing is stale, make NO edit at all -- leave the content AND the date untouched ` +
      `and return changed:false.\n\n` +
      `Edit ONLY this one file. If a finding belongs to a strategic (L1B/L1A) file, ` +
      `do NOT edit that file -- put it in architecturalNotes for the next layer.\n` +
      `Flag in qrSplitFlags if the QR exceeds ~350 lines or now spans 3+ ` +
      `subdirectories (recommend a split; do not split it yourself).\n\n` +
      `Return the compact summary.`,
      { schema: QR_SUMMARY, model: 'haiku', phase: 'QR Sync', label: `qr:${qr.module}` }
    )
  ))).filter(Boolean)

  // --- P2: one sonnet for this app's Level-1B strategic files ---
  let l1b = null
  if ((app.l1bFiles || []).length) {
    l1b = await agent(
      `${PROCEDURE}\n` +
      `You are updating the Level-1B strategic .org files for ONE app: ${app.app}.\n` +
      `L1B files (edit only these): ${app.l1bFiles.join(', ')}\n\n` +
      `Below are the Phase-1 summaries from this app's module quick_references -- the ` +
      `canonical detail now lives in those QRs. Your job is the LEAN strategic layer: ` +
      `update COUNTS and LINKS only, never duplicate QR detail. Apply structural ` +
      `changes (new/removed modules, changed entry points), new cross-cutting ` +
      `decisions, and endpoint changes for an app API.org.\n\n` +
      contractBlock +
      `An app API.org documents endpoint CONTRACTS, so it is the most likely place a ` +
      `behaviour inversion above still reads with stale wording -- RECONCILE, don't just add: ` +
      `flip/delete the now-false description, do not leave it beside the new one. Record ` +
      `retired claims in =retiredClaims=.\n\n` +
      `READ each L1B file before editing it; keep edits minimal; present-state-only ` +
      `(write what is true NOW, never the transition -- no "previously/removed/now does X ` +
      `instead"; retired wording goes in =retiredClaims=, not the file). Bump "/Last Updated/:" ` +
      `to today only on files you actually changed, as a BARE DATE with no appended note. ` +
      `Edit ONLY this app's L1B files.\n\n` +
      `QR summaries for ${app.app}:\n${JSON.stringify(qrSummaries, null, 2)}\n\n` +
      `Surface anything Level-1A must know (project-wide structure/decisions) in ` +
      `l1aNotes -- do not edit root files yourself.`,
      { schema: L1B_SUMMARY, model: 'sonnet', phase: 'Service Docs', label: `l1b:${app.app}` }
    )
  }

  return { app: app.app, qrSummaries, l1b }
}))).filter(Boolean)

phase('Service Docs')
const allQRSummaries = perApp.flatMap(x => x.qrSummaries || [])
const allL1B = perApp.map(x => x.l1b).filter(Boolean)
const qrChanged = allQRSummaries.filter(s => s.changed).length
log(`QR: ${qrChanged}/${allQRSummaries.length} updated; L1B: ${allL1B.filter(s => s.changed).length}/${allL1B.length} app file-sets updated`)

// ===========================================================================
// P3 -- L1A: one sonnet reconciles the project-wide root files from all summaries
// ===========================================================================

phase('Project Docs')
const escalations = [
  ...allQRSummaries.flatMap(s => s.architecturalNotes || []),
  ...allL1B.flatMap(s => s.l1aNotes || []),
]
const splitFlags = allQRSummaries.flatMap(s => (s.qrSplitFlags || []).map(f => `${s.module}: ${f}`))

const l1a = await agent(
  `${PROCEDURE}\n` +
  `You are updating the Level-1A project-wide strategic files. These stay LEAN: ` +
  `state counts and link to canonical homes (QRs / L1B), never reproduce detail. ` +
  `The project tree in README.org is canonical here.\n\n` +
  `Candidate L1A files: ${(scout.rootL1A || []).join(', ') || '(discover root *.org)'}\n\n` +
  `Update ONLY for project-wide signals: structural/navigation changes (README.org ` +
  `tree), new cross-cutting decisions or tech-stack changes (ARCHITECTURE.org), ` +
  `1A-level endpoint changes (API.org if present). Respect canonical homes -- if a ` +
  `fact's home is a QR, update the COUNT/LINK here, not the fact. READ each file ` +
  `before editing; minimal edits; present-state-only (write what is true NOW, never the ` +
  `transition -- no "previously/removed/now does X instead"). Bump "/Last Updated/:" to ` +
  `today only on files you actually changed, as a BARE DATE with no appended note.\n\n` +
  contractBlock +
  `Escalated notes from L1B/L2:\n${JSON.stringify(escalations, null, 2)}\n\n` +
  `QR-split flags (record nothing in docs; just so you have the picture):\n${JSON.stringify(splitFlags, null, 2)}\n\n` +
  `Do NOT touch PRODUCT_CONTEXT.org or DEFERRED.org -- those are the main agent's. ` +
  `Return what you changed.`,
  { schema: L1A_SUMMARY, model: 'sonnet', label: 'l1a' }
)
log(`L1A: ${l1a.changed ? 'updated ' + (l1a.filesTouched || []).join(', ') : 'no change needed'}`)

// ===========================================================================
// P4 -- CONTEXT NOTES: READ-ONLY reconciliation for PRODUCT_CONTEXT / DEFERRED
// Detects drift the code reveals; the MAIN AGENT applies it with the rationale
// only the conversation holds. This agent edits NOTHING.
// ===========================================================================

phase('Context Notes')
const ctx = await agent(
  `${PROCEDURE}\n` +
  `You are the CONTEXT-DOC RECONCILER. You edit NOTHING. You read two contextual ` +
  `files -- ${REPO}/PRODUCT_CONTEXT.org and ${REPO}/DEFERRED.org -- and, in light of ` +
  `the documentation changes just made, flag entries that look DRIFTED.\n\n` +
  `These files are NOT present-state-from-code: their truth comes from product ` +
  `decisions, not the source. So you do not rewrite them -- you produce OBSERVATIONS ` +
  `for the main agent, who holds the rationale.\n\n` +
  `Hunt specifically for: a DEFERRED/dormant item that now appears IMPLEMENTED ` +
  `(matching code/QR changes below) -> candidate for removal from DEFERRED; a ` +
  `PRODUCT_CONTEXT claim that the changes make stale or contradicted; a newly ` +
  `prominent feature with no PRODUCT_CONTEXT mention. Be conservative -- only flag ` +
  `what the evidence supports; an empty list is a fine answer.\n\n` +
  `${reportBlock}\n` +
  `What the sync changed:\n` +
  `QR summaries: ${JSON.stringify(allQRSummaries)}\n` +
  `L1B summaries: ${JSON.stringify(allL1B)}\n` +
  `L1A summary: ${JSON.stringify(l1a)}\n\n` +
  `Return observations only.`,
  { schema: CONTEXT_NOTES, model: 'sonnet', label: 'context-notes' }
)
log(`context notes: ${ctx.anyFound ? (ctx.observations || []).length + ' observation(s)' : 'none'}`)

// ===========================================================================
// RETURN -- markdown handoff for the main agent (it applies context + commits)
// ===========================================================================

const obsLines = (ctx.observations || []).length
  ? (ctx.observations || []).map(o => `- **${o.file}** — ${o.item ? `_${o.item}_: ` : ''}${o.observation}\n  - → ${o.suggestedAction}`).join('\n')
  : '_No drift detected. PRODUCT_CONTEXT.org / DEFERRED.org look consistent with the changes._'

const splitLines = splitFlags.length ? splitFlags.map(f => `- ${f}`).join('\n') : '_none_'

// Consistency sweep (zero extra agents): a contract inversion's old wording can survive in
// files the file-scoped fan-out never opened (the scope-by-reference gap). Aggregate the
// now-stale phrases the scout flagged + whatever the fan-out reports retiring, into ONE grep
// the MAIN agent (already in the loop to apply context notes + commit) runs over ALL .org docs.
const sweepPhrases = [...new Set(contractChanges.flatMap(c => c.staleTerms || []))]
const retired = [
  ...allQRSummaries.flatMap(s => s.retiredClaims || []),
  ...allL1B.flatMap(s => s.retiredClaims || []),
]
const sweepBlock = contractChanges.length
  ? `A contract was INVERTED, so the old wording is now false wherever it survived — ` +
    `including files this fan-out never opened. Run this grep across ALL .org docs and ` +
    `rewrite/delete any survivor:\n\`\`\`bash\n` +
    (sweepPhrases.length
      ? sweepPhrases.map(p => `grep -rniF ${JSON.stringify(p)} --include='*.org' .`).join('\n')
      : contractChanges.map(c => `grep -rniF ${JSON.stringify(c.symbol)} --include='*.org' .`).join('\n')) +
    `\n\`\`\`\n` +
    `Inversions: ${contractChanges.map(c => `${c.symbol} (${c.from} → ${c.to})`).join('; ')}.` +
    (retired.length ? `\nAlready retired by the fan-out: ${retired.join('; ')}.` : '')
  : '_No contract inversions reported — purely additive sync, no consistency grep needed._'

return (
  `# doc-sync — ${mode} mode\n\n` +
  `**Present-state docs were edited in place** (QR / L1B / L1A). Nothing was committed.\n\n` +
  `## Synced\n` +
  `- Quick references: **${qrChanged}/${allQRSummaries.length}** updated\n` +
  `- Service (L1B) doc-sets: **${allL1B.filter(s => s.changed).length}/${allL1B.length}** updated\n` +
  `- Project (L1A): ${l1a.changed ? '**updated** — ' + (l1a.filesTouched || []).join(', ') : 'no change needed'}\n\n` +
  `## Context docs — your turn\n` +
  `These were NOT edited (you own the rationale). Apply what holds, then they go in the same commit:\n\n` +
  `${obsLines}\n\n` +
  `## Consistency sweep — run this grep\n${sweepBlock}\n\n` +
  `## QR-split flags (your decision)\n${splitLines}\n\n` +
  `## Commit\n` +
  `After applying the context notes:\n` +
  `\`\`\`\ngit add '*.org' '**/quick_reference.org'\ngit commit -m "Sync .org documentation with current code"\n\`\`\`\n`
)
