/**
 * repositories.js — Database Access Layer
 *
 * RULE: Inside runTransaction(), always use db.run() (the raw sql.js method),
 * never the run() helper from database.js (which flushes to disk mid-transaction
 * and breaks sql.js transaction state).
 *
 * Outside transactions, use the run() helper freely — it flushes once per call.
 */

const { queryAll, queryOne, run, runTransaction, getDb, flush } = require('./database');
const { v4: uuid } = require('uuid');

// ── Internal row parsers ──────────────────────────────────────────────────────

function parseCandidate(row) {
  if (!row) return null;
  return { ...row, remote: row.remote === 1, skills: JSON.parse(row.skills || '[]') };
}

function parseShortlisted(row) {
  if (!row) return null;
  return {
    ...row,
    scoreBreakdown: JSON.parse(row.score_breakdown || '{}'),
    keySignals:     JSON.parse(row.key_signals     || '[]'),
    matchedSkills:  JSON.parse(row.matched_skills  || '[]'),
    missingSkills:  JSON.parse(row.missing_skills  || '[]'),
  };
}

// ── CandidateRepo ─────────────────────────────────────────────────────────────

const CandidateRepo = {
  getBuiltIn() {
    return queryAll("SELECT * FROM candidates WHERE source='builtin' ORDER BY id")
      .map(parseCandidate);
  },

  getBySession(sessionId) {
    return queryAll(
      'SELECT * FROM candidates WHERE session_id=? ORDER BY created_at',
      [sessionId]
    ).map(parseCandidate);
  },

  getById(id) {
    return parseCandidate(queryOne('SELECT * FROM candidates WHERE id=?', [String(id)]));
  },

  /**
   * Insert CSV-uploaded candidates under a session UUID.
   * Uses runTransaction with db.run() directly — no flush inside the loop.
   */
  insertCSVBatch(candidates, sessionId) {
    runTransaction((db) => {
      for (const c of candidates) {
        db.run(
          `INSERT INTO candidates
             (id, name, avatar, color, role, company, exp, location, remote,
              skills, salary, available, personality, bio, source, session_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            uuid(),
            c.name,
            c.avatar       || (c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()),
            c.color        || '#0090ff',
            c.role,
            c.company,
            c.exp          || 0,
            c.location,
            c.remote ? 1 : 0,
            JSON.stringify(c.skills || []),
            c.salary       || 0,
            c.available    || 'Not specified',
            c.personality  || 'professional',
            c.bio          || '',
            'csv',
            sessionId,
          ]
        );
      }
    });
    return this.getBySession(sessionId);
  },

  deleteSession(sessionId) {
    run('DELETE FROM candidates WHERE session_id=?', [sessionId]);
  },

  getSummary(sessionId = null) {
    const sql = sessionId
      ? `SELECT COUNT(*) AS total,
                ROUND(AVG(exp),1) AS avgExp,
                SUM(CASE WHEN remote=1 THEN 1 ELSE 0 END) AS remoteReady,
                SUM(CASE WHEN available='Immediately' THEN 1 ELSE 0 END) AS immediateAvail
         FROM candidates WHERE session_id=?`
      : `SELECT COUNT(*) AS total,
                ROUND(AVG(exp),1) AS avgExp,
                SUM(CASE WHEN remote=1 THEN 1 ELSE 0 END) AS remoteReady,
                SUM(CASE WHEN available='Immediately' THEN 1 ELSE 0 END) AS immediateAvail
         FROM candidates WHERE source='builtin'`;
    return queryOne(sql, sessionId ? [sessionId] : []);
  },
};

// ── RunRepo ───────────────────────────────────────────────────────────────────

const RunRepo = {
  create({ jdText, jdParsed, candidateSource, candidatesCount, topN }) {
    const id = uuid();
    run(
      `INSERT INTO agent_runs
         (id, jd_text, jd_parsed, candidate_source, candidates_count, top_n, status)
       VALUES (?,?,?,?,?,?,'running')`,
      [id, jdText, JSON.stringify(jdParsed), candidateSource, candidatesCount, topN]
    );
    return id;
  },

  complete(runId, durationMs) {
    run(
      `UPDATE agent_runs
       SET status='complete', duration_ms=?, completed_at=datetime('now')
       WHERE id=?`,
      [durationMs, runId]
    );
  },

  fail(runId, errorMessage) {
    run(
      `UPDATE agent_runs
       SET status='error', error_message=?, completed_at=datetime('now')
       WHERE id=?`,
      [errorMessage, runId]
    );
  },

  getById(runId) {
    const row = queryOne('SELECT * FROM agent_runs WHERE id=?', [runId]);
    if (!row) return null;
    return { ...row, jdParsed: JSON.parse(row.jd_parsed || '{}') };
  },

  getRecent(limit = 20) {
    return queryAll(
      `SELECT id, jd_parsed, candidate_source, candidates_count,
              top_n, status, duration_ms, created_at, completed_at
       FROM agent_runs ORDER BY created_at DESC LIMIT ?`,
      [limit]
    ).map(r => ({ ...r, jdParsed: JSON.parse(r.jd_parsed || '{}') }));
  },
};

// ── ShortlistRepo ─────────────────────────────────────────────────────────────

const ShortlistRepo = {
  /**
   * Persist the ranked shortlist (and simulated conversations) for a run.
   * Everything in one transaction → one flush at the end.
   */
  saveShortlist(runId, candidates) {
    runTransaction((db) => {
      for (const c of candidates) {
        const shortlistedId = uuid();

        db.run(
          `INSERT INTO shortlisted
             (id, run_id, candidate_id, rank, match_score, interest_score, combined_score,
              score_breakdown, match_reason, interest_reason, red_flags,
              key_signals, matched_skills, missing_skills, summary)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            shortlistedId,
            runId,
            String(c.id),
            c.rank,
            c.matchScore,
            c.interestScore ?? null,
            c.combinedScore,
            JSON.stringify(c.scoreBreakdown    || {}),
            c.matchReason    || null,
            c.interestReason || null,
            c.redFlags       || null,
            JSON.stringify(c.keySignals    || []),
            JSON.stringify(c.matchedSkills || []),
            JSON.stringify(c.missingSkills || []),
            c.summary        || null,
          ]
        );

        // Persist simulated conversation messages
        (c.conversation || []).forEach((msg, idx) => {
          db.run(
            `INSERT INTO conversations
               (id, shortlisted_id, run_id, candidate_id, turn_index, role, message, is_live)
             VALUES (?,?,?,?,?,?,?,0)`,
            [uuid(), shortlistedId, runId, String(c.id), idx, msg.role, msg.text]
          );
        });
      }
    });
  },

  /** Load full shortlist for a run, joining candidate profile data. */
  getByRun(runId) {
    const rows = queryAll(
      `SELECT s.*,
              c.name, c.avatar, c.color,
              c.role AS cRole, c.company, c.exp,
              c.location, c.remote, c.skills,
              c.salary, c.available, c.personality, c.bio
       FROM shortlisted s
       JOIN candidates c ON c.id = s.candidate_id
       WHERE s.run_id=? ORDER BY s.rank ASC`,
      [runId]
    );

    return rows.map(row => {
      const s     = parseShortlisted(row);
      const turns = queryAll(
        `SELECT role, message AS text, is_live
         FROM conversations
         WHERE shortlisted_id=? ORDER BY turn_index ASC`,
        [row.id]
      );

      return {
        id:             row.candidate_id,
        name:           row.name,
        avatar:         row.avatar,
        color:          row.color,
        role:           row.cRole,
        company:        row.company,
        exp:            row.exp,
        location:       row.location,
        remote:         row.remote === 1,
        skills:         JSON.parse(row.skills || '[]'),
        salary:         row.salary,
        available:      row.available,
        personality:    row.personality,
        bio:            row.bio,
        rank:           row.rank,
        matchScore:     row.match_score,
        interestScore:  row.interest_score,
        combinedScore:  row.combined_score,
        scoreBreakdown: s.scoreBreakdown,
        matchReason:    row.match_reason,
        interestReason: row.interest_reason,
        redFlags:       row.red_flags,
        keySignals:     s.keySignals,
        matchedSkills:  s.matchedSkills,
        missingSkills:  s.missingSkills,
        summary:        row.summary,
        conversation:   turns,
      };
    });
  },
};

// ── ConversationRepo ──────────────────────────────────────────────────────────

const ConversationRepo = {
  /** Save a live (interactive) chat message. Uses run() — single write, fine outside transaction. */
  saveLiveTurn({ runId, candidateId, turnIndex, role, message }) {
    const s = queryOne(
      'SELECT id FROM shortlisted WHERE run_id=? AND candidate_id=?',
      [runId, String(candidateId)]
    );
    if (!s) return null;

    const id = uuid();
    run(
      `INSERT INTO conversations
         (id, shortlisted_id, run_id, candidate_id, turn_index, role, message, is_live)
       VALUES (?,?,?,?,?,?,?,1)`,
      [id, s.id, runId, String(candidateId), turnIndex, role, message]
    );
    return id;
  },

  getForCandidate(runId, candidateId) {
    return queryAll(
      `SELECT role, message AS text, is_live, created_at
       FROM conversations
       WHERE run_id=? AND candidate_id=?
       ORDER BY turn_index ASC`,
      [runId, String(candidateId)]
    );
  },
};

module.exports = { CandidateRepo, RunRepo, ShortlistRepo, ConversationRepo };