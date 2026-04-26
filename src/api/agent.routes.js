/**
 * agent.routes.js — Agent Pipeline API
 *
 * POST   /api/agent/run          Full 4-step pipeline via SSE (streams step events)
 * POST   /api/agent/parse        JD parse only (Step 1, no DB write)
 * POST   /api/agent/engage       One live chat turn (saved to DB)
 * POST   /api/agent/upload-csv   Parse CSV → save to DB → return sessionId
 * DELETE /api/agent/session/:id  Remove a CSV session from DB
 * GET    /api/agent/runs         Recent run history
 * GET    /api/agent/runs/:id     Full result for one past run
 */

const express = require('express');
const router  = express.Router();
const { v4: uuid } = require('uuid');

const { agentLimiter }      = require('../config/rateLimit');
const { validateAgentRequest, sanitiseString } = require('../utils/validate');
const { parseJD }           = require('../services/parser.service');
const { matchCandidates }   = require('../services/matcher.service');
const { engageCandidates }  = require('../services/engagement.service');
const { rankShortlist }     = require('../services/ranker.service');
const { callGemini }        = require('../services/gemini.service');
const { parseCsvCandidates } = require('../utils/csvParser');
const {
  RunRepo, ShortlistRepo, ConversationRepo, CandidateRepo,
} = require('../db/repositories');

