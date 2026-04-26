/**
 * TalentAI — Express Server Entry Point
 * Catalyst Hackathon 2025 | Siddhesh Bhosale
 *
 * Database : SQLite via sql.js (pure JS/WASM — no build tools needed on Windows)
 * AI       : Google Gemini 2.0 Flash (user pastes key in UI)
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');

const { initDb, queryOne }   = require('./src/db/database');
const { seedCandidates }     = require('./src/db/seed');
const { rateLimiter }        = require('./src/config/rateLimit');
const agentRoutes            = require('./src/api/agent.routes');
const candidateRoutes        = require('./src/api/candidate.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "api.fontshare.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "api.fontshare.com"],
      fontSrc:    ["'self'", "fonts.gstatic.com", "api.fontshare.com"],
      connectSrc: ["'self'", "generativelanguage.googleapis.com"],
      imgSrc:     ["'self'", "data:"],
    },
  },
}));
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : '*' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', rateLimiter);

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
}));

app.use('/api/agent',      agentRoutes);
app.use('/api/candidates', candidateRoutes);

app.get('/api/health', (req, res) => {
  try {
    const candidates  = queryOne("SELECT COUNT(*) AS n FROM candidates WHERE source='builtin'")?.n || 0;
    const runs        = queryOne("SELECT COUNT(*) AS n FROM agent_runs")?.n || 0;
    const csvSessions = queryOne("SELECT COUNT(DISTINCT session_id) AS n FROM candidates WHERE source='csv'")?.n || 0;
    res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString(),
               env: process.env.NODE_ENV, db: { candidates, runs, csvSessions } });
  } catch {
    res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ── Boot: init DB first (async), then start server ────────────────────────────
(async () => {
  try {
    await initDb();      // loads/creates SQLite DB
    seedCandidates();    // seeds 30 built-in candidates if table is empty

    app.listen(PORT, () => {
      console.log('\n🎯 TalentAI Server started');
      console.log(`   → Local:  http://localhost:${PORT}`);
      console.log(`   → ENV:    ${process.env.NODE_ENV || 'development'}`);
      console.log(`   → DB:     ./data/talentai.db`);
      console.log(`   → Gemini: ${process.env.GEMINI_API_KEY ? '✓ key configured' : '○ users paste key in UI'}\n`);
    });
  } catch (err) {
    console.error('[FATAL] Startup failed:', err.message);
    process.exit(1);
  }
})();

module.exports = app;
