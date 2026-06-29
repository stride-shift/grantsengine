// Barrel module — server/db.js was split into domain modules under server/db/.
// Every symbol previously exported from this file is re-exported here UNCHANGED so
// the ~14 modules that `import { … } from './db.js'` keep working. The shared core
// (lazy pool singleton, initDb, uid, AI-data + JSON helpers) lives in ./db/pool.js;
// each domain file imports what it needs from there.
//
// NOTE: only the symbols the original db.js exported are re-exported. pool.js also
// exports AI_KEYS/extractAiData/safeJSON/pool for internal cross-module use, but
// those were never part of db.js's public surface, so they are NOT re-exported here.

// Shared core: initDb + uid were the only pool.js symbols originally public; pool is default.
export { pool as default, uid, initDb } from './db/pool.js';

export * from './db/orgs.js';
export * from './db/auth.js';
export * from './db/team.js';
export * from './db/grants.js';
export * from './db/profile.js';
export * from './db/compliance.js';
export * from './db/activity.js';
export * from './db/kv.js';
export * from './db/funders.js';
export * from './db/uploads.js';
export * from './db/autofill.js';
