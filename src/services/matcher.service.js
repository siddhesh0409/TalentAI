/**
 * matcher.service.js — Candidate Matching Engine (Step 2)
 * Reads candidates from SQLite, scores them against the parsed JD via Gemini.
 */

const { callGeminiJSON } = require('./gemini.service');
const { CandidateRepo }  = require('../db/repositories');

const SYSTEM = `You are a senior technical recruiter. Score each candidate objectively against a job description.
Base every score on concrete evidence from the candidate's profile — skills listed, years of experience, company domain.`;

function buildPrompt(jdParsed, candidates) {
  const pool = candidates.map(c =>
    `[ID:${c.id}] ${c.name} | ${c.role} @ ${c.company} | ${c.exp}y exp | ` +
    `Skills: ${c.skills.join(', ')} | ${c.location} | Remote:${c.remote} | ` +
    `₹${c.salary || '?'}L | ${c.available}`
  ).join('\n');

  return `Score each of the following ${candidates.length} candidates against this job.

═══ JOB REQUIREMENTS ═══
Role:            ${jdParsed.role}
Seniority:       ${jdParsed.seniorityLevel}
Experience:      ${jdParsed.experience}
Required Skills: ${jdParsed.requiredSkills.join(', ')}
Nice to Have:    ${(jdParsed.niceToHaveSkills || []).join(', ') || 'none'}
Domain:          ${jdParsed.domain}
Location:        ${jdParsed.location} | Remote: ${jdParsed.remote}

═══ CANDIDATES ═══
${pool}

═══ SCORING RUBRIC (100 pts) ═══
- skills     (40 pts): overlap between required skills and candidate skills
- experience (25 pts): years and seniority level match
- domain     (20 pts): relevant industry/company background
- location   (15 pts): location match or remote compatibility

Return ONLY a JSON array of the TOP 8 candidates sorted by matchScore descending.
Use the exact ID values shown above in the [ID:...] tags.

[
  {
    "id": "<exact id from above>",
    "matchScore": <0-100>,
    "scoreBreakdown": { "skills": <0-40>, "experience": <0-25>, "domain": <0-20>, "location": <0-15> },
    "matchReason": "2-3 sentences citing specific skills and background",
    "matchedSkills": ["skill1", "skill2"],
    "missingSkills": ["gap1"],
    "redFlags": "any concern or null"
  }
]`;
}

/**
 * @param {object}      jdParsed
 * @param {string}      apiKey
 * @param {number}      topN         — max candidates to return
 * @param {string|null} csvSessionId — if set, uses CSV-uploaded candidates instead of built-in pool
 */
async function matchCandidates(jdParsed, apiKey, topN = 8, csvSessionId = null) {
  const pool = csvSessionId
    ? CandidateRepo.getBySession(csvSessionId)
    : CandidateRepo.getBuiltIn();

  if (!pool.length) {
    throw new Error('No candidates in database. Run npm start to seed, or upload a CSV.');
  }

  const results = await callGeminiJSON(apiKey, SYSTEM, buildPrompt(jdParsed, pool), {
    temperature:     0.3,
    maxOutputTokens: 2500,
  });

  if (!Array.isArray(results)) throw new Error('Matcher received non-array from Gemini');

  return results
    .slice(0, topN)
    .map((r) => {
      // Gemini may return id as number or string — normalise both
      const candidate = pool.find((c) => String(c.id) === String(r.id));
      if (!candidate) return null;
      return {
        ...candidate,
        matchScore:     Math.min(100, Math.max(0, Number(r.matchScore) || 0)),
        scoreBreakdown: r.scoreBreakdown || {},
        matchReason:    r.matchReason    || '',
        matchedSkills:  Array.isArray(r.matchedSkills) ? r.matchedSkills : [],
        missingSkills:  Array.isArray(r.missingSkills) ? r.missingSkills : [],
        redFlags:       r.redFlags || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = { matchCandidates };
