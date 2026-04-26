/**
 * Candidate API Routes — all reads from SQLite
 */
const express    = require('express');
const router     = express.Router();
const { CandidateRepo } = require('../db/repositories');
const samples    = require('../data/samples');

router.get('/summary', (req, res) => {
  const sessionId = req.query.session || null;
  res.json({ success: true, summary: CandidateRepo.getSummary(sessionId) });
});

router.get('/samples', (req, res) => {
  res.json({ success: true, samples: samples.getAll() });
});

router.get('/', (req, res) => {
  const { skill, location, remote, session } = req.query;
  let list = session ? CandidateRepo.getBySession(session) : CandidateRepo.getBuiltIn();

  if (skill)    list = list.filter(c => c.skills.some(s => s.toLowerCase().includes(skill.toLowerCase())));
  if (location) list = list.filter(c => c.location.toLowerCase().includes(location.toLowerCase()));
  if (remote !== undefined) list = list.filter(c => c.remote === (remote === 'true'));

  res.json({ success: true, total: list.length, candidates: list });
});

router.get('/:id', (req, res) => {
  const c = CandidateRepo.getById(req.params.id);
  if (!c) return res.status(404).json({ error: `Candidate ${req.params.id} not found` });
  res.json({ success: true, candidate: c });
});

module.exports = router;
