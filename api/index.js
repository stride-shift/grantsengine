import app from '../server/app.js';
import { initDb } from '../server/db.js';

// Run schema migrations on Vercel cold start
let _dbReady = null;
const ensureDb = () => {
  if (!_dbReady) _dbReady = initDb().catch(e => { console.error('initDb failed:', e.message); _dbReady = null; });
  return _dbReady;
};

// Wrap app to ensure DB is ready before handling requests
const handler = async (req, res) => {
  await ensureDb();
  return app(req, res);
};

export default handler;
