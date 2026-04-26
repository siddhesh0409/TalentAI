/**
 * database.js — SQLite via sql.js (pure JavaScript/WebAssembly)
 *
 * KEY RULE for sql.js transactions:
 *   db.export() (flush) must NEVER be called while a transaction is open.
 *   sql.js resets internal state on export, which closes any open transaction.
 *   So: BEGIN → all db.run() calls → COMMIT → then flush().
 *   Never call the `run()` helper (which auto-flushes) inside a transaction.
 *   Use `getDb().run()` directly inside transactions instead.
 */

const initSqlJs = require('sql.js');
const path      = require('path');
const fs        = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'talentai.db');

let _db  = null;
let _SQL = null;

// ── Init (async — await this before starting the server) ─────────────────────
async function initDb() {
  if (_db) return _db;

  _SQL = await initSqlJs();

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    _db = new _SQL.Database(fs.readFileSync(DB_PATH));
    console.log(`[DB] Loaded → ${DB_PATH}`);
  } else {
    _db = new _SQL.Database();
    console.log(`[DB] Created → ${DB_PATH}`);
  }

  _createSchema();
  flush();
  return _db;
}

// ── Singleton getter ──────────────────────────────────────────────────────────
function getDb() {
  if (!_db) throw new Error('Database not initialised. Await initDb() first.');
  return _db;
}

// ── Flush in-memory DB to disk ────────────────────────────────────────────────
// WARNING: Do NOT call this while a transaction is open in sql.js.
function flush() {
  if (!_db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/** SELECT → array of plain objects */
function queryAll(sql, params = []) {
  const db   = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** SELECT → first row or null */
function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

/**
 * Single INSERT / UPDATE / DELETE outside a transaction.
 * Flushes to disk after every call — do NOT use inside a transaction.
 */
function run(sql, params = []) {
  getDb().run(sql, params);
  flush();
}

/**
 * Run a batch of writes in a single transaction.
 * `fn` receives the raw sql.js db instance and must use db.run() directly.
 * Flush happens once after COMMIT — never mid-transaction.
 *
 * @param {function(db): void} fn
 */
function runTransaction(fn) {
  const db = getDb();
  db.run('BEGIN');
  try {
    fn(db);          // fn uses db.run() directly, not the run() helper
    db.run('COMMIT');
    flush();         // single flush after successful commit
  } catch (err) {
    try { db.run('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw err;
  }
}

// ── Schema ────────────────────────────────────────────────────────────────────
function _createSchema() {
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS candidates (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      avatar      TEXT    NOT NULL,
      color       TEXT    NOT NULL DEFAULT '#0090ff',
      role        TEXT    NOT NULL,
      company     TEXT    NOT NULL,
      exp         INTEGER NOT NULL DEFAULT 0,
      location    TEXT    NOT NULL,
      remote      INTEGER NOT NULL DEFAULT 0,
      skills      TEXT    NOT NULL DEFAULT '[]',
      salary      INTEGER          DEFAULT 0,
      available   TEXT             DEFAULT 'Not specified',
      personality TEXT             DEFAULT 'professional',
      bio         TEXT             DEFAULT '',
      source      TEXT    NOT NULL DEFAULT 'builtin',
      session_id  TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id               TEXT    PRIMARY KEY,
      jd_text          TEXT    NOT NULL,
      jd_parsed        TEXT    NOT NULL,
      candidate_source TEXT    NOT NULL DEFAULT 'builtin',
      candidates_count INTEGER NOT NULL DEFAULT 30,
      top_n            INTEGER NOT NULL DEFAULT 5,
      status           TEXT    NOT NULL DEFAULT 'running',
      error_message    TEXT,
      duration_ms      INTEGER,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      completed_at     TEXT
    );
    CREATE TABLE IF NOT EXISTS shortlisted (
      id              TEXT    PRIMARY KEY,
      run_id          TEXT    NOT NULL,
      candidate_id    TEXT    NOT NULL,
      rank            INTEGER NOT NULL,
      match_score     INTEGER NOT NULL,
      interest_score  INTEGER,
      combined_score  INTEGER NOT NULL,
      score_breakdown TEXT             DEFAULT '{}',
      match_reason    TEXT,
      interest_reason TEXT,
      red_flags       TEXT,
      key_signals     TEXT             DEFAULT '[]',
      matched_skills  TEXT             DEFAULT '[]',
      missing_skills  TEXT             DEFAULT '[]',
      summary         TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id             TEXT    PRIMARY KEY,
      shortlisted_id TEXT    NOT NULL,
      run_id         TEXT    NOT NULL,
      candidate_id   TEXT    NOT NULL,
      turn_index     INTEGER NOT NULL,
      role           TEXT    NOT NULL,
      message        TEXT    NOT NULL,
      is_live        INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_runs_created ON agent_runs(created_at);
    CREATE INDEX IF NOT EXISTS idx_short_run    ON shortlisted(run_id);
    CREATE INDEX IF NOT EXISTS idx_convo_short  ON conversations(shortlisted_id);
    CREATE INDEX IF NOT EXISTS idx_cand_source  ON candidates(source, session_id);
  `);
}

module.exports = { initDb, getDb, flush, queryAll, queryOne, run, runTransaction };