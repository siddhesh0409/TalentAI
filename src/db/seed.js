/**
 * seed.js — Seeds 30 built-in candidates on first run.
 * Uses getDb() directly inside a transaction for one single disk write.
 */

const { queryOne, getDb, flush } = require('./database');
const { getAll } = require('../data/candidates');

function seedCandidates() {
  const row = queryOne("SELECT COUNT(*) AS n FROM candidates WHERE source='builtin'");
  if (row && Number(row.n) > 0) {
    console.log(`[Seed] ${row.n} built-in candidates already in DB — skipping`);
    return;
  }

  const db = getDb();
  const candidates = getAll();

  // Use a single transaction — all 30 inserts, then one flush
  db.run('BEGIN');
  try {
    for (const c of candidates) {
      db.run(
        `INSERT OR IGNORE INTO candidates
           (id, name, avatar, color, role, company, exp, location, remote,
            skills, salary, available, personality, bio, source)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          String(c.id), c.name, c.avatar, c.color, c.role, c.company,
          c.exp, c.location, c.remote ? 1 : 0, JSON.stringify(c.skills),
          c.salary || 0, c.available, c.personality, c.bio, 'builtin',
        ]
      );
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  flush(); // single disk write after all 30 inserts
  console.log(`[Seed] Inserted ${candidates.length} built-in candidates into SQLite`);
}

module.exports = { seedCandidates };