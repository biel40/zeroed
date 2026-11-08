-- Password and Google sign-in. Times are Unix milliseconds.

-- `passwords.ts` format; null until the account registers a password (seeded testers, link or Google sign-ins).
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Wrong passwords, kept only for rate limiting; requester_hash is a hash of the client IP.
CREATE TABLE password_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  requester_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX password_failures_email ON password_failures (email, created_at);
CREATE INDEX password_failures_requester ON password_failures (requester_hash, created_at);
