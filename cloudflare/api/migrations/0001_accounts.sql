-- Web accounts and premium entitlements. Times are Unix milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- product_id is a ProductId, or '*' for every premium product present and future (closed-beta testers).
CREATE TABLE grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('beta', 'purchase', 'manual')),
  external_ref TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE (user_id, product_id, source)
);

-- Single-use magic links; requester_hash is a hash of the client IP, kept only for rate limiting.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  requester_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX login_tokens_email ON login_tokens (email, created_at);
CREATE INDEX login_tokens_requester ON login_tokens (requester_hash, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);
