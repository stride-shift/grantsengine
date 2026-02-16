-- Run this in Supabase Dashboard → SQL Editor to create all tables

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  country TEXT DEFAULT 'South Africa',
  currency TEXT DEFAULT 'ZAR',
  setup_phase INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_profiles (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  mission TEXT,
  programmes TEXT DEFAULT '[]',
  impact_stats TEXT DEFAULT '{}',
  tone TEXT,
  anti_patterns TEXT,
  past_funders TEXT,
  context_full TEXT,
  context_slim TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_config (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  email_enabled INTEGER DEFAULT 0,
  email_addresses TEXT DEFAULT '[]',
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass TEXT,
  whatsapp_enabled INTEGER DEFAULT 0,
  whatsapp_numbers TEXT DEFAULT '[]',
  twilio_sid TEXT,
  twilio_token TEXT,
  twilio_from TEXT,
  inapp_enabled INTEGER DEFAULT 1,
  quiet_hours_start INTEGER,
  quiet_hours_end INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role TEXT DEFAULT 'pm',
  email TEXT,
  phone TEXT,
  persona TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_auth (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  funder TEXT,
  type TEXT,
  stage TEXT DEFAULT 'scouted',
  ask REAL DEFAULT 0,
  deadline TEXT,
  focus TEXT DEFAULT '[]',
  geo TEXT DEFAULT '[]',
  rel TEXT DEFAULT 'Cold',
  pri INTEGER DEFAULT 3,
  hrs REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  log TEXT DEFAULT '[]',
  on_factors TEXT DEFAULT '',
  off_factors TEXT DEFAULT '[]',
  owner TEXT DEFAULT 'team',
  docs TEXT DEFAULT '{}',
  fups TEXT DEFAULT '[]',
  sub_date TEXT,
  apply_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grants_org ON grants(org_id);
CREATE INDEX IF NOT EXISTS idx_grants_stage ON grants(org_id, stage);

CREATE TABLE IF NOT EXISTS funder_strategies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  funder_name TEXT NOT NULL,
  funder_type TEXT,
  lead TEXT,
  hook TEXT,
  sections TEXT,
  lang TEXT,
  budget_emphasis TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fstrat_org ON funder_strategies(org_id);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  gate TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  requested_by TEXT,
  reviews TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  grant_id TEXT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  extracted_text TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploads_org ON uploads(org_id);

CREATE TABLE IF NOT EXISTS compliance_docs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'missing',
  expiry TEXT,
  uploaded_date TEXT,
  file_name TEXT,
  file_size INTEGER,
  notes TEXT,
  upload_id TEXT REFERENCES uploads(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cdocs_org ON compliance_docs(org_id);

CREATE TABLE IF NOT EXISTS pipeline_config (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  stages TEXT NOT NULL,
  gates TEXT DEFAULT '{}',
  funder_types TEXT DEFAULT '[]',
  win_factors TEXT DEFAULT '[]',
  loss_factors TEXT DEFAULT '[]',
  doc_requirements TEXT DEFAULT '{}',
  roles TEXT DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  grant_id TEXT,
  agent_type TEXT NOT NULL,
  prompt_summary TEXT,
  result_summary TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aruns_org ON agent_runs(org_id);

CREATE TABLE IF NOT EXISTS kv (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (org_id, key)
);