// ── Full 4-step pipeline via SSE ──────────────────────────────────────────────
router.post('/run', agentLimiter, async (req, res) => {
  const errors = validateAgentRequest(req.body);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const jdText     = sanitiseString(req.body.jdText, 10000);
  const apiKey     = req.body.apiKey.trim();
  const topN       = Math.min(parseInt(req.body.topN) || 5, 8);
  const csvSession = req.body.csvSessionId || null;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const send = (type, payload) => {
    try { res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`); } catch (_) {}
  };

  const t0    = Date.now();
  let   runId = null;

  try {
    // ── Step 1: Parse JD ───────────────────────────────────────────────────
    send('step', { step: 1, state: 'running', detail: 'Sending JD to Gemini 2.0 Flash for extraction…' });
    send('log',  { msg: 'Initializing JD Parser…', mtype: '' });

    const jdParsed = await parseJD(jdText, apiKey);

    // Create run record in DB
    const pool = csvSession
      ? CandidateRepo.getBySession(csvSession)
      : CandidateRepo.getBuiltIn();

    runId = RunRepo.create({
      jdText,
      jdParsed,
      candidateSource:  csvSession ? 'csv' : 'builtin',
      candidatesCount:  pool.length,
      topN,
    });

    send('step',   { step: 1, state: 'done', detail: `✓ ${jdParsed.role} · ${jdParsed.requiredSkills.length} required skills extracted` });
    send('log',    { msg: `✓ Parsed: ${jdParsed.role} (${jdParsed.experience})`, mtype: 'ok' });
    send('parsed', { jdParsed });
    send('runId',  { runId });

    // ── Step 2: Match candidates ───────────────────────────────────────────
    send('step', { step: 2, state: 'running', detail: `Scoring ${pool.length} ${csvSession ? 'uploaded' : 'built-in'} candidates…` });
    send('log',  { msg: `Matching against ${pool.length} candidates in DB…`, mtype: '' });

    const matched = await matchCandidates(jdParsed, apiKey, 8, csvSession);

    send('step', { step: 2, state: 'done', detail: `✓ Top ${matched.length} candidates identified` });
    send('log',  { msg: `✓ Best match: ${matched[0]?.name} — score ${matched[0]?.matchScore}`, mtype: 'ok' });

    // ── Step 3: Conversational engagement ──────────────────────────────────
    send('step', { step: 3, state: 'running', detail: `Simulating recruiter conversations with top ${topN} candidates…` });
    send('log',  { msg: 'Starting Conversational Engagement Simulation…', mtype: '' });

    const engaged = await engageCandidates(jdParsed, matched, apiKey, topN);

    send('step', { step: 3, state: 'done', detail: `✓ Interest scored for ${Math.min(topN, matched.length)} candidates` });
    send('log',  { msg: '✓ All conversations simulated and interest scored', mtype: 'ok' });

    // ── Step 4: Rank & finalise ────────────────────────────────────────────
    send('step', { step: 4, state: 'running', detail: 'Computing combined scores (0.6×Match + 0.4×Interest)…' });
    send('log',  { msg: 'Running final ranking algorithm…', mtype: '' });

    const result   = rankShortlist(engaged, jdParsed, pool.length);
    const duration = Date.now() - t0;

    // Persist shortlist + conversations to DB
    ShortlistRepo.saveShortlist(runId, result.shortlist);
    RunRepo.complete(runId, duration);

    send('step',   { step: 4, state: 'done', detail: `✓ ${result.meta.shortlisted} candidates ranked and saved to DB` });
    send('log',    { msg: `✓ Top pick: ${result.meta.topCandidate} (score: ${result.meta.topScore})`, mtype: 'ok' });
    send('log',    { msg: `🎉 Pipeline complete in ${duration}ms — results saved to database`, mtype: 'ok' });
    send('result', { runId, shortlist: result.shortlist, meta: { ...result.meta, durationMs: duration }, jdParsed });
    send('done',   { durationMs: duration });

  } catch (err) {
    console.error('[Agent] Pipeline error:', err.message);
    if (runId) RunRepo.fail(runId, err.message);
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

// ── Parse JD only (Step 1, no DB write) ──────────────────────────────────────
router.post('/parse', async (req, res) => {
  const errors = validateAgentRequest(req.body);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
  try {
    const jdParsed = await parseJD(sanitiseString(req.body.jdText, 10000), req.body.apiKey.trim());
    res.json({ success: true, jdParsed });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Live interactive candidate chat (one turn at a time) ──────────────────────
router.post('/engage', async (req, res) => {
  const {
    runId, candidateId, candidateName, candidatePersonality,
    candidateBio, jdRole, history, userMessage, apiKey,
  } = req.body;

  if (!apiKey || !userMessage || !candidateName) {
    return res.status(400).json({ error: 'apiKey, candidateName, and userMessage are required' });
  }

  const systemPrompt = [
    `You are roleplaying as a job candidate named ${candidateName}.`,
    `Personality: ${candidatePersonality || 'professional and thoughtful'}.`,
    `Background: ${candidateBio || 'experienced professional'}.`,
    `A recruiter is reaching out about a ${jdRole || 'software engineering'} role.`,
    `Respond naturally in 2-4 sentences as ${candidateName}.`,
    `Be authentic — ask real questions, show real enthusiasm or hesitation based on your personality.`,
    `Do NOT break character. Do NOT reveal you are an AI.`,
  ].join('\n');

  const historyText = (history || [])
    .map((m) => `${m.role === 'recruiter' ? 'Recruiter' : candidateName}: ${m.text}`)
    .join('\n');

  const userPrompt = `${historyText ? historyText + '\n' : ''}Recruiter: ${userMessage}\n${candidateName}:`;

  try {
    const reply = await callGemini(apiKey, systemPrompt, userPrompt, {
      temperature:     0.85,
      maxOutputTokens: 300,
    });
    const replyText = reply.trim();

    // Persist live chat turns to DB if runId is provided
    if (runId && candidateId) {
      const turnBase = (history || []).length;
      ConversationRepo.saveLiveTurn({ runId, candidateId, turnIndex: turnBase,     role: 'recruiter', message: userMessage });
      ConversationRepo.saveLiveTurn({ runId, candidateId, turnIndex: turnBase + 1, role: 'candidate', message: replyText   });
    }

    res.json({ success: true, reply: replyText });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Upload CSV candidates → save to DB → return sessionId ────────────────────
router.post('/upload-csv', (req, res) => {
  const { csvText } = req.body;
  if (!csvText || typeof csvText !== 'string') {
    return res.status(400).json({ error: 'csvText (string) is required' });
  }
  try {
    const parsed = parseCsvCandidates(csvText);
    if (!parsed.length) {
      return res.status(400).json({ error: 'No valid candidates found. Check the CSV format.' });
    }
    const sessionId = uuid();
    const saved     = CandidateRepo.insertCSVBatch(parsed, sessionId);
    res.json({
      success:   true,
      sessionId,
      count:     saved.length,
      preview:   saved.slice(0, 5).map((c) => ({ name: c.name, role: c.role, skills: c.skills.slice(0, 3) })),
    });
  } catch (err) {
    res.status(400).json({ error: `CSV parse error: ${err.message}` });
  }
});

// ── Delete a CSV session from DB ──────────────────────────────────────────────
router.delete('/session/:sessionId', (req, res) => {
  const deleted = CandidateRepo.deleteSession(req.params.sessionId);
  res.json({ success: true, deleted });
});

// ── Recent run history ────────────────────────────────────────────────────────
router.get('/runs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const runs  = RunRepo.getRecent(limit);
  res.json({ success: true, total: runs.length, runs });
});

// ── Get full result for one past run (from DB) ────────────────────────────────
router.get('/runs/:runId', (req, res) => {
  const run = RunRepo.getById(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const shortlist = ShortlistRepo.getByRun(req.params.runId);
  res.json({ success: true, run, shortlist });
});

module.exports = router;
